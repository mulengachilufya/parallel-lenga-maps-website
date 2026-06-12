-- 023_allow_team_plan.sql
--
-- profiles_plan_check predates the team tier and rejected plan='team'.
-- Extend the allowed set and complete the founder's enterprise -> team flip
-- (org + owner seat were created in 021; scripts/finalize-enterprise-
-- migration.sql was blocked by this constraint).
--
-- Applied to prod 2026-06-13 via Supabase MCP — do not re-run blindly.

alter table profiles drop constraint profiles_plan_check;
alter table profiles add constraint profiles_plan_check
  check (plan = any (array['starter'::text, 'pro'::text, 'max'::text, 'enterprise'::text, 'team'::text]) or plan is null);

update profiles
set    plan = 'team'
where  plan = 'enterprise'
  and  plan_status = 'active'
  and  org_id is not null;
