/**
 * POST /api/payments/webhook
 *
 * Lipila callback endpoint.
 *
 * Lipila POSTs here when a transaction reaches a terminal state. We:
 *   1. Verify the HMAC signature against LIPILA_WEBHOOK_SECRET (fail-open
 *      while we capture the first real header in logs — see notes below).
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
// Signature verification
//
// Lipila's dashboard generates a Base64 webhook secret, which strongly
// suggests HMAC with a base64-decoded key. The docs don't specify the
// header name or digest format, so we accept several common patterns:
//
//   header names tried: x-signature, x-webhook-signature,
//                       x-lipila-signature, signature, x-callback-signature
//   key bytes tried:    base64-decoded secret, AND raw UTF-8 secret
//   digests tried:      hex AND base64
//
// Policy:
//   LIPILA_WEBHOOK_SECRET unset                → accept + warn (dev only)
//   secret set, sig present, match             → accept
//   secret set, sig present, mismatch          → 401
//   secret set, sig absent, ALLOW_UNSIGNED=1   → accept + warn (capture mode)
//   secret set, sig absent, otherwise          → 401 (strict prod default)
//
// LIPILA_WEBHOOK_ALLOW_UNSIGNED=true is a temporary capture switch: set it
// while we discover the real header name Lipila uses; the diagnostic header
// log below reveals it on the first real call. Once known, unset this var
// and the route becomes strict.
// ────────────────────────────────────────────────────────────────────────

const SIGNATURE_HEADERS = [
  'x-signature',
  'x-webhook-signature',
  'x-lipila-signature',
  'x-callback-signature',
  'signature',
]

function eq(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function computeHmac(rawBody: string, keyBuf: Buffer): { hex: string; b64: string } {
  const h1 = createHmac('sha256', keyBuf).update(rawBody).digest('hex')
  const h2 = createHmac('sha256', keyBuf).update(rawBody).digest('base64')
  return { hex: h1, b64: h2 }
}

function verifySignature(rawBody: string, headers: Headers): { ok: boolean; reason: string } {
  const secret = process.env.LIPILA_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[webhook] LIPILA_WEBHOOK_SECRET unset — accepting unsigned (dev only)')
    return { ok: true, reason: 'no_secret_configured' }
  }

  let providedSig: string | undefined
  let providedHeader = ''
  for (const name of SIGNATURE_HEADERS) {
    const v = headers.get(name)
    if (v) { providedSig = v.trim(); providedHeader = name; break }
  }
  if (!providedSig) {
    if (process.env.LIPILA_WEBHOOK_ALLOW_UNSIGNED === 'true') {
      console.warn('[webhook] no signature header; ALLOW_UNSIGNED=true → accept (capture mode)')
      return { ok: true, reason: 'no_signature_header (allow_unsigned)' }
    }
    return { ok: false, reason: 'no_signature_header (strict)' }
  }

  // Try both key encodings (base64-decoded vs raw utf-8)
  const keyBufs: Buffer[] = []
  try { keyBufs.push(Buffer.from(secret, 'base64')) } catch { /* ignore */ }
  keyBufs.push(Buffer.from(secret, 'utf8'))

  for (const key of keyBufs) {
    const { hex, b64 } = computeHmac(rawBody, key)
    if (eq(providedSig, hex)) return { ok: true, reason: `match:${providedHeader}:hex` }
    if (eq(providedSig, b64)) return { ok: true, reason: `match:${providedHeader}:base64` }
    // Some providers prefix with the algo: "sha256=..."
    const stripped = providedSig.replace(/^sha256=/i, '')
    if (eq(stripped, hex)) return { ok: true, reason: `match:${providedHeader}:sha256=hex` }
    if (eq(stripped, b64)) return { ok: true, reason: `match:${providedHeader}:sha256=base64` }
  }
  return { ok: false, reason: `mismatch:${providedHeader}` }
}

export async function POST(request: NextRequest) {
  // We need the raw body to verify HMAC, then we re-parse the JSON.
  const rawBody = await request.text()

  // DIAGNOSTIC: log header names so the first real Lipila callback reveals
  // its signature header. Remove once we see it. Values are over-the-body
  // signatures, low-risk to log.
  const hdrs: Record<string, string> = {}
  request.headers.forEach((v, k) => { hdrs[k] = v })
  console.log('[webhook] incoming headers:', JSON.stringify(hdrs))

  const sig = verifySignature(rawBody, request.headers)
  console.log('[webhook] signature check:', sig.reason)
  if (!sig.ok) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    referenceId:   lipilaReferenceId,
    identifier,
    status:        rawStatus,
    paymentType,
    externalId,
    amount,
    currency,
  } = payload as Record<string, unknown>

  console.log('[webhook] Lipila callback received:', {
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

  const statusNorm = String(rawStatus ?? '').toLowerCase()
  if (statusNorm !== 'successful' && statusNorm !== 'failed') {
    console.log('[webhook] ignoring intermediate status:', rawStatus)
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
