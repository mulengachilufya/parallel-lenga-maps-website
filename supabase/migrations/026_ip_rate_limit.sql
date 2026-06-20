-- 026_ip_rate_limit.sql
--
-- Per-IP fixed-window rate limiting for PUBLIC, unauthenticated POST
-- endpoints (/api/quotes, /api/newsletter/subscribe). Those have only a
-- honeypot today; a script could spam quote_requests / newsletter_subscribers.
--
-- Mirrors the team-API limiter (bump_rate_counter, migration 021) but keys on
-- an arbitrary TEXT bucket (e.g. 'quotes:203.0.113.5') instead of a uuid, so
-- the window length can vary per endpoint and the same machinery serves any
-- future public form.
--
-- RUN ONCE in: Supabase Dashboard → SQL Editor (applied to prod 2026-06-19
-- via Supabase MCP — do not re-run blindly).

create table if not exists ip_rate_counters (
  bucket       text        not null,   -- '<prefix>:<ip>', e.g. 'quotes:1.2.3.4'
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket, window_start)
);

alter table ip_rate_counters enable row level security;
-- No policy on purpose: the table is touched only by the service role via
-- the function below (which bypasses RLS as SECURITY DEFINER).

-- Atomic increment-and-read for the current window. Opportunistically GCs
-- windows older than 1 hour so the table stays tiny.
create or replace function public.bump_ip_rate_counter(p_bucket text, p_window timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into ip_rate_counters (bucket, window_start, count)
  values (p_bucket, p_window, 1)
  on conflict (bucket, window_start)
  do update set count = ip_rate_counters.count + 1
  returning count into new_count;

  delete from ip_rate_counters where window_start < now() - interval '1 hour';

  return new_count;
end;
$$;

-- Server-only: the public anon/authenticated roles must never call this
-- (they could otherwise inflate another IP's counter, or probe it).
revoke all on function public.bump_ip_rate_counter(text, timestamptz) from public, anon, authenticated;
grant execute on function public.bump_ip_rate_counter(text, timestamptz) to service_role;
