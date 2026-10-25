-- 058_email_scan.sql
--
-- The company email finder (src/lib/sales/find-emails.ts) reads each
-- prospect's own website for a published general inbox. These record that
-- an organisation was checked, so each one is read once, and what was found.

alter table sales_accounts add column if not exists email_scan_at   timestamptz;
alter table sales_accounts add column if not exists email_scan_note text;
