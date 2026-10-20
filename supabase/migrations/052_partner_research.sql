-- 052_partner_research.sql
--
-- Partnerships stand on their own at /admin/partners, with their own
-- research: why this partner, in a few lines, and where that came from.
-- (Email drafts and the LinkedIn track reuse sales_drafts and
-- sales_linkedin, filtered by sales_accounts.pipeline = 'partner'.)

alter table sales_partnerships add column if not exists research text;
alter table sales_partnerships add column if not exists sources jsonb not null default '[]'::jsonb;  -- [{ label, url }]
