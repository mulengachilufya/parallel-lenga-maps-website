# Project State — read this first

Bootstrap context for any Claude session picking up this project. Pairs with
`git log` (commit messages here are detailed and are the real changelog) and
the auto-memory at `~/.claude/.../memory/` (pending_setup.md especially).

## Stack
- Next.js (App Router) + TypeScript, Tailwind. Deployed on Vercel (Hobby).
- Supabase (auth + Postgres `profiles` and dataset tables). Cloudflare R2 for files.
- Payments: Lipila (mobile money + card via DPO). Email: SMTP (Namecheap
  Private Email) with Resend / Web3Forms fallback, see `src/lib/email.ts`.

## Conventions (match these)
- One focused commit per change, detailed body explaining WHY. Don't push
  unless asked; if two sessions share `main`, branch instead (see below).
- DB changes = numbered SQL files in `supabase/migrations/`. They do NOT
  auto-apply; the human runs them in the Supabase SQL editor.
- External services called over `fetch` (no SDK deps) where practical.
- Email/notifications are best-effort and must never break the request.
- NO em dashes in any customer-facing copy (emails, UI). They read as an
  AI giveaway. Use commas / periods / colons.
- Lifecycle email sender is support@lengamaps.com (newsletter@ is reserved
  for the future newsletter product).

## Architecture quick map
- Trial/tier logic: `src/lib/pricing.ts` (getUserState, PLAN_ORDER,
  DATASET_MIN_TIER, TRIAL_DOWNLOAD_CAP=10, TRIAL_DURATION_MS=72h).
- Access gate (client): `src/contexts/DownloadGateContext.tsx`
  (checkAccess, openGate, consumeDownload). Dataset list components live in
  `src/components/*List.tsx` and MUST derive access from `checkAccess(slug)`,
  never from a prop (that bug bit us, see commit "download buttons read live
  access").
- Access gate (server): `src/lib/dataset-access.ts` callerCanDownloadDataset.
  Per-dataset routes under `src/app/api/<dataset>/route.ts` attach a
  presigned R2 `download_url` only if the caller passes the gate.
- Download cap: `src/app/api/usage/consume-download/route.ts`. Single
  profile counter `trial_downloads_used` = SUM TOTAL across all datasets.
  Hitting 10/10 sends the cap email.
- Emails: `src/lib/email.ts` (welcome, trialEnded, trialCap, nudge).
  Welcome fires from `src/app/api/account/init-profile/route.ts`.
  Time-based ones (trial-ended, dormant nudge) from
  `src/app/api/cron/lifecycle-emails/route.ts` (daily). Renewal reminders +
  expiry sweep: `src/app/api/cron/renewal-reminders/route.ts`.
- Payments: `src/app/api/payments/*`. Card flow needs the nested Lipila
  body (customerInfo + collectionRequest), ZMW, ISO-2 country.
- TEAM TIER ("For Project Teams and Businesses" / internal "Lenga for
  Projects" / route `/projects` — three names, intentional, don't unify):
  quote-based per-seat, plan slug `team`, NEVER purchasable via checkout
  (SELF_SERVE_PLAN_ORDER guards every purchase surface; legacy `enterprise`
  delisted but kept in types). Shared logic `src/lib/teams.ts`. Quote flow:
  `/projects` → `/api/quotes` → `quote_requests` + founder email →
  `/admin/quotes` pipeline. Orgs/seats: `organizations`,
  `organization_members` (unique user_id = one org per user, seat-cap
  trigger), `organization_invites`; provision via `/admin/organizations`
  (sets owner profile plan='team'). Workspace: `/team` (+`/team/join`),
  data from `/api/team*`. Download ledger: `download_events`, written
  best-effort by consume-download (CRS/format enriched from
  teams.ts DATASET_META). Public API is TEAM-ONLY now (Max lost apiAccess):
  org-membership gate + per-minute rate limit (bump_rate_counter RPC,
  organizations.api_rate_per_min) in `src/lib/api-auth.ts`.

## Done recently (this session, newest last — see git log for full detail)
- Security/logic: webhook signature enforcement, pending_plan (no downgrade
  on upgrade submit), middleware auth redirects, gate refresh, correct tier
  gates on protected-areas/population/roads/soil, dataset sort by tier.
- Trial: 10-download cap (sum total), cap email at 10/10.
- Emails: welcome / trial-ended / dormant-nudge / trial-cap, SMTP via
  Namecheap, first-run nudge guard.
- Design: editorial dataset cards reverted, then subtle pass (line icons,
  richer jewel-tone accents), 3D Africa spinning globe, orbit/ground story
  section on landing, ground-story photo.
- Fixed: download buttons labelled "Upgrade" for trial/paid/enterprise
  because 4 list components read a dead `hasAccess` prop instead of the
  live gate.

## Pending manual setup (BLOCKS features until done — also in memory)
- Migrations 020–023 (dataset_bundles, teams/quotes/downloads, function
  hardening, team plan-check + founder flip) were applied DIRECTLY to prod
  via Supabase MCP on 2026-06-13 — already live, do not re-run. 014–018 were
  applied earlier. Founder profile is now plan='team', owner of the
  "Lenga Maps" org (1 seat); the legacy 'enterprise' slug has zero rows but
  stays in code.
- Vercel env: LIPILA_WEBHOOK_SECRET, CRON_SECRET, and email transport
  (SMTP_HOST/PORT/USER/PASS/FROM = support@lengamaps.com, EMAIL_REPLY_TO).
- Lipila/DPO: enable Visa/Mastercard card acceptance; fix merchant name
  ("Gari"/Hobbiton -> Lenga Maps) and category ("Insurance Services").
- Namecheap Private Email: enable DKIM + SPF for lengamaps.com.

## Currently mid-stream
User is walking the full user-experience flow with test accounts and
reporting bugs point by point. Keep that flow in the original chat. Other
unrelated issues can be worked in a parallel session/branch.
