-- 007_make_plan_nullable.sql
--
-- Background:
--   Until now, profiles.plan had DEFAULT 'basic' (and the handle_new_user
--   trigger respected that). Every fresh signup got auto-stamped as Basic
--   the moment they hit the dashboard, which was misleading: the user had
--   never picked Basic, never paid for it, but the dashboard happily
--   displayed "Current Plan: Basic — K25/month" anyway. Prospects were
--   confused; we were losing trust.
--
-- After this migration:
--   - New signups land with plan = NULL (no plan picked yet),
--     plan_status = 'free' (default).
--   - Existing free users (plan_status='free' AND plan='basic') get
--     plan = NULL too — they never paid for Basic, so the dashboard now
--     correctly shows "No active plan" until they choose & pay.
--   - Pending users (plan_status='pending') keep whatever plan they
--     submitted payment for — that field IS the plan they chose.
--   - Active users (plan_status='active') are untouched — they paid,
--     they keep their plan label.
--
-- Idempotent: run as many times as you like. Each step is guarded.

-- ── 1. Allow plan to be NULL ──────────────────────────────────────────────
ALTER TABLE profiles ALTER COLUMN plan DROP NOT NULL;

-- ── 2. Drop the 'basic' DEFAULT so new INSERTs don't auto-stamp it ────────
ALTER TABLE profiles ALTER COLUMN plan DROP DEFAULT;

-- ── 3. Loosen any existing CHECK constraint so NULL is allowed ────────────
-- (Drops a few common constraint names; harmless if none of them exist.)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_valid;
ALTER TABLE profiles ADD CONSTRAINT profiles_plan_check
  CHECK (plan IS NULL OR plan IN ('basic', 'pro', 'max'));

-- ── 4. Backfill: free users currently labelled 'basic' → NULL ─────────────
-- These are accounts that never paid for Basic; the label was just the
-- DB default. Pending and active users are untouched.
UPDATE profiles
SET plan = NULL
WHERE plan_status = 'free' AND plan = 'basic';
