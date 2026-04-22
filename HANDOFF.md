# Lenga Maps — Engineering Handoff

_Last updated: 2026-04-22_

This doc covers the work done in the most recent series of sessions and hands
off cleanly so another engineer can pick up without context loss.

---

## 1. What this product is

**Lenga Maps** — an African GIS data platform. Users create an account, pay
for a plan (Basic / Pro / Max), and download professional-grade GIS datasets
(admin boundaries, rivers, rainfall, population, etc.) covering all 54 African
countries.

- Stack: **Next.js 14.2.35** (App Router, TypeScript strict), **Supabase** (auth + postgres), **Cloudflare R2** (object storage for GIS files + payment screenshots), **Vercel** (deploy).
- Auth & profiles: `profiles` table keyed to `auth.users(id)`.
- GIS data served via signed R2 URLs, gated by plan tier.
- Payments: **manual** MTN / Airtel Mobile Money only (Lenco integration was planned but delayed; manual flow replaces it for now).
- Notifications: **Web3Forms** for email, **CallMeBot** (free) for WhatsApp.

---

## 2. Agenda / purpose of recent changes

The user flagged a string of real problems that, together, amounted to a
rewrite of the plan + payment + gating logic. Goals, in priority order:

1. **Let anyone browse datasets freely** — no login required to open a dataset, see its countries, see its files. Auth/payment gate fires **only on the Download click**, never before.
2. **Cascade the download gate correctly.** Three distinct cases that used to collapse into one:
   - No session → "Sign in / create free account"
   - Session but no active paid plan → "Activate your plan" (go to payment)
   - Active plan but wrong tier → "Upgrade to higher plan"
3. **Stop granting free Basic plan access to every new signup.** Previously, signup wrote `plan: 'basic'` to the profile, and the gate checked plan alone — so everyone got Basic files without paying. Now plan and payment-status are decoupled.
4. **Make the home page dataset cards clickable** (they used to be display-only flip cards).
5. **Fix dead navigation**: back-to-home on login/signup, back-to-dashboard on payment, proper redirects after login/signup (not to the cold `/datasets` marketing page).
6. **Drop forced payment after signup.** Let users sign up, browse free datasets, and pay only when they hit a paywall they care about.
7. **Build the admin verification loop** so that when a customer submits a manual payment screenshot, the owner can approve it with one click and the customer's plan flips to active automatically.
8. **Replace GIS-Consulting + Flutterwave branding** across the site — the business pivoted away from consulting, and Flutterwave is no longer in use.
9. **Fix smaller papercuts**: placeholder SVG logo on login/signup, blue tint over the elephant on /about-us, etc.

---

## 3. Architecture now (after these changes)

### 3.1 The plan model — the important bit

| Field                  | Meaning                                                                          |
|------------------------|----------------------------------------------------------------------------------|
| `profiles.plan`        | The plan the user **selected** (`basic`, `pro`, `max`). Default `basic`.         |
| `profiles.plan_status` | Whether they've **actually paid** and been verified: `free` / `pending` / `active`. **NEW.** |
| `profiles.account_type`| `student` / `professional` / `business`. Drives pricing in `PLAN_PRICING`.       |

`plan` alone means nothing. A user only gets download access when
`plan_status === 'active'`. That flag flips only when an admin verifies a
payment in the admin UI.

State transitions:

```
           signup                 submit manual payment      admin approves
(no user) ───────> plan_status='free' ────> plan_status='pending' ────> plan_status='active'
                                                                           │
                                                                  admin rejects
                                                                           ▼
                                                              plan_status='free' (resubmit)
```

### 3.2 The download gate — `src/contexts/DownloadGateContext.tsx`

Single source of truth for all download actions. Every list component
(`RiversList`, `PopulationList`, `AdminBoundariesList`, etc.) imports
`useDownloadGate()` and wraps their download click with
`guardDownload(requiredTier, () => actualDownload())`.

Cascade inside `guardDownload`:

```ts
if (!gateUser)                               → modal: 'signup'
if (gateUser.planStatus !== 'active')        → modal: 'pay'      (or 'pending' variant)
if (TIER_ORDER[plan] < TIER_ORDER[required]) → modal: 'upgrade'
else                                         → run the download fn
```

All three modals are rendered inside the same provider, styled consistently,
and CTAs point at the right next step (`/signup`, `/dashboard/payment?plan=X`,
`/pricing`).

### 3.3 Manual payment flow

1. User goes to `/dashboard/payment?plan=X&type=Y`.
2. `ManualPaymentFlow` component shows region picker (Zambian vs international), then per-method instructions (MTN `*303#` / Airtel `*115#`) with receiver number `+260 965 699 359` (MTN) and `+260 779 187 025` (Airtel), both registered to **Mulenga Chilufya**.
3. User pays via their phone, takes a screenshot, uploads it.
4. `POST /api/payments/manual` validates, uploads screenshot to R2 (`payment-screenshots/{userId}/{reference}.{ext}`), inserts `manual_payments` row with `status='pending'`, and sets `profiles.plan_status='pending'` + writes the requested plan.
5. Notifications fire (Web3Forms email to `lengamaps@gmail.com` + CallMeBot WhatsApp to `+260 965 699 359`) with a 7-day presigned screenshot URL.
6. Admin gets the ping, opens `/admin/payments`, reviews the screenshot, hits Approve.
7. `POST /api/admin/payments/verify` updates the payment row AND `profiles.plan_status='active'` AND emails the customer.
8. Customer's next download-click passes the gate.

### 3.4 Admin panel — `/admin/payments`

- Gated by `ADMIN_EMAILS` env var (comma-separated list). UI shows "Not authorised" if the logged-in user's email isn't on the list.
- Tabs: Pending / Verified / Rejected / All.
- Each card shows: reference, plan, amount, customer name/email, phone, txn ref, country, submit time, **screenshot preview**.
- Approve button: activates plan and emails customer.
- Reject button: opens a note field (reason is included in the customer email), flips `plan_status` back to `free` so they can resubmit.

---

## 4. File-by-file summary of changes (this sprint)

### Core logic

- **`src/lib/supabase.ts`** — added `PlanStatus` type (`free`|`pending`|`active`), added `plan_status` to `UserProfile`, added `LIVE_DATASET_ROUTES` shared map.
- **`src/contexts/DownloadGateContext.tsx`** — added `planStatus` to `DownloadUser`, added `'pay'` modal branch (with pending variant), rewrote `guardDownload` cascade, upgrade modal now links directly to `/dashboard/payment?plan=X` instead of `/pricing`.
- **`src/lib/admin.ts`** — `isAdminEmail()` helper reading `ADMIN_EMAILS` env var.

### API routes

- **`src/app/api/payments/manual/route.ts`** — after inserting `manual_payments`, also `UPDATE profiles SET plan, account_type, plan_status='pending' WHERE id=userId`.
- **`src/app/api/admin/payments/list/route.ts`** — NEW. GET with `?status=pending|verified|rejected|all`. Returns payments + 1-hour presigned screenshot URLs. Gated by `isAdminEmail`.
- **`src/app/api/admin/payments/verify/route.ts`** — NEW. POST `{reference, action:'verify'|'reject', note?}`. Verify → `manual_payments.status='verified'`, `profiles.plan=<requested>`, `plan_status='active'`, email customer. Reject → `status='rejected'`, `plan_status='free'`, email customer the reason.

### Pages

- **`src/app/admin/payments/page.tsx`** — NEW. Admin UI. Tabs, screenshot preview, approve/reject, reason field, customer details.
- **`src/app/login/page.tsx`** — default `nextPath` changed from `/datasets` to `/dashboard`; added back-to-home link; real logo (`/images/branding/logo.png`) replaces placeholder SVG; "Sign in to continue where you left off" if a `?next=` is present.
- **`src/app/signup/page.tsx`** — removed forced payment redirect (now goes to `/dashboard?welcome=new`), removed `pendingPayment`/`LencoPayWidget` dead code, added back-to-home link, real logo.
- **`src/app/dashboard/page.tsx`** — anonymous users **no longer redirected** (they can browse); first-time welcome banner shown when `?welcome=new`; **pending-payment banner** when `plan_status === 'pending'` so the status is surfaced outside the DownloadGate modal.
- **`src/app/dashboard/payment/page.tsx`** — added back-to-dashboard link; replaced placeholder SVG logo.
- **`src/app/page.tsx`** (home) — DatasetCards now pass `href` from `LIVE_DATASET_ROUTES`, removed Globe2 icon + GIS Consulting service card (grid now `lg:grid-cols-3`).
- **`src/app/pricing/page.tsx`** — replaced 3-card payment methods grid (MTN / Airtel / Bank Card) with 2-card (MTN / Airtel) using `MtnBadge`/`AirtelBadge`. Removed Flutterwave banner in favour of "Manual verification" explanation. **Plan CTAs are now auth-aware**: a signed-in user clicking `Basic` / `Pro` / `Max` goes directly to `/dashboard/payment?plan=X&type=Y` (skipping signup); a signed-out user still goes to `/signup?plan=X&type=Y`. Added a **"How to Pay"** section with the real MTN (`+260 965 699 359`) and Airtel (`+260 779 187 025`) numbers + receiver name + a region-toggled step-by-step guide, so instructions are discoverable publicly before anyone signs up.
- **`src/app/services/page.tsx`** — removed Flutterwave mention from step 3 copy.
- **`src/app/about-us/page.tsx`** — replaced `gradient-primary` hero overlay with `bg-navy` + a neutral black gradient so the elephant image shows through.

### Components

- **`src/components/DatasetCard.tsx`** — added optional `href` prop; when set, wraps the flip card in a `<Link>`.
- **`src/components/PaymentProviderIcons.tsx`** — NEW. Inline SVG `MtnBadge` (yellow) and `AirtelBadge` (red).
- **`src/components/ManualPaymentFlow.tsx`** — NEW. Full region picker → method picker → oversized payment instructions → screenshot upload → success screen.

### DB migrations / data

- **`supabase/migrations/003_add_plan_status.sql`** — NEW. Adds `plan_status` column with default `'free'`; backfills existing rows to `'free'`.
- **`scripts/prepare-population-settlements.py`** — Python pipeline: pulls HDX COD-AB (boundaries) + COD-PS (subnational population) for all 54 African countries, joins on PCODE, exports per-country shapefile zips to `output/PopulationSettlements/`.
- **`scripts/seed-population-settlements.ts`** — Uploads the zips to R2 and upserts `population_settlements_layers` rows in Supabase.
- **`src/app/api/population-settlements/route.ts`** — GET endpoint with presigned download URLs.
- **`src/components/PopulationList.tsx`** — NEW list component (Pro-gated).

### Config

- **`.env.local.example`** — added `NEXT_PUBLIC_WEB3FORMS_KEY`, `CALLMEBOT_WHATSAPP_PHONE`, `CALLMEBOT_WHATSAPP_APIKEY`, `ADMIN_EMAILS`.

---

## 5. Manual steps the owner still needs to do

These **cannot** be automated — they require access to the Supabase dashboard
and the Vercel project. They block full functionality of what we built:

### 5.1 Required (blocks all paid flow)

1. **Run the plan_status migration** in the Supabase SQL editor:
   ```sql
   -- contents of supabase/migrations/003_add_plan_status.sql
   ALTER TABLE profiles
     ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'free';
   UPDATE profiles SET plan_status = 'free' WHERE plan_status IS NULL;
   ```

2. **Create the `manual_payments` table** if it doesn't yet exist. Schema is in the header comment of `src/app/api/payments/manual/route.ts` (lines 29–55).

3. **Set env vars on Vercel** (Settings → Environment Variables, Production + Preview + Development, then Redeploy):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard.
   - `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`.
   - `NEXT_PUBLIC_WEB3FORMS_KEY` — for email.
   - `ADMIN_EMAILS` = `lengamaps@gmail.com,cmulenga672@gmail.com`.

4. **Activate the owner's own account** so they can test paid downloads:
   ```sql
   UPDATE profiles
   SET plan_status = 'active', plan = 'max'
   WHERE email = 'cmulenga672@gmail.com';
   ```

### 5.2 Optional

- **CallMeBot WhatsApp** — instructions in the `.env.local.example` header. One-time ~5-min setup. If left blank, email still fires.
- **Custom domain email** for customer notifications — Web3Forms sends from a shared sender; for polish, replace with a real SMTP integration later.

---

## 6. How to test the end-to-end flow

1. **Incognito**, visit the home page. Click any dataset card — you should land on `/dashboard?section=X` without a login prompt. See the countries, see the files, see the Download button. ✅
2. Click **Download** on a Basic-tier file. Modal: _"Sign in to download"_ with plan options. ✅
3. Click **Create Free Account**. Fill the form. You land on `/dashboard?welcome=new` with a _"You're on the free Basic plan"_ banner. ✅
4. Click **Download** again on any file. Modal: _"Activate your plan to download"_ — choose a plan → go to `/dashboard/payment`. ✅
5. Submit a fake payment (any screenshot). Page shows success with a reference ID. Your `profiles.plan_status` should now be `'pending'`.
6. Log in as an admin-allow-listed account (different browser/incognito). Go to `/admin/payments`. See the pending row, the screenshot preview. Click **Approve**. ✅
7. Back as the customer, refresh, click Download → it downloads. ✅
8. Test the upgrade path: set your plan to `basic`/`active` manually in SQL. Click a Pro-tier file. Modal: _"Pro plan required"_ → **Upgrade** → `/dashboard/payment?plan=pro` ✅

---

## 7. Next steps / known work

### Should-do soon

1. **Admin navigation entry.** There's currently no link to `/admin/payments` anywhere. Owner has to type the URL. Suggest: show an "Admin" menu item in the dashboard header when `isAdminEmail(session.email)` is true. Since `ADMIN_EMAILS` is server-side only, the cleanest implementation is a tiny `GET /api/admin/me` endpoint that returns `{ isAdmin: boolean }` and have the dashboard header call it.
2. ~~**Pending payment badge on the customer dashboard.**~~ ✅ Done — `src/app/dashboard/page.tsx` shows a yellow "Payment under review" banner when `plan_status === 'pending'`.
3. **Email verification UX.** Signup currently sends a confirmation email. Make sure the email template points to `https://lengamaps.com/auth/callback` (or equivalent) so the user lands back on the site, not a generic Supabase page. Re-check the Supabase Auth settings dashboard.
4. **Monthly billing.** Plans are currently one-off manual payments — `plan_status='active'` doesn't expire. Add a `plan_expires_at` column and either: (a) a cron that flips expired rows to `'free'`, or (b) compute `active` dynamically from `expires_at > now()`. Choose based on whether we want recurring billing or month-by-month manual renewals.
5. **Rate-limit the admin verify endpoint.** The manual submit endpoint has a 60-min / 3-pending rate limit. Admin verify has none — add a small sanity check (e.g. max N verifications per minute) to prevent accidental auto-scripts from flipping everyone to active.

### Could-do, not blocking

6. **Replace the placeholder SVG logo** across the rest of the site if any still exist. The login / signup / payment pages already use `/images/branding/logo.png`; check other header components too.
7. **Clickable dataset cards on `/datasets` page** — they already work via the separate LIVE_DATASETS map in that file. Refactor to use the shared `LIVE_DATASET_ROUTES` from `src/lib/supabase.ts` so we have a single source of truth.
8. **Replace manual payment with Lenco webhook** once Lenco integration unblocks. The `LencoPayWidget` component is still in the repo but unused — it can be revived and wired through `/api/payments/lenco-webhook` which will call the same "activate the plan" code path as the admin verify endpoint. Refactor that path into a shared helper (`activatePlan(userId, plan, accountType)`) when doing this so both the manual-admin path and the webhook call the same thing.
9. **Admin audit log.** Currently we have `manual_payments.verified_by` and `verified_at` but no separate audit trail. If fraud disputes arise, store a snapshot of the admin note + IP at verification time.
10. **Observability.** No logging stack yet. Every `console.error` should eventually go to Sentry / Logflare / etc. The current logs only show in Vercel's function logs.

### Bugs / small items spotted but not fixed

- The `Phone` icon is reused for the "Country" field in the admin payment card — cosmetic, should be a globe/map icon.
- `.env.local.example` default for `ADMIN_EMAILS` includes a placeholder that works locally but **must** be changed in production (it's committed — though the file is only an example, double-check no real key was ever committed).
- The sign-up success screen says "Click the link to activate your account" — worth double-checking the email template actually contains a working link (depends on Supabase Auth config).

---

## 8. Troubleshooting quick-reference

| Symptom                                              | Likely cause                                                                               | Fix                                                                                          |
|------------------------------------------------------|--------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| "Failed to fetch" on signup/login                    | Missing Supabase env vars on Vercel — `supabase.ts` falls back to a placeholder URL.        | Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel, redeploy.         |
| Clicking Download does nothing                       | `DownloadGateProvider` not wrapping the page, or `useDownloadGate` called above provider.   | Check `src/app/dashboard/layout.tsx` (or page) wraps children in `<DownloadGateProvider>`.    |
| Paid customer still sees "Activate your plan"        | `plan_status` not set to `'active'` in `profiles`.                                          | Owner: approve in `/admin/payments`; or run `UPDATE profiles SET plan_status='active' ...`. |
| Admin page says "Not authorised"                     | Your email isn't in `ADMIN_EMAILS`, or the env var isn't set on Vercel.                     | Add it, redeploy.                                                                            |
| Screenshot preview is broken in admin UI             | R2 presign failed (credentials wrong) or `NEXT_PUBLIC_` image domains not configured.      | Check `next.config.js` `images.remotePatterns` includes the R2 endpoint; check R2 env vars. |
| New signup auto-grants Basic plan                    | Migration `003_add_plan_status.sql` not run — existing + new users missing the column.      | Run the migration. Until then, `plan_status` defaults to `'free'` via the fallback in code, but only if the column exists. |

---

## 9. Current branch & commit state

- Branch: `main` (direct pushes, not gated by PR).
- Latest commit: `a172a69` — "add admin payment verification: list, approve, reject manual payments from /admin/payments".
- Recent commit trail (most recent first):
  - `a172a69` admin payment verification
  - `938ec71` plan_status gate, 3-branch cascade, clickable homepage cards
  - `c2e4914` real logo replaces placeholder SVG
  - `b9e94d9` UX flow fixes (signup/login redirects, back buttons, welcome banner)
  - `0c3afdf` manual payment system
  - `9ba49e8` remove blue tint from /about-us
  - `a00ecb0` fix deploy: silence unused-var lint
  - `c446126` population dataset pipeline, auth redirect fix, drop consulting
- All commits are co-authored with `Claude Opus 4.7 <noreply@anthropic.com>`.

---

## 10. Feedback memory

There's a user-preference memory at `~/.claude/projects/<this>/memory/feedback_commit_push_flow.md` that says: **after every verified fix on this project, commit and push to `main` without being asked**. The recent commit trail reflects this. Any engineer continuing this work should follow the same rhythm unless the user changes that preference.
