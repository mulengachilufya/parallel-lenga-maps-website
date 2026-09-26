-- 033_access_periods.sql
--
-- Paid plans now last 3 months per payment (was: once-off, permanent).
--
--   profiles.plan_expires_at          already exists. null = permanent; every
--                                     account active before this migration
--                                     keeps null (grandfathered).
--   profiles.expiry_reminder_sent_at  one "ends in a week" email per period;
--                                     cleared when a payment extends access.
--   organizations.access_expires_at   the team's paid period; members' own
--                                     plan_expires_at mirrors it. null =
--                                     permanent (existing teams).
--   organizations.expiry_notice_sent  last expiry email sent to the owner for
--                                     the current period: 'reminder' | 'ended'.
--
-- Applied to prod 2026-09-26 via Supabase MCP.

alter table profiles
  add column if not exists expiry_reminder_sent_at timestamptz;

alter table organizations
  add column if not exists access_expires_at  timestamptz,
  add column if not exists expiry_notice_sent text
    check (expiry_notice_sent in ('reminder', 'ended'));

create index if not exists profiles_plan_expires_idx
  on profiles (plan_expires_at) where plan_status = 'active' and plan_expires_at is not null;
