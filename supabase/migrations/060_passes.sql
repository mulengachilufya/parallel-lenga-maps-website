-- 060_passes.sql
--
-- Pricing 2026-11. The Individual plan becomes a time PASS: $5 a month for
-- every dataset, sold as 1, 6 or 12 months (src/lib/pricing.ts, PASSES).
--
--   manual_payments.product  now also allows 'pass_1m', 'pass_6m', 'pass_12m'.
--                            'licence' and 'updates' stay allowed so payments
--                            submitted under the old once-off model can still
--                            be approved, and old rows stay valid.
--
-- No change to profiles: a pass is stored in the same place every
-- time-limited plan already uses, profiles.plan_expires_at. Accounts with
-- plan_expires_at = null keep access for good (grandfathered).
--
-- RUN ONCE in: Supabase Dashboard -> SQL Editor (or supabase db push).
-- Run it BEFORE deploying the code, otherwise pass payments will be rejected
-- by the check constraint.

alter table manual_payments drop constraint if exists manual_payments_product_check;
alter table manual_payments add constraint manual_payments_product_check
  check (product is null or product in ('licence', 'updates', 'pass_1m', 'pass_6m', 'pass_12m'));
