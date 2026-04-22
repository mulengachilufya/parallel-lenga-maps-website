# Lenga Maps — Engineering Handoff

_Last updated: 2026-04-22 (monthly expiry + admin link + auth callback + rate limit added)_

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
- **`supabase/migrations/004_add_plan_expires_at.sql`** — NEW. Adds `plan_expires_at timestamptz` (nullable). App treats `NULL` as no-expiry (lifetime), `> now()` as active, `<= now()` as expired.
- **`src/app/api/admin/me/route.ts`** — NEW. GET returns `{ isAdmin: boolean }` for the current session. Dashboard header uses this to decide whether to show the Admin link (ADMIN_EMAILS is server-only).
- **`src/app/auth/callback/route.ts`** — NEW. Handles Supabase email-confirmation links: exchanges the `?code=` for a session cookie, then redirects into the app. On failure sends the user to `/login?error=expired_link`.
- **`scripts/prepare-population-settlements.py`** — Python pipeline: pulls HDX COD-AB (boundaries) + COD-PS (subnational population) for all 54 African countries, joins on PCODE, exports per-country shapefile zips to `output/PopulationSettlements/`.
- **`scripts/seed-population-settlements.ts`** — Uploads the zips to R2 and upserts `population_settlements_layers` rows in Supabase.
- **`src/app/api/population-settlements/route.ts`** — GET endpoint with presigned download URLs.
- **`src/components/PopulationList.tsx`** — NEW list component (Pro-gated).

### Config

- **`.env.local.example`** — added `NEXT_PUBLIC_WEB3FORMS_KEY`, `CALLMEBOT_WHATSAPP_PHONE`, `CALLMEBOT_WHATSAPP_APIKEY`, `ADMIN_EMAILS`.

---

## 5. Manual steps the owner still needs to do

These **cannot** be automated — they require access to the Supabase dashboard
and the Vercel project. Until you do these, the paid flow is half-wired:
migrations missing means the app can't read/write `plan_status` or
`plan_expires_at`, env vars missing means the admin panel and emails don't
work.

Each subsection is **click-by-click**. Do them in the order given.

### 5.1 Run the two SQL migrations (Supabase)

Both migrations are idempotent — safe to re-run if you're unsure whether you ran them before.

1. Open [https://supabase.com](https://supabase.com) → sign in → pick the **lenga-maps** project.
2. In the left sidebar click **SQL Editor** → **+ New query**.
3. Paste and **Run** this (migration `003_add_plan_status.sql`):
   ```sql
   ALTER TABLE profiles
     ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'free';

   ALTER TABLE profiles
     DROP CONSTRAINT IF EXISTS profiles_plan_status_check;
   ALTER TABLE profiles
     ADD CONSTRAINT profiles_plan_status_check
     CHECK (plan_status IN ('free', 'pending', 'active'));

   UPDATE profiles SET plan_status = 'free' WHERE plan_status IS NULL;
   ```
4. **+ New query** again. Paste and **Run** this (migration `004_add_plan_expires_at.sql`):
   ```sql
   ALTER TABLE profiles
     ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;
   ```
5. Verify the columns exist: left sidebar → **Table Editor** → `profiles`. You should see both `plan_status` and `plan_expires_at` columns.

### 5.2 Create the `manual_payments` table (Supabase)

Only do this if it doesn't already exist (check the Table Editor first — if you already see `manual_payments` in the list, skip).

1. **SQL Editor** → **+ New query**. Paste and **Run**:
   ```sql
   CREATE TABLE IF NOT EXISTS manual_payments (
     id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     reference       text UNIQUE NOT NULL,
     user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     user_email      text NOT NULL,
     user_name       text,
     phone           text,
     country         text,
     plan            text NOT NULL,
     account_type    text NOT NULL,
     amount          numeric,
     currency        text,
     method          text NOT NULL,
     txn_ref         text,
     screenshot_key  text NOT NULL,
     status          text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'verified', 'rejected')),
     admin_note      text,
     verified_at     timestamptz,
     verified_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
     submitted_at    timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_manual_payments_status ON manual_payments(status);
   CREATE INDEX IF NOT EXISTS idx_manual_payments_user ON manual_payments(user_id);
   ```

### 5.3 Set environment variables on Vercel

1. Go to [https://vercel.com](https://vercel.com) → your team → the **lenga-maps-platform** project.
2. Click **Settings** (top nav) → **Environment Variables** (left sidebar).
3. For each var below, click **Add New**, paste the name + value, leave all three checkboxes ticked (Production, Preview, Development), click **Save**.

   | Name | Value / where to get it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon public` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key (**secret — never put in client code**) |
   | `CLOUDFLARE_R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → top-right account ID |
   | `CLOUDFLARE_R2_ACCESS_KEY_ID` | Cloudflare R2 → Manage R2 API Tokens → your token's key ID |
   | `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Cloudflare R2 → same token's secret |
   | `CLOUDFLARE_R2_BUCKET_NAME` | Name of your R2 bucket (the one storing GIS zips + screenshots) |
   | `NEXT_PUBLIC_WEB3FORMS_KEY` | [https://web3forms.com](https://web3forms.com) → sign up with `lengamaps@gmail.com` → copy the access key |
   | `ADMIN_EMAILS` | `lengamaps@gmail.com,cmulenga672@gmail.com` — comma-separated, no spaces |

4. After **all** vars are saved, go to **Deployments** (top nav) → find the latest deploy → click `...` → **Redeploy**. Vercel only picks up env changes on a fresh deploy.

### 5.4 Activate your own account for testing

Without this, even you get the paywall when you click Download.

1. Supabase → **SQL Editor** → **+ New query**.
2. Run:
   ```sql
   UPDATE profiles
   SET plan_status     = 'active',
       plan            = 'max',
       plan_expires_at = now() + interval '1 year'
   WHERE email = 'cmulenga672@gmail.com';
   ```
3. Log in to the site as that user → click any dataset → click any Download → the file should download without a modal.

### 5.5 Point the Supabase email template at `/auth/callback`

Otherwise new signups click the confirmation link and land on a bare Supabase page instead of your site.

1. Supabase → **Authentication** (left sidebar) → **Email Templates** → **Confirm signup**.
2. Find any line of the form `{{ .ConfirmationURL }}`. Above it, find **Redirect URL** — set it to `https://lengamaps.com/auth/callback`. (For local testing you can add `http://localhost:3000/auth/callback` to **URL Configuration → Additional Redirect URLs**.)
3. Do the same for the **Reset password** and **Magic link** templates if you use them.
4. Save.

### 5.6 Optional

- **CallMeBot WhatsApp** — one-time ~5-min setup per the `.env.local.example` header (message `+34 644 51 95 89` with `I allow callmebot to send me messages`, it replies with an API key). Set `CALLMEBOT_WHATSAPP_PHONE` and `CALLMEBOT_WHATSAPP_APIKEY` on Vercel. If left blank, email notifications still fire.
- **Custom domain email sender** — Web3Forms currently sends from a shared address. Swap to Resend / Postmark later for polish.

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

1. ~~**Admin navigation entry.**~~ ✅ Done — `/api/admin/me` endpoint added; dashboard header shows an "Admin" button when the current user is admin-allow-listed.
2. ~~**Pending payment badge on the customer dashboard.**~~ ✅ Done — `src/app/dashboard/page.tsx` shows a yellow "Payment under review" banner when `plan_status === 'pending'`.
3. ~~**Email verification UX.**~~ ✅ Done — `/auth/callback` route handles the Supabase confirmation code exchange and redirects into the app. Owner must still point the Supabase email template at `https://lengamaps.com/auth/callback` (see §5.5).
4. ~~**Monthly billing.**~~ ✅ Done — `plan_expires_at` column added, admin verify sets it to `now() + 30 days`, the DownloadGate and dashboard treat past-expiry as lapsed (drops to the "renew" pay modal). No cron required — enforcement is in the app. Owner renews by re-approving a fresh payment, which bumps the expiry forward another 30 days.
5. ~~**Rate-limit the admin verify endpoint.**~~ ✅ Done — in-memory 30-actions-per-minute-per-admin limit in `src/app/api/admin/payments/verify/route.ts`. Exceeding it returns HTTP 429.

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
