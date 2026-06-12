-- 022_harden_team_functions.sql
--
-- Supabase security-advisor follow-up to 021: Postgres grants EXECUTE on new
-- functions to PUBLIC by default, which exposed the SECURITY DEFINER team
-- functions via /rest/v1/rpc/*. Lock each down to exactly who needs it.
--
-- RUN ONCE in: Supabase Dashboard → SQL Editor (already applied to prod
-- 2026-06-13 via MCP).

revoke all on function public.bump_rate_counter(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.bump_rate_counter(uuid, timestamptz) to service_role;

revoke all on function public.enforce_seat_cap() from public, anon, authenticated;
revoke all on function public.sync_profile_org() from public, anon, authenticated;

-- current_org_id stays executable by authenticated: RLS policies evaluate it
-- with the querying user's privileges, and it only ever returns the caller's
-- own org id.
revoke all on function public.current_org_id() from public, anon;
grant execute on function public.current_org_id() to authenticated, service_role;
