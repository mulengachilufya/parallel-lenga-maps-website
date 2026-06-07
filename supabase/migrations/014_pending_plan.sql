-- Pending plan column — prevents downgrade on manual-payment submission.
--
-- Before: submitting a manual payment for an upgrade overwrote `plan` with
-- the new tier and set `plan_status = 'pending'`. While admin verification
-- was in flight (could be hours), getUserState() returned the new plan but
-- canAccessFiles() failed because status wasn't 'active' — so a paying Pro
-- user submitting for Max lost Pro access until admin clicked "verify".
--
-- After: manual payment writes the requested tier into `pending_plan` and
-- leaves `plan` / `plan_status` untouched. The admin verify route promotes
-- pending_plan → plan and sets status = 'active' atomically. The user keeps
-- their existing access throughout.

alter table profiles
  add column if not exists pending_plan text;

comment on column profiles.pending_plan is
  'Requested plan tier awaiting admin verification of manual payment. NULL means no pending request. Promoted to `plan` when admin verifies, cleared on reject.';
