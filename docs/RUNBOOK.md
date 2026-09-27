# Lenga Maps: owner's runbook

Plain steps for keeping the platform running without a developer. Start at
the top: most problems are solved in the first two sections.

---

## 1. Ways in (have at least two working at all times)

| # | Way in | Works when | Where |
|---|---|---|---|
| 1 | Sign in with **cmulenga672@gmail.com** | Normal days | lengamaps.com/login → then /admin or /ops |
| 2 | Sign in with **lengamaps@gmail.com** | You've lost access to #1 | Same |
| 3 | **Emergency key A** (password manager) | Both emails lost, or sign-in is broken | lengamaps.com/ops → "Open with emergency key" (make the keys first: section 7) |
| 4 | **Emergency key B** (printed, kept offline) | Password manager lost too | Same |
| 5 | **GitHub → Actions → Emergency** | The website itself is down | github.com/mulengachilufya/parallel-lenga-maps-website/actions |
| 6 | The service dashboards directly | Anything else | Supabase, Vercel, Cloudflare, Resend, GitHub (section 6) |

Both owner emails are written into the code as permanent admins: no
setting, typo or deleted variable can remove them.

Every use of an emergency key is emailed to both owner addresses and
listed under Ops → "Who did what". If you get that email and it wasn't
you, rotate the keys (section 7) straight away.

---

## 2. The ops console: lengamaps.com/ops

- **Health**: live tests of every part (database, sign-in, dataset files,
  email, storage, the daily job, waiting payments, settings). Green is fine.
  Orange or red says **exactly what to do**.
- **Problems**: everything that went wrong, explained in plain words: what
  happened, who is affected, what to do. Repeats are grouped with a count.
  Mark each one "dealt with" when you've handled it.
- **Fix**: one-click tools:
  - Look up a customer (plan, access end date, confirmed?, last sign-in, payments)
  - "I can't sign in": confirm their email, or email them a sign-in link / password reset
  - Give access (1/3/6/12 months or permanent), remove access, renew a whole team
  - Reset someone's secure messages (their old DMs stay unreadable forever)
  - Send a test email on every channel; email yourself the health report now
  - Run the daily job (reminders + switching off expired plans)
  - Clear "too many attempts" blocks
  - Announcement banner on every page
  - Maintenance mode ("back soon" page for visitors; you can still get in)
- **Who did what**: every action, by whom, when, and whether it worked.

## 3. What you'll receive by email

- **Instant alert** for anything urgent (emails failing, a customer's
  bank-details email failing, a proof-of-payment upload failing, an
  emergency key used). The same problem alerts at most every 6 hours.
- **Daily report** at 08:00 Lusaka time on days something needs you, and
  every Monday regardless, so silence never lasts more than a week.
  Subject line: "all clear" or "N things need you".
- **GitHub "Lenga Maps is down" issue**: GitHub checks the site every 15
  minutes from outside. If it's down twice in a row, you get a GitHub
  notification/email; it closes itself when the site is back.

---

## 4. Common problems

**A customer paid but can't download**
Ops → Fix → type their email → Look up. If Access is "free": approve the
payment in Admin → Payments, or use Give access.

**"I never got the email" / "I can't sign in"**
Ops → Fix → Confirm their email, then Email them a sign-in link.

**Nobody is getting emails**
Ops → Fix → Send a test email. Then Ops → Health → Email says what to do
(usually: log in to resend.com, check the domain is verified, make a new
API key, put it in Vercel, redeploy; see section 5).

**The site shows errors right after an update**
Roll the website back (takes about a minute, does not touch data):
vercel.com → the project → Deployments → the last one that worked → ⋯ →
**Promote to Production**.

**You need quiet time to fix something**
Ops → Fix → Maintenance mode ON. Turn it OFF when done.

**Reminder emails aren't going out / expired plans still active**
Ops → Fix → Run the daily job now. Ops → Health → Daily job shows when it
last ran.

---

## 5. When the website is completely down

1. Open lengamaps.com/ops. If it loads, Health tells you what's broken.
2. If nothing loads, on your phone: GitHub → the repository → **Actions →
   Emergency → Run workflow → `health`**. Open the run to read the result.
   - **Database ❌** → supabase.com → your project. If it says *Paused*,
     press **Restore**. Otherwise check status.supabase.com and wait.
   - **Database ✅, website ❌** → vercel.com → Deployments → last good
     deployment → **Promote to Production**. Also check status.vercel.com
     and that the domain hasn't expired (your registrar's dashboard).
3. While it's down you can still, from GitHub Actions → Emergency:
   look up, grant or revoke access, confirm an email, send a sign-in link,
   turn maintenance mode on/off, set or remove the banner.

**One-time setup for the Emergency workflow** (do this now, not during an
outage): GitHub → repository → Settings → Secrets and variables → Actions
→ New repository secret, twice:
- `SUPABASE_URL`: from Supabase → Project Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: same page, the `service_role` secret

The same tools run on any computer with Node installed:
`SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops-cli.mjs health`

---

## 6. Accounts to secure (make both emails owners of each)

| Service | What it runs | Do this |
|---|---|---|
| **Google accounts** (both emails) | Everything else resets through these | 2-step verification on; save the backup codes on paper; add each account as the other's recovery email |
| **Supabase** | Database, sign-in, uploads | Organisation → Members: add lengamaps@gmail.com as Owner. 2FA on |
| **Vercel** | The website, settings, crons | Team → Members: add the second email as Owner. 2FA on |
| **GitHub** | The code, Emergency and Uptime workflows | 2FA on; save recovery codes; consider adding the second account as a collaborator |
| **Cloudflare** | Dataset files (R2) | Members: add the second email as Super Administrator. 2FA on |
| **Resend** | All emails | Team: add the second email. 2FA on |
| **Domain registrar** | lengamaps.com itself | Auto-renew on; 2FA on; note the renewal date |

If one person controls a service alone, losing that one account can take
the platform down. Two owners on every service is the single most useful
thing on this page.

---

## 7. Making (or changing) the emergency keys

Do this once now, and again whenever a key might have been seen by someone else.

1. Sign in with an owner email and open lengamaps.com/ops → **Fix →
   Emergency keys → Create emergency keys**.
2. Your browser makes two keys, **A** and **B**, and shows them **once**.
   Save A in your password manager and print B (or write it down) and keep
   it somewhere safe away from your laptop. Tick "I have saved both", then
   **Turn these keys on**. Both owner emails get a notice that new keys were made.
3. Copy the **fingerprint line** it shows and paste it into
   vercel.com → project → Settings → Environment Variables →
   `OPS_EMERGENCY_KEY_HASHES`, then Deployments → Redeploy. This copy
   lets the keys work even when the database is down.

The keys never leave your browser: Lenga's server, Vercel and the code
only hold fingerprints, which can't be turned back into keys. Nobody can
recover a lost key, not a developer and not Claude; you simply make new
ones, and the old ones stop working. Keys can only be changed after
signing in with an owner email, so a stolen key can't be used to lock you out.
