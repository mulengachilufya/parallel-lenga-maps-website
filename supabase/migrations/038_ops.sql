-- 038_ops.sql
--
-- Operations: the owner's problem log, audit trail and site switches.
--
--   ops_events    Everything that went wrong (or is worth knowing), in one
--                 place. Repeats of the same problem are folded into one row
--                 (fingerprint) with a count, so the log stays readable.
--   ops_audit     Every action taken from the ops console or the emergency
--                 tools: who, what, to whom, when. Append-only.
--   ops_settings  Site switches the owner can flip without a deploy: the
--                 announcement banner and maintenance mode.
--   ops_cron_runs When each scheduled job last ran and whether it worked.
--
-- All four are service-role only (RLS on, no policies). They are read and
-- written through /api/ops/* and the emergency tools, never by browsers.
--
-- Applied to prod 2026-09-27 via Supabase MCP.

create table if not exists ops_events (
  id            bigserial primary key,
  fingerprint   text not null,
  level         text not null check (level in ('info', 'warn', 'error', 'critical')),
  area          text not null,
  code          text not null,
  message       text not null,
  detail        jsonb not null default '{}'::jsonb,
  count         integer not null default 1,
  first_at      timestamptz not null default now(),
  last_at       timestamptz not null default now(),
  alerted_at    timestamptz,
  resolved_at   timestamptz,
  resolved_by   text
);
create index if not exists ops_events_open_idx on ops_events (last_at desc) where resolved_at is null;
create unique index if not exists ops_events_fp_open on ops_events (fingerprint) where resolved_at is null;
alter table ops_events enable row level security;

-- Log one occurrence: folds into the open row with the same fingerprint.
-- Returns the row so the caller can decide whether to send an alert.
create or replace function public.ops_log(
  p_fingerprint text, p_level text, p_area text, p_code text, p_message text, p_detail jsonb
) returns ops_events
language plpgsql security definer set search_path = public
as $$
declare r ops_events;
begin
  insert into ops_events (fingerprint, level, area, code, message, detail)
  values (p_fingerprint, p_level, p_area, p_code, left(p_message, 1000), coalesce(p_detail, '{}'::jsonb))
  on conflict (fingerprint) where resolved_at is null do update
    set count = ops_events.count + 1,
        last_at = now(),
        message = excluded.message,
        detail = excluded.detail,
        level = case
          when excluded.level = 'critical' or ops_events.level = 'critical' then 'critical'
          when excluded.level = 'error' or ops_events.level = 'error' then 'error'
          when excluded.level = 'warn' or ops_events.level = 'warn' then 'warn'
          else 'info' end
  returning * into r;
  -- Housekeeping: resolved rows older than 90 days go.
  delete from ops_events where resolved_at < now() - interval '90 days';
  return r;
end $$;
revoke all on function public.ops_log(text, text, text, text, text, jsonb) from public, anon, authenticated;

create table if not exists ops_audit (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  actor   text not null,
  via     text not null check (via in ('console', 'emergency-key', 'github', 'cli', 'system')),
  action  text not null,
  target  text,
  detail  jsonb not null default '{}'::jsonb,
  ok      boolean not null default true
);
create index if not exists ops_audit_at_idx on ops_audit (at desc);
alter table ops_audit enable row level security;

create table if not exists ops_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table ops_settings enable row level security;

create table if not exists ops_cron_runs (
  job          text primary key,
  last_run_at  timestamptz not null default now(),
  ok           boolean not null,
  summary      jsonb not null default '{}'::jsonb
);
alter table ops_cron_runs enable row level security;
