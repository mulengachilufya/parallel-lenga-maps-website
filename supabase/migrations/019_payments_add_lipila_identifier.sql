-- Add Lipila's card-collection identifier (e.g. LPLXC-20260205-100116-3102).
--
-- The card initiate response returns BOTH `referenceId` and a separate
-- `identifier`. The callback may key reconciliation off either one, so we
-- persist the identifier alongside lipila_reference and let the webhook match
-- against all three correlators (reference, lipila_reference, lipila_identifier).

alter table payments add column if not exists lipila_identifier text;
