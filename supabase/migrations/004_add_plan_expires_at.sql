-- 004_add_plan_expires_at.sql
--
-- Adds plan_expires_at to profiles so that paid plans expire after their
-- billing period (30 days from admin verification). Previously
-- plan_status='active' lived forever, so a one-off manual payment granted
-- permanent access — this migration makes access time-bounded.
--
-- Behaviour:
--   - plan_expires_at IS NULL  → no expiry ever set (pre-migration rows, or
--                                 a comped/lifetime account the owner sets manually).
--                                 Download gate treats these as active.
--   - plan_expires_at > now()  → active, downloads allowed.
--   - plan_expires_at <= now() → expired, download gate drops them to the
--                                 "Activate your plan" screen (same flow as
--                                 a brand-new user who has never paid).
--
-- The column is purely informational at the DB level — enforcement happens
-- in the app (src/contexts/DownloadGateContext.tsx and
-- src/app/dashboard/page.tsx). No cron/trigger required.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

-- NOTE to owner: after running this, if you want to activate your own
-- account for a year, do:
--
--   UPDATE profiles
--   SET plan_status     = 'active',
--       plan            = 'max',
--       plan_expires_at = now() + interval '1 year'
--   WHERE email = 'cmulenga672@gmail.com';
