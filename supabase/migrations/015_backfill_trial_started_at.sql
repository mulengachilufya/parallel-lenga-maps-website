-- Backfill trial_started_at for profiles created in the last 60 days that
-- never received one. Symptoms in the wild: users who signed up via the
-- homepage InlineSignup before commit 1614870 had `plan: 'basic'` (invalid)
-- in user_metadata and no trial_started_at, so init-profile couldn't seed
-- the trial from metadata. They landed as 'free' instead of 'free_trial'
-- and saw a paywall they should never have hit.
--
-- We use created_at so that the trial starts when they signed up — not
-- when this migration runs. If created_at is older than the trial window,
-- the trial is effectively already expired (correct behavior; we're not
-- granting bonus trial time).
--
-- 60 days is the cutoff so we don't grant trials to long-dormant accounts.

update profiles
   set trial_started_at = created_at
 where trial_started_at is null
   and created_at >= now() - interval '60 days';
