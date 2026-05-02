import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { createServerSupabase } from '@/lib/supabase-server'
import { getDownloadUrl } from '@/lib/r2'
import { PLAN_PRICING, type AccountType, type PlanTier } from '@/lib/supabase'

/**
 * POST /api/payments/manual
 *
 * Accepts a manual payment submission (mobile-money transfer screenshot).
 * Requires an authenticated Supabase session.
 *
 * Expects multipart/form-data:
 *   plan           'basic' | 'pro' | 'max'
 *   account_type   'student' | 'professional' | 'business'
 *   region         'zambian' | 'international'
 *   payment_method 'mtn' | 'airtel'
 *   country_name   free text (for international)
 *   sender_phone   free text (optional)
 *   sender_name    free text (optional — defaults to profile full_name)
 *   txn_reference  free text — mobile-money transaction ID from the confirmation SMS
 *   screenshot     File — jpeg/png/webp, ≤ 5 MB
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SUPABASE TABLE (run once in SQL editor):
 *
 *   CREATE TABLE manual_payments (
 *     id              bigserial PRIMARY KEY,
 *     user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *     user_email      varchar(320)  NOT NULL,
 *     user_name       varchar(255),
 *     reference       varchar(32)   UNIQUE NOT NULL,
 *     region          varchar(20)   NOT NULL,
 *     country_name    varchar(120),
 *     plan            varchar(20)   NOT NULL,
 *     account_type    varchar(20)   NOT NULL,
 *     amount_zmw      integer,
 *     amount_usd      integer,
 *     currency        varchar(4)    NOT NULL,
 *     payment_method  varchar(10)   NOT NULL,
 *     sender_phone    varchar(40),
 *     sender_name     varchar(255),
 *     txn_reference   varchar(120),
 *     screenshot_key  varchar(1024) NOT NULL,
 *     status          varchar(20)   NOT NULL DEFAULT 'pending',
 *     admin_note      text,
 *     submitted_at    timestamptz   NOT NULL DEFAULT now(),
 *     verified_at     timestamptz,
 *     verified_by     uuid REFERENCES auth.users(id)
 *   );
 *   CREATE INDEX idx_mp_user      ON manual_payments(user_id);
 *   CREATE INDEX idx_mp_status    ON manual_payments(status);
 *   CREATE INDEX idx_mp_submitted ON manual_payments(submitted_at DESC);
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const RATE_LIMIT_WINDOW_MIN = 60
const RATE_LIMIT_MAX_PENDING = 3

type Region = 'zambian' | 'international'
type Method = 'mtn' | 'airtel'

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png')  return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/heic') return 'heic'
  if (mime === 'image/heif') return 'heif'
  return 'bin'
}

function formatMoney(region: Region, amount: number) {
  return region === 'zambian' ? `K${amount.toLocaleString()}` : `$${amount.toLocaleString()}`
}

async function notifyEmail(args: {
  reference: string
  region: Region
  method: Method
  plan: PlanTier
  accountType: AccountType
  amountLabel: string
  userEmail: string
  userName: string
  countryName: string
  senderPhone: string
  senderName: string
  txnRef: string
  screenshotUrl: string
  submittedAt: string
}) {
  const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY
  if (!accessKey) {
    console.warn('[ManualPayment] NEXT_PUBLIC_WEB3FORMS_KEY missing — email not sent')
    return
  }

  const lines = [
    `Reference: ${args.reference}`,
    `Region:    ${args.region}${args.countryName ? ` (${args.countryName})` : ''}`,
    `Method:    ${args.method.toUpperCase()}`,
    `Plan:      ${args.plan} (${args.accountType})`,
    `Amount:    ${args.amountLabel}`,
    '',
    `User:      ${args.userName || '(no name)'} <${args.userEmail}>`,
    `Sender:    ${args.senderName || '(not provided)'}`,
    `Phone:     ${args.senderPhone || '(not provided)'}`,
    `Txn ref:   ${args.txnRef || '(not provided)'}`,
    '',
    `Submitted: ${args.submittedAt}`,
    `Screenshot (valid 7 days): ${args.screenshotUrl}`,
  ].join('\n')

  try {
    await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: accessKey,
        name: args.userName || args.userEmail,
        email: args.userEmail,
        subject: `[Lenga Maps] Manual payment ${args.reference} — ${args.amountLabel} via ${args.method.toUpperCase()}`,
        message: lines,
        botcheck: '',
      }),
    })
  } catch (err) {
    console.error('[ManualPayment] email notify failed:', err)
  }
}

async function notifyWhatsApp(message: string) {
  const phone  = process.env.CALLMEBOT_WHATSAPP_PHONE
  const apiKey = process.env.CALLMEBOT_WHATSAPP_APIKEY
  if (!phone || !apiKey) return

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`
  try {
    await fetch(url, { method: 'GET' })
  } catch (err) {
    console.error('[ManualPayment] whatsapp notify failed:', err)
  }
}

/**
 * Telegram bot notification — the most reliable of our notification channels.
 *
 * Setup (60 seconds, one-time):
 *   1. On Telegram, open @BotFather, run /newbot, follow prompts.
 *   2. Save the bot token (looks like 7234567890:AAH-xxxxxxxxxxxxxxxxxx).
 *   3. Open @userinfobot in Telegram and send any message — it replies with
 *      your numeric chat ID (e.g. 123456789).
 *   4. Send any message to YOUR new bot first (so it can DM you).
 *   5. On Vercel, set env vars:
 *        TELEGRAM_BOT_TOKEN=<the token>
 *        TELEGRAM_CHAT_ID=<your chat id>
 *   6. Redeploy.
 *
 * Why Telegram over Web3Forms email or CallMeBot WhatsApp:
 *   - Email lands in spam, requires the inbox to be open
 *   - CallMeBot is a free unofficial proxy that rate-limits and disappears
 *   - Telegram's Bot API is first-party, free, instant, and on your phone
 */
async function notifyTelegram(message: string): Promise<{ ok: boolean; error?: string }> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    return { ok: false, error: 'telegram_not_configured' }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chat_id:    chatId,
        text:       message,
        parse_mode: 'HTML',
        // disable_web_page_preview keeps the screenshot URL preview from
        // bloating the message; the link itself is still tappable.
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[ManualPayment] telegram non-OK:', res.status, body)
      return { ok: false, error: `telegram_${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    console.error('[ManualPayment] telegram notify failed:', err)
    return { ok: false, error: String(err) }
  }
}

export async function POST(request: NextRequest) {
  // ─── Auth ──────────────────────────────────────────────────────────────
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  }
  const userId = session.user.id
  const userEmail = session.user.email || ''

  // ─── Parse form ────────────────────────────────────────────────────────
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 })
  }

  const plan          = String(form.get('plan') || '') as PlanTier
  const accountType   = String(form.get('account_type') || '') as AccountType
  const region        = String(form.get('region') || '') as Region
  const method        = String(form.get('payment_method') || '') as Method
  const countryName   = String(form.get('country_name') || '').slice(0, 120)
  const senderPhone   = String(form.get('sender_phone') || '').slice(0, 40)
  const senderNameRaw = String(form.get('sender_name') || '').slice(0, 255)
  const txnRef        = String(form.get('txn_reference') || '').slice(0, 120)
  const screenshot    = form.get('screenshot')

  if (!['basic', 'pro', 'max'].includes(plan))
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 })
  if (!['student', 'professional', 'business'].includes(accountType))
    return NextResponse.json({ error: 'Invalid account type.' }, { status: 400 })
  if (!['zambian', 'international'].includes(region))
    return NextResponse.json({ error: 'Invalid region.' }, { status: 400 })
  if (!['mtn', 'airtel'].includes(method))
    return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 })
  if (!(screenshot instanceof File))
    return NextResponse.json({ error: 'Screenshot is required.' }, { status: 400 })
  if (screenshot.size === 0)
    return NextResponse.json({ error: 'Screenshot is empty.' }, { status: 400 })
  if (screenshot.size > MAX_SCREENSHOT_BYTES)
    return NextResponse.json({ error: 'Screenshot must be ≤ 5 MB.' }, { status: 400 })
  if (!ALLOWED_MIME.has(screenshot.type))
    return NextResponse.json({ error: 'Screenshot must be a JPG, PNG, WEBP, or HEIC image.' }, { status: 400 })

  // ─── Pricing lookup (server-side — ignore any client-sent amount) ──────
  const price = PLAN_PRICING[accountType]?.[plan]
  if (!price) {
    return NextResponse.json({ error: `No pricing for ${accountType}/${plan}.` }, { status: 400 })
  }
  const amount_zmw = region === 'zambian' ? (price.zmw ?? null) : null
  const amount_usd = region === 'international' ? price.usd : null
  const currency   = region === 'zambian' ? 'ZMW' : 'USD'
  const amountLabel = region === 'zambian'
    ? (price.zmw ? formatMoney('zambian', price.zmw) : `$${price.usd}`)
    : formatMoney('international', price.usd)

  // Zambian region requires ZMW price to exist for the plan
  if (region === 'zambian' && amount_zmw == null) {
    return NextResponse.json(
      { error: 'This plan does not have a local (ZMW) price. Select the international option.' },
      { status: 400 }
    )
  }

  // ─── Rate limit: pending submissions in last hour ─────────────────────
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString()
  const { count: pendingCount } = await service
    .from('manual_payments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('submitted_at', windowStart)
  if ((pendingCount ?? 0) >= RATE_LIMIT_MAX_PENDING) {
    return NextResponse.json(
      { error: `You already have ${pendingCount} pending submissions from the last hour. Please wait for verification.` },
      { status: 429 }
    )
  }

  // ─── Profile name (preferred over user-supplied display name) ─────────
  let profileName = senderNameRaw
  if (!profileName) {
    const { data: prof } = await service
      .from('profiles').select('full_name').eq('id', userId).single()
    profileName = prof?.full_name || session.user.user_metadata?.full_name || ''
  }

  // ─── Upload screenshot to R2 ──────────────────────────────────────────
  const reference = `mp-${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const ext = extFromMime(screenshot.type)
  const screenshotKey = `payment-screenshots/${userId}/${reference}.${ext}`

  try {
    const bytes = Buffer.from(await screenshot.arrayBuffer())
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: screenshotKey,
      Body: bytes,
      ContentType: screenshot.type,
    }))
  } catch (err) {
    console.error('[ManualPayment] R2 upload failed:', err)
    return NextResponse.json({ error: 'Could not store screenshot. Try again.' }, { status: 500 })
  }

  // ─── Insert DB row ────────────────────────────────────────────────────
  const submittedAt = new Date().toISOString()
  const { error: dbErr } = await service.from('manual_payments').insert({
    user_id:        userId,
    user_email:     userEmail,
    user_name:      profileName || null,
    reference,
    region,
    country_name:   countryName || null,
    plan,
    account_type:   accountType,
    amount_zmw,
    amount_usd,
    currency,
    payment_method: method,
    sender_phone:   senderPhone || null,
    sender_name:    profileName || null,
    txn_reference:  txnRef || null,
    screenshot_key: screenshotKey,
    status:         'pending',
    submitted_at:   submittedAt,
  })
  if (dbErr) {
    console.error('[ManualPayment] DB insert failed:', dbErr)
    return NextResponse.json({ error: 'Could not record submission.' }, { status: 500 })
  }

  // ─── Flip the user's plan to 'pending' + record their chosen plan/tier ──
  // This drives the DownloadGate UI: while pending, the gate shows "Payment
  // under review" instead of asking them to pay again. Admin verification
  // later flips plan_status to 'active'.
  const { error: profileErr } = await service
    .from('profiles')
    .update({
      plan,
      account_type: accountType,
      plan_status:  'pending',
    })
    .eq('id', userId)
  if (profileErr) {
    // Non-fatal — the payment row is the source of truth; log and continue.
    console.error('[ManualPayment] profile status update failed:', profileErr)
  }

  // ─── Notifications (multi-channel, best-effort) ───────────────────────
  // Send to email, WhatsApp, AND Telegram in parallel. The DB row is the
  // source of truth — if every channel fails, the admin still sees it on
  // /admin/payments via the pending-count badge in the dashboard header.
  let screenshotUrl = ''
  try {
    screenshotUrl = await getDownloadUrl(screenshotKey, 7 * 24 * 3600)
  } catch { /* presign failures are non-fatal */ }

  const notifyArgs = {
    reference, region, method, plan, accountType,
    amountLabel,
    userEmail, userName: profileName,
    countryName, senderPhone, senderName: profileName, txnRef,
    screenshotUrl, submittedAt,
  }

  // Telegram message — HTML-formatted, keeps the link clean and tappable.
  const tgMessage = [
    `<b>💰 New payment — ${escapeHtml(reference)}</b>`,
    `${escapeHtml(amountLabel)} via ${escapeHtml(method.toUpperCase())} — ${escapeHtml(plan)}/${escapeHtml(accountType)}`,
    `${escapeHtml(profileName || userEmail)}`,
    region === 'international' && countryName ? `From: ${escapeHtml(countryName)}` : '',
    txnRef ? `Txn: <code>${escapeHtml(txnRef)}</code>` : '',
    senderPhone ? `Phone: ${escapeHtml(senderPhone)}` : '',
    '',
    screenshotUrl ? `<a href="${screenshotUrl}">View screenshot</a> · ` : '',
    `<a href="https://www.lengamaps.com/admin/payments">Approve in admin</a>`,
  ].filter(Boolean).join('\n')

  // Run all three channels in parallel. Promise.allSettled means one failure
  // never blocks another — we get whichever channels are working.
  const results = await Promise.allSettled([
    notifyEmail(notifyArgs),
    notifyWhatsApp(
      `Lenga Maps payment ${reference}\n` +
      `${amountLabel} via ${method.toUpperCase()} — ${plan}/${accountType}\n` +
      `${profileName || userEmail}\n` +
      (screenshotUrl ? `Screenshot: ${screenshotUrl}` : '')
    ),
    notifyTelegram(tgMessage),
  ])
  // Log the outcome for each channel — useful for diagnosing silent failures.
  console.log('[ManualPayment] notifications', {
    reference,
    email:    results[0].status,
    whatsapp: results[1].status,
    telegram: results[2].status === 'fulfilled' ? results[2].value : 'rejected',
  })

  return NextResponse.json({ reference, submitted_at: submittedAt })
}

// Tiny HTML escaper for Telegram — payments contain user-supplied strings
// (sender_name, country_name, etc.) and Telegram's HTML parse mode chokes
// on stray < or & characters.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
