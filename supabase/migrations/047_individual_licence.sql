-- 047_individual_licence.sql
--
-- Pricing 2026-10. The Individual plan becomes a one-off licence: pay once,
-- keep the catalogue for good, and get every dataset added in the next
-- UPDATE_MONTHS (src/lib/pricing.ts). After that, an updates renewal adds
-- another UPDATE_MONTHS.
--
--   profiles.updates_until   Individual licence holders: datasets added on
--                            or before this date are theirs. null = no
--                            limit (grandfathered and time-limited plans).
--   manual_payments.product  'licence' or 'updates' for Individual
--                            payments; null for older rows and teams.

alter table profiles add column if not exists updates_until timestamptz;

alter table manual_payments add column if not exists product text;
alter table manual_payments drop constraint if exists manual_payments_product_check;
alter table manual_payments add constraint manual_payments_product_check
  check (product is null or product in ('licence', 'updates'));
