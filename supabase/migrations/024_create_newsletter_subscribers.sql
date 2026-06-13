-- 024_create_newsletter_subscribers.sql
--
-- Newsletter sign-ups, initially from the landing-page pop-up. The `source`
-- column lets future touchpoints (blog, dataset pages, …) be attributed
-- without a schema change; `status` is here now so the Phase 2 unsubscribe
-- flow can land without one either. Phase 1 only stores the address — no
-- confirmation email is sent.
--
-- Security posture mirrors quote_requests (021): RLS is ON with NO public
-- policy. Writes go exclusively through the service-role API route
-- /api/newsletter/subscribe, which validates input first. We deliberately do
-- NOT add an anon INSERT policy: the public anon key ships in the client
-- bundle, so a public insert policy would let bots write straight to the
-- table and bypass server-side validation. The service role bypasses RLS, so
-- the route works with no policy at all; reads are server-side only.
--
-- Applied to prod 2026-06-13 via Supabase MCP — do not re-run blindly.

create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  subscribed_at timestamptz not null default now(),
  source text default 'landing_page_popup',
  status text not null default 'active'
    check (status in ('active', 'unsubscribed'))
);

alter table newsletter_subscribers enable row level security;
