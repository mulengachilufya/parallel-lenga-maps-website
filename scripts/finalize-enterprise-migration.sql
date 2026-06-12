-- finalize-enterprise-migration.sql
--
-- STEP 2 of the legacy-Enterprise retirement. Run ONLY after the application
-- deploy that understands plan='team' is live on Vercel (otherwise the
-- founder's account would resolve to 'free' in the old bundle's getUserState).
--
-- Migration 021 already created the org + owner membership; this just flips
-- the plan column. Idempotent.

update profiles
set    plan = 'team'
where  plan = 'enterprise'
  and  plan_status = 'active'
  and  org_id is not null;
