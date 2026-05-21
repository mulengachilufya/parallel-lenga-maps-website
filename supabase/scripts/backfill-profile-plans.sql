-- backfill-profile-plans.sql
--
-- One-shot data fix to clean up profiles created BEFORE the
-- /api/account/init-profile sync was added.
--
-- Background:
--   When /signup ran, it stashed the user's chosen plan + account_type into
--   auth.users.raw_user_meta_data. The handle_new_user trigger then created
--   a profiles row using only the column defaults (plan='basic',
--   account_type='student'), so anyone who picked Pro Student or Max
--   Professional ended up labelled as Basic Student in the dashboard.
--
-- What this does:
--   For every existing profile, copy the user's stated plan and account_type
--   from raw_user_meta_data — UNLESS that profile is currently 'active'
--   (a paid user we must NOT touch).
--
-- What this does NOT do:
--   - Does not touch plan_status or plan_expires_at. Paid users keep their
--     access exactly as-is.
--   - Does not grant downloads to anyone. Setting plan='pro' here only
--     changes the *displayed* tier; the download gate still requires
--     plan_status='active'.
--
-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1 — preview what would change. Run this first and eyeball the rows.
-- ─────────────────────────────────────────────────────────────────────────

SELECT
  p.id,
  p.email,
  p.plan          AS current_plan,
  u.raw_user_meta_data->>'plan'         AS metadata_plan,
  p.account_type  AS current_type,
  u.raw_user_meta_data->>'account_type' AS metadata_type,
  p.plan_status
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.plan_status != 'active'
  AND u.raw_user_meta_data->>'plan'         IN ('basic', 'pro', 'max')
  AND u.raw_user_meta_data->>'account_type' IN ('student', 'professional', 'business')
  AND (
        p.plan         IS DISTINCT FROM (u.raw_user_meta_data->>'plan')
     OR p.account_type IS DISTINCT FROM (u.raw_user_meta_data->>'account_type')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 2 — apply the fix. Only run after you've reviewed Step 1 results.
-- ─────────────────────────────────────────────────────────────────────────

UPDATE profiles p
SET
  plan         = u.raw_user_meta_data->>'plan',
  account_type = u.raw_user_meta_data->>'account_type'
FROM auth.users u
WHERE p.id = u.id
  AND p.plan_status != 'active'
  AND u.raw_user_meta_data->>'plan'         IN ('basic', 'pro', 'max')
  AND u.raw_user_meta_data->>'account_type' IN ('student', 'professional', 'business')
  AND (
        p.plan         IS DISTINCT FROM (u.raw_user_meta_data->>'plan')
     OR p.account_type IS DISTINCT FROM (u.raw_user_meta_data->>'account_type')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 3 — confirm. Should return 0 rows after the UPDATE has run.
-- ─────────────────────────────────────────────────────────────────────────

SELECT count(*) AS still_misaligned
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.plan_status != 'active'
  AND u.raw_user_meta_data->>'plan'         IN ('basic', 'pro', 'max')
  AND u.raw_user_meta_data->>'account_type' IN ('student', 'professional', 'business')
  AND (
        p.plan         IS DISTINCT FROM (u.raw_user_meta_data->>'plan')
     OR p.account_type IS DISTINCT FROM (u.raw_user_meta_data->>'account_type')
  );
