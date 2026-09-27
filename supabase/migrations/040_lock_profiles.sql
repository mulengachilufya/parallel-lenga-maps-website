-- 040_lock_profiles.sql
--
-- Security fix. The "Users can update own profile" policy, together with the
-- default table grants, let any signed-in user change ANY column of their
-- own profile straight from the browser, including plan, plan_status and
-- plan_expires_at. Paid access could be granted to oneself with one API
-- call.
--
-- Nothing in the site writes profiles from the browser: every write goes
-- through a server route with the service role (init-profile, payments,
-- teams, admin, the daily job), and new rows come from the SECURITY DEFINER
-- signup trigger. So browsers lose write access to profiles entirely and
-- keep read access to their own row.
--
-- Applied to prod 2026-09-27 via Supabase MCP.

drop policy if exists "Users can update own profile" on public.profiles;
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
