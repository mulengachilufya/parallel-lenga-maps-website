-- 029_once_off_plans.sql
--
-- Once-off pricing (2026-09): two plans, 'individual' ($100) and 'team'
-- (up to 4 seats $350, up to 12 seats $1,000), paid once, never expire.
-- Lipila and monthly billing are gone.
--
-- 1. Allow plan='individual'. Without this, approving a bank-transfer payment
--    fails: /api/admin/payments/verify writes plan='individual' and the old
--    constraint rejects it. Legacy slugs stay allowed so historical rows
--    (expired / never-activated accounts) remain valid; the app treats them
--    as no access.
--
-- 2. Grandfather every account that currently has access. Anyone with
--    plan_status='active' on a legacy monthly tier (starter / pro / max /
--    enterprise) becomes a permanent 'individual'. Team accounts stay 'team'.
--    Expiry is cleared for all active accounts: once-off access never ends.
--
-- 3. Pending requests on legacy tiers are re-pointed at 'individual' so an
--    admin approving them after this migration grants the new plan.
--
-- Applied to prod 2026-09-25 via Supabase MCP — do not re-run blindly.
-- (auto_renew_enabled from 013 does not exist in prod, so it is not touched.)
--
-- Originally: run once in the Supabase SQL editor. Wrapped in a transaction: if any
-- statement fails (e.g. manual_payments has a differently named constraint),
-- nothing is changed.

begin;

-- 1. Constraints ────────────────────────────────────────────────────────────
alter table profiles drop constraint if exists profiles_plan_check;
alter table profiles add constraint profiles_plan_check
  check (plan is null or plan = any (array[
    'individual', 'team',
    'starter', 'pro', 'max', 'enterprise'   -- legacy, read-only
  ]::text[]));

-- manual_payments was created outside the migrations folder and holds
-- historical rows with older plan slugs (e.g. 'basic'). NOT VALID enforces
-- the check on new and updated rows only, leaving that history untouched.
alter table manual_payments drop constraint if exists manual_payments_plan_check;
alter table manual_payments add constraint manual_payments_plan_check
  check (plan is null or plan = any (array[
    'individual', 'team',
    'starter', 'pro', 'max', 'enterprise'
  ]::text[])) not valid;

-- 2. Grandfather current customers ──────────────────────────────────────────
-- Preview before running:
--   select id, email, plan, plan_expires_at from profiles
--   where plan_status = 'active' order by plan;
update profiles
set    plan = 'individual'
where  plan_status = 'active'
  and  plan in ('starter', 'pro', 'max', 'enterprise');

update profiles
set    plan_expires_at = null
where  plan_status = 'active';

-- 3. Pending requests ───────────────────────────────────────────────────────
update profiles
set    pending_plan = 'individual'
where  pending_plan in ('starter', 'pro', 'max', 'enterprise');

update manual_payments
set    plan = 'individual'
where  status = 'pending'
  and  plan in ('starter', 'pro', 'max', 'enterprise');

commit;
