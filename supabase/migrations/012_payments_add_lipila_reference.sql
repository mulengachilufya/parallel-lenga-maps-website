-- Add Lipila's transaction reference column to the payments table.
-- Replaces lenco_reference (kept for historical rows, set to null going forward).

alter table payments add column if not exists lipila_reference text;
