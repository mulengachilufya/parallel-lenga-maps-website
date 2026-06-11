/**
 * POST /api/payments/webhook
 *
 * Lipila callback endpoint.
 *
 * Lipila POSTs here when a transaction reaches a terminal state. We:
 *   1. Verify the Standard Webhooks signature (HMAC-SHA256 over
 *      `id.timestamp.body`) against LIPILA_WEBHOOK_SECRET and reject replays
 *      older than 5 minutes.
 *   2. Match the payment row by reference, lipila_reference OR
 *      lipila_identifier, against both `identifier` and `referenceId` in the
 *      payload (Lipila echoes our ref back inconsistently across flows).
 *   3. Mark the payment row, activate the user's plan (resets cancellation
 *      state and re-enables auto-renew), and bump the period.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLAN_PERIOD_DAYS = 30

// ────────────────────────────────────────────────────────────────────────
// Signature verification — Standard Webhooks spec (https://www.standardwebhooks.com)
//
// Lipila signs every webhook with HMAC-SHA256. The signed content is
//   `${webhook-id}.${webhook-timestamp}.${rawBody}`
// keyed by the base64-DECODED signing secret; the digest is base64-encoded and
// prefixed `v1,`. It arrives in the `webhook-signature` header, which may hold
// several space-delimited signatures during a key-rotation overlap — a match
// against any one passes. `webhook-timestamp` guards replay: reject if it is
// more than 5 minutes from now.
//
// Policy:
//   LIPILA_WEBHOOK_SECRET unset              → accept + warn (dev only)
//   secret set, signature valid              → accept
//   secret set, invalid + ALLOW_UNSIGNED=1   → accept + warn (rollout capture)
//   secret set, invalid otherwise            → 401 (strict prod default)
//
// LIPILA_WEBHOOK_ALLOW_UNSIGNED=true is a temporary rollout switch: it lets the
// first live callbacks through even when verification fails, so a config slip
// can't drop a real payment. The check still runs and logs its result — once
// the logs show 'match', unset this var and the route is strict.
// ────────────────────────────────────────────────────────────────────────

const SIGNATURE_VERSION       = 'v1'
const TIMESTAMP_TOLERANCE_SEC = 300 // 5 minutes, per the spec

/** Constant-time compare that returns false (not throws) on length mismatch. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function verifySignature(rawBody: string, headers: Headers): { ok: boolean; reason: string } {
  const secret = process.env.LIPILA_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[webhook] LIPILA_WEBHOOK_SECRET unset — accepting unsigned (dev only)')
    return { ok: true, reason: 'no_secret_configured' }
  }

  const webhookId = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const sigHeader = headers.get('webhook-signature')
  if (!webhookId || !timestamp || !sigHeader) {
    return { ok: false, reason: 'missing_webhook_headers' }
  }

  // Replay guard: reject timestamps outside ±5 min.
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid_timestamp' }
  const ageSec = Math.abs(Date.now() / 1000 - ts)
  if (ageSec > TIMESTAMP_TOLERANCE_SEC) {
    return { ok: false, reason: `timestamp_out_of_tolerance:${Math.round(ageSec)}s` }
  }

  // The dashboard secret is raw base64; tolerate an accidental whsec_ prefix
  // (that prefix is only for the StandardWebhooks library, not manual HMAC).
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const key = Buffer.from(rawSecret, 'base64')
  if (key.length === 0) return { ok: false, reason: 'bad_secret_encoding' }

  const signedContent = `${webhookId}.${timestamp}.${rawBody}`
  const expected = `${SIGNATURE_VERSION},` +
    createHmac('sha256', key).update(signedContent).digest('base64')

  // Header may carry several space-delimited `v1,<sig>` entries (key rotation).
  const matched = sigHeader
    .split(' ')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((sig) => timingSafeEqualStr(expected, sig))

  return matched ? { ok: true, reason: 'match' } : { ok: false, reason: 'signature_mismatch' }
}

export async function POST(request: NextRequest) {
  // We need the raw body to verify HMAC, then we re-parse the JSON.
  const rawBody = await request.text()

  // Log incoming headers during rollout — confirms webhook-id / webhook-timestamp
  // / webhook-signature arrive as expected. No secret is present here, so this
  // is safe to log; trim once the integration is verified in prod.
  const hdrs: Record<string, string> = {}
  request.headers.forEach((v, k) => { hdrs[k] = v })
  console.log('[webhook] incoming headers:', JSON.stringify(hdrs))

  const sig = verifySignature(rawBody, request.headers)
  console.log('[webhook] signature check:', sig.reason)
  if (!sig.ok) {
    // Rollout capture: log the failure but still process, so a config slip
    // can't drop a real payment. Remove ALLOW_UNSIGNED once logs show 'match'.
    if (process.env.LIPILA_WEBHOOK_ALLOW_UNSIGNED === 'true') {
      console.warn('[webhook] signature not verified; ALLOW_UNSIGNED=true → processing anyway:', sig.reason)
    } else {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Standard Webhooks events are shaped { type, data: {...} }. Unwrap the
  // envelope if present so we read transaction fields whether Lipila sends them
  // nested or flat. (Confirm the real shape from the raw-body log on the first
  // live callback, then simplify this once it's known.)
  const eventType = typeof payload.type === 'string' ? payload.type : undefined
  const event = (payload.data && typeof payload.data === 'object')
    ? payload.data as Record<string, unknown>
    : payload

  const {
    referenceId:   lipilaReferenceId,
    identifier,
    status:        rawStatus,
    paymentType,
    externalId,
    amount,
    currency,
  } = event

  console.log('[webhook] Lipila callback received:', {
    eventType,
    lipilaReferenceId,
    identifier,
    rawStatus,
    paymentType,
    amount,
    currency,
  })

  // Sanitise ref candidates — they feed a PostgREST .or() filter.
  const candidates = [identifier, lipilaReferenceId]
    .filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]+$/.test(x))

  if (candidates.length === 0) {
    console.log('[webhook] no identifier/referenceId — ignoring (likely a test ping)')
    return NextResponse.json({ received: true })
  }

  // Prefer an explicit status field; fall back to the event type
  // (e.g. "transaction.completed" / "transaction.failed") if that's all we get.
  let statusNorm = String(rawStatus ?? '').toLowerCase()
  if (statusNorm !== 'successful' && statusNorm !== 'failed' && eventType) {
    if (/complete|success/i.test(eventType)) statusNorm = 'successful'
    else if (/fail|declin|cancel|reject/i.test(eventType)) statusNorm = 'failed'
  }
  if (statusNorm !== 'successful' && statusNorm !== 'failed') {
    console.log('[webhook] ignoring intermediate status:', rawStatus, '| type:', eventType)
    return NextResponse.json({ received: true })
  }

  const orFilter = candidates
    .flatMap((c) => [`reference.eq.${c}`, `lipila_reference.eq.${c}`, `lipila_identifier.eq.${c}`])
    .join(',')
  const { data: payment, error: fetchErr } = await serviceSupabase
    .from('payments')
    .select('*')
    .or(orFilter)
    .maybeSingle()

  const ourReference = payment?.reference ?? candidates[0]

  if (fetchErr || !payment) {
    console.error('[webhook] payment not found for candidates:', candidates, fetchErr?.message)
    return NextResponse.json({ received: true })
  }

  if (payment.status === 'successful') {
    console.log('[webhook] already processed, skipping duplicate:', ourReference)
    return NextResponse.json({ received: true })
  }

  const newStatus = statusNorm === 'successful' ? 'successful' : 'failed'

  // ── 1. Update payments row ───────────────────────────────────────────────
  const { error: payErr } = await serviceSupabase
    .from('payments')
    .update({
      status:           newStatus,
      operator:         paymentType ?? null,
      lipila_reference: lipilaReferenceId ?? null,
    })
    .eq('reference', ourReference)

  if (payErr) {
    console.error('[webhook] failed to update payments row:', payErr)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (newStatus !== 'successful') {
    console.log('[webhook] payment failed:', ourReference, '| externalId:', externalId)
    return NextResponse.json({ received: true })
  }

  // ── 2. Activate / renew the user's plan ──────────────────────────────────
  // If they're already active, extend from the existing expiry; otherwise
  // start a fresh 30-day window from now. Renewals reset cancellation state
  // and the reminder-sent timestamp.
  const { data: currentProfile } = await serviceSupabase
    .from('profiles')
    .select('plan_status, plan_expires_at')
    .eq('id', payment.user_id)
    .maybeSingle()

  const now = Date.now()
  const baseTime =
    currentProfile?.plan_status === 'active' &&
    currentProfile?.plan_expires_at &&
    new Date(currentProfile.plan_expires_at).getTime() > now
      ? new Date(currentProfile.plan_expires_at).getTime()
      : now
  const expiresAt = new Date(baseTime + PLAN_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error: profErr } = await serviceSupabase
    .from('profiles')
    .update({
      plan:                payment.plan,
      plan_status:         'active',
      plan_expires_at:     expiresAt,
      auto_renew_enabled:  true,
      cancelled_at:        null,
      renewal_reminded_at: null,
    })
    .eq('id', payment.user_id)

  if (profErr) {
    console.error('[webhook] failed to update profiles:', profErr)
  } else {
    console.log('[webhook] plan activated:', {
      userId:  payment.user_id,
      plan:    payment.plan,
      via:     paymentType,
      expires: expiresAt,
    })
  }

  return NextResponse.json({ received: true })
}
