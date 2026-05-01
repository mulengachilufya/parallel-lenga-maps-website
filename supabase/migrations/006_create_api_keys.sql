-- 006_create_api_keys.sql
--
-- Adds the api_keys table that backs the Business+API tier.
--
-- Why this exists:
--   The Business tier promises programmatic access (REST API). To honour that
--   we need long-lived bearer tokens scoped to a single user, that we can
--   revoke without nuking their session. Sessions are great for the dashboard
--   but useless for `curl` from a research script.
--
-- Storage model:
--   We never store the raw key — only its SHA-256 hash. The plaintext key is
--   shown to the user EXACTLY ONCE at creation time (copy-once UX, same as
--   GitHub PATs). After that we can only show a "last4" preview for visual
--   identification ("the key ending in ABCD").
--
-- Quota model (kept dead-simple for v1):
--   - requests_this_month  bumps on every successful API call
--   - egress_bytes_this_month  bumps when a download URL is signed
--   - last_used_at  for the dashboard
--   Reset is done by a monthly cron — not in scope for this migration.
--   Hard limits live in code (5_000 calls / 50 GB) so we can tune them
--   without a schema change.
--
-- RLS:
--   - Users can read/insert/delete their own keys via the dashboard (RLS).
--   - The bearer-auth middleware uses the service role key so it bypasses
--     RLS — it has to, because the request comes in with NO Supabase session.

create table if not exists api_keys (
  id                          uuid          primary key default gen_random_uuid(),
  user_id                     uuid          not null references auth.users(id) on delete cascade,
  key_hash                    text          not null unique,                 -- SHA-256 of plaintext key
  key_last4                   varchar(4)    not null,                        -- last 4 chars of plaintext, for the UI
  label                       varchar(100)  not null,                        -- "Production scraper", "Local dev", etc.
  scopes                      text[]        not null default array['datasets:read'],
  requests_this_month         integer       not null default 0,
  egress_bytes_this_month     bigint        not null default 0,
  last_used_at                timestamptz,
  created_at                  timestamptz   not null default now(),
  revoked_at                  timestamptz                                    -- null = active
);

create index if not exists api_keys_user_id_idx   on api_keys(user_id);
create index if not exists api_keys_key_hash_idx  on api_keys(key_hash);

alter table api_keys enable row level security;

-- Users can list their own keys
create policy "Users read own api keys"
  on api_keys for select
  to authenticated
  using (auth.uid() = user_id);

-- Users can create keys for themselves
create policy "Users insert own api keys"
  on api_keys for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can revoke their own keys (we soft-delete via revoked_at; this allows
-- the dashboard to update revoked_at). Hard-delete uses the service role.
create policy "Users update own api keys"
  on api_keys for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
