-- 030_security_hardening.sql
--
-- Fixes from the Supabase security advisor. Applied to prod 2026-09-26 via
-- Supabase MCP.
--
-- user_states: trial-era view, unused by the app, SECURITY DEFINER and
-- readable by anon, so it exposed every profile's email and plan.
drop view if exists public.user_states;

-- Trigger / admin helpers must not be callable over the REST API.
-- Triggers still fire: EXECUTE is only checked when the trigger is created.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Pin search_path on functions that lacked it.
alter function public.handle_new_user()   set search_path = public;
alter function public.set_updated_at()    set search_path = public;
alter function public.update_updated_at() set search_path = public;
