-- 025_payments_add_usd_currency.sql
--
-- Cards are charged in USD directly (Lipila/3GDirectPay supports USD on the
-- card rail), so the payments table needs to record a USD amount and the
-- currency actually charged. Previously only amount_zmw existed, which forced
-- a USD->ZMW conversion on cards; the hosted page then re-converted ZMW->USD
-- at its own spread, turning a $5 plan into $5.21. Mobile money still settles
-- in ZMW (wallets hold Kwacha), so amount_zmw stays.
--
-- currency defaults to 'ZMW' so existing rows (all ZMW charges) stay accurate;
-- new card rows set currency='USD' + amount_usd explicitly.
--
-- Applied to prod 2026-06-18 via Supabase MCP — do not re-run blindly.

alter table payments
  add column if not exists amount_usd numeric,
  add column if not exists currency   text not null default 'ZMW';
