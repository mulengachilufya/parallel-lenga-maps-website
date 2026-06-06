-- Subscription lifecycle: managed renewal + cancellation.
--
-- We can't silently auto-charge cards on Lipila (no tokenization), so we
-- model the subscription ourselves: each profile has an explicit renewal
-- date, an auto-renew flag (the customer can switch off), a cancellation
-- timestamp, and the time we last reminded them to renew.

alter table profiles
  add column if not exists auto_renew_enabled boolean default true,
  add column if not exists cancelled_at timestamptz,
  add column if not exists renewal_reminded_at timestamptz;

-- Active subscribers waiting for renewal reminders.
create index if not exists idx_profiles_expiring_active
  on profiles (plan_expires_at)
  where plan_status = 'active';
