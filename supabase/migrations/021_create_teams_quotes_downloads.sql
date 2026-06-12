-- 021_create_teams_quotes_downloads.sql
--
-- "For Project Teams and Businesses" (internal: Lenga for Projects).
--
-- Four concerns in one migration because they ship as one feature:
--   1. quote_requests        — the quote form writes here; admin tracks status.
--   2. organizations + organization_members + organization_invites
--                            — per-seat team accounts. plan='team' on profiles.
--   3. download_events       — per-download record powering the shared team
--                              dashboard (who pulled what, where, when, CRS).
--   4. api_rate_counters     — fixed-window per-key rate limiting for the
--                              team-only public API.
--
-- Design notes:
--   * One org per user (UNIQUE on organization_members.user_id). Simplifies
--     RLS, the dashboard, and human reasoning. Revisit if a real customer
--     needs multi-org membership.
--   * Names/emails are DENORMALIZED onto members and download_events so the
--     team dashboard never needs cross-profile reads (profiles RLS stays
--     untouched). Service-role routes keep them in sync at write time.
--   * Seat cap is enforced by trigger (hard guarantee), with a friendlier
--     check in the API route (counts pending invites too).
--   * RLS: members read their own org's rows; ALL writes go through
--     service-role API routes. No public INSERT/UPDATE/DELETE policies.
--
-- RUN ONCE in: Supabase Dashboard → SQL Editor (or supabase db push).

-- ── 1. Quote requests ──────────────────────────────────────────────────────

create table if not exists quote_requests (
  id            uuid        primary key default gen_random_uuid(),
  org_name      text        not null,
  contact_name  text,
  email         text        not null,
  sector        text,                      -- mining|water|ngo|gov|research|other
  region        text,                      -- country / region of operation
  seats         integer,
  datasets_interest text,
  notes         text,
  status        text        not null default 'new'
                check (status in ('new','contacted','quoted','won','lost')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table quote_requests enable row level security;
-- No policies on purpose: the public form posts through a service-role API
-- route (validated + rate limited there); admin reads through the same.

-- ── 2. Organizations ───────────────────────────────────────────────────────

create table if not exists organizations (
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null,
  sector              text,
  region              text,
  operating_countries text[]      not null default '{}',  -- org-wide AOI filter
  seat_count          integer     not null default 3 check (seat_count > 0),
  status              text        not null default 'active'
                      check (status in ('active','suspended','cancelled')),
  contact_email       text,
  promo_emails        boolean     not null default true,   -- org-level marketing opt-in
  monthly_price_usd   numeric(10,2),                       -- quoted price, for admin reference
  api_rate_per_min    integer     not null default 60,     -- per-key fixed-window limit
  notes               text,
  created_at          timestamptz not null default now()
);

create table if not exists organization_members (
  org_id      uuid        not null references organizations(id) on delete cascade,
  user_id     uuid        not null references profiles(id)       on delete cascade,
  role        text        not null default 'member' check (role in ('owner','member')),
  member_name  text,   -- denormalized from profiles at write time
  member_email text,
  invited_at  timestamptz not null default now(),
  joined_at   timestamptz,
  primary key (org_id, user_id),
  unique (user_id)              -- one org per user
);

create table if not exists organization_invites (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references organizations(id) on delete cascade,
  email       text        not null,
  role        text        not null default 'member' check (role in ('owner','member')),
  token       uuid        not null default gen_random_uuid(),
  status      text        not null default 'pending'
              check (status in ('pending','accepted','revoked')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

-- One live invite per address per org.
create unique index if not exists organization_invites_pending_unique
  on organization_invites (org_id, lower(email)) where status = 'pending';

-- Denormalized org pointer on profiles (kept in sync by trigger below).
alter table profiles add column if not exists org_id uuid references organizations(id) on delete set null;

-- ── Helper: which org does the calling user belong to? ────────────────────
-- SECURITY DEFINER so RLS policies can use it without recursing into
-- organization_members' own policy.

create or replace function public.current_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from organization_members where user_id = auth.uid()
$$;

revoke all on function public.current_org_id() from anon;
grant execute on function public.current_org_id() to authenticated;

-- ── Trigger: hard seat cap ─────────────────────────────────────────────────

create or replace function public.enforce_seat_cap()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  seats integer;
  used  integer;
begin
  select seat_count into seats from organizations where id = new.org_id for update;
  select count(*)   into used  from organization_members where org_id = new.org_id;
  if used >= seats then
    raise exception 'seat limit reached (% of % seats used)', used, seats;
  end if;
  return new;
end;
$$;

drop trigger if exists organization_members_seat_cap on organization_members;
create trigger organization_members_seat_cap
  before insert on organization_members
  for each row execute function public.enforce_seat_cap();

-- ── Trigger: keep profiles.org_id in sync with membership ─────────────────

create or replace function public.sync_profile_org()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update profiles set org_id = new.org_id where id = new.user_id;
    return new;
  elsif tg_op = 'DELETE' then
    update profiles set org_id = null where id = old.user_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists organization_members_sync_profile on organization_members;
create trigger organization_members_sync_profile
  after insert or delete on organization_members
  for each row execute function public.sync_profile_org();

-- ── 3. Download events ─────────────────────────────────────────────────────
-- Written (best-effort) by /api/usage/consume-download on every successful
-- download. org_id is stamped at insert so team queries never need a join
-- through membership history.

create table if not exists download_events (
  id           bigint      generated always as identity primary key,
  user_id      uuid        references profiles(id) on delete set null,
  org_id       uuid        references organizations(id) on delete set null,
  user_name    text,   -- denormalized for the team activity feed
  user_email   text,
  dataset_slug text        not null,
  dataset_name text,
  country      text,
  epsg         text,   -- CRS as delivered, e.g. 'EPSG:4326'
  file_format  text,   -- e.g. 'Shapefile / GeoJSON', 'GeoTIFF'
  created_at   timestamptz not null default now()
);

create index if not exists download_events_org_idx  on download_events (org_id, created_at desc);
create index if not exists download_events_user_idx on download_events (user_id, created_at desc);
create index if not exists download_events_dup_idx  on download_events (org_id, dataset_slug, country);

-- ── 4. API rate counters (fixed window) ────────────────────────────────────

create table if not exists api_rate_counters (
  key_id       uuid        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (key_id, window_start)
);

-- Atomic increment-and-read for the current window. Also opportunistically
-- garbage-collects windows older than 2 hours (the table stays tiny).
create or replace function public.bump_rate_counter(p_key_id uuid, p_window timestamptz)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into api_rate_counters (key_id, window_start, count)
  values (p_key_id, p_window, 1)
  on conflict (key_id, window_start)
  do update set count = api_rate_counters.count + 1
  returning count into new_count;

  delete from api_rate_counters where window_start < now() - interval '2 hours';

  return new_count;
end;
$$;

revoke all on function public.bump_rate_counter(uuid, timestamptz) from anon, authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table organizations        enable row level security;
alter table organization_members enable row level security;
alter table organization_invites enable row level security;
alter table download_events      enable row level security;
alter table api_rate_counters    enable row level security;

-- Members can read their own org…
drop policy if exists org_member_read on organizations;
create policy org_member_read on organizations
  for select using (id = public.current_org_id());

-- …their teammates…
drop policy if exists org_members_read on organization_members;
create policy org_members_read on organization_members
  for select using (org_id = public.current_org_id());

-- …pending invites (team transparency)…
drop policy if exists org_invites_read on organization_invites;
create policy org_invites_read on organization_invites
  for select using (org_id = public.current_org_id());

-- …and the team's download history (plus their own personal history).
drop policy if exists download_events_read on download_events;
create policy download_events_read on download_events
  for select using (
    user_id = auth.uid()
    or (org_id is not null and org_id = public.current_org_id())
  );

-- No INSERT/UPDATE/DELETE policies anywhere: mutations are service-role only.
-- api_rate_counters has no policies at all: API-server internal.

-- ── Founder migration: legacy Enterprise → Lenga for Projects ──────────────
-- Exactly one active enterprise profile exists (the founder's admin account).
-- Give it an org + owner seat. The plan column flip (enterprise → team)
-- happens AFTER the application code that understands 'team' is deployed —
-- see scripts/finalize-enterprise-migration.sql.

do $$
declare
  p record;
  new_org uuid;
begin
  for p in
    select id, email, full_name from profiles
    where plan = 'enterprise' and plan_status = 'active' and org_id is null
  loop
    insert into organizations (name, sector, seat_count, status, contact_email, notes)
    values ('Lenga Maps', 'research', 1, 'active', p.email,
            'Founder account. Migrated from legacy flat-rate Enterprise tier 2026-06.')
    returning id into new_org;

    insert into organization_members (org_id, user_id, role, member_name, member_email, joined_at)
    values (new_org, p.id, 'owner', p.full_name, p.email, now());
  end loop;
end;
$$;
