-- 003_add_plan_status.sql
--
-- Adds plan_status to the profiles table to decouple "what plan did you
-- select" from "have you actually paid and been verified".
--
-- Values:
--   'free'     default — user has an account but never paid (or payment failed).
--                        Cannot download anything.
--   'pending'  user submitted a manual payment screenshot, awaiting admin review.
--                        Cannot download yet.
--   'active'   admin verified payment — their `plan` column now grants
--                        download access according to the tier it names.
--
-- Everyone currently in the table is retro-assigned 'free' — existing accounts
-- were being treated as paid Basic users even if they never paid, which was
-- the bug we are fixing. After running this migration, YOU (the owner) should
-- manually flip your own test account with:
--
--   UPDATE profiles SET plan_status = 'active', plan = 'max' WHERE email = 'you@example.com';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'free';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_status_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_status_check
  CHECK (plan_status IN ('free', 'pending', 'active'));

-- Anyone already in the table becomes 'free' (no grandfathered access).
UPDATE profiles SET plan_status = 'free' WHERE plan_status IS NULL;
