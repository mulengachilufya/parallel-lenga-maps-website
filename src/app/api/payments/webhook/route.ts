import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, createHash } from 'crypto'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Lenco signature: SHA256(secret_key) → HMAC-SHA512(payload, hash_key)
function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.LENCO_SECRET_KEY
  if (!secret) {
    console.error('[webhook] LENCO_SECRET_KEY not set')
    return false
  }
  const hashKey = createHash('sha256').update(secret).digest('hex')
  const computed = createHmac('sha512', hashKey).update(payload).digest('hex')
  return computed === signature
}

const PLAN_PERIOD_DAYS = 30

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-lenco-signature') ?? ''

  // Always verify in production. In sandbox, Lenco may not send a valid
  // signature on every test event — log the mismatch but still process
  // if sandbox mode is on so manual tests work.
  const sigOk = verifySignature(rawBody, signature)
  if (!sigOk) {
    const isSandbox = process.env.LENCO_SANDBOX === 'true'
    if (!isSandbox) {
      console.warn('[webhook] invalid signature — rejecting')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    console.warn('[webhook] invalid signature but LENCO_SANDBOX=true — processing anyway')
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventName = event.event as string
  console.log('[webhook] received event:', eventName)

  // Accept both event names Lenco uses for successful collections
  if (eventName !== 'collection.successful' && eventName !== 'transaction.successful') {
    return NextResponse.json({ received: true })
  }

  const data = (event.data ?? {}) as Record<string, unknown>
  const reference       = data.reference as string | undefined
  const lencoReference  = data.lencoReference as string | undefined
  const status          = data.status as string | undefined
  const operator        = (data.mobileMoneyDetails as Record<string, unknown>)?.operator as string | undefined

  if (!reference || status !== 'successful') {
    console.log('[webhook] skipping — no reference or non-successful status:', status)
    return NextResponse.json({ received: true })
  }

  // Fetch the pending payment record
  const { data: payment, error: fetchErr } = await serviceSupabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .single()

  if (fetchErr || !payment) {
    console.error('[webhook] payment not found for reference:', reference)
    return NextResponse.json({ received: true })
  }

  if (payment.status === 'successful') {
    console.log('[webhook] already processed, skipping duplicate')
    return NextResponse.json({ received: true })
  }

  // ── 1. Update the payments row ──────────────────────────────────────────
  const { error: payErr } = await serviceSupabase
    .from('payments')
    .update({
      status:          'successful',
      operator:        operator ?? null,
      lenco_reference: lencoReference ?? null,
    })
    .eq('reference', reference)

  if (payErr) {
    console.error('[webhook] failed to update payments row:', payErr)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // ── 2. Activate the user's plan in profiles ─────────────────────────────
  // This is the source of truth the dashboard reads. updateUserById only
  // writes to auth.users.user_metadata which is NOT what gateDownload or
  // callerCanDownloadTier checks — they all read profiles.
  const expiresAt = new Date(Date.now() + PLAN_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error: profErr } = await serviceSupabase
    .from('profiles')
    .update({
      plan:            payment.plan,
      plan_status:     'active',
      plan_expires_at: expiresAt,
    })
    .eq('id', payment.user_id)

  if (profErr) {
    console.error('[webhook] failed to update profiles:', profErr)
    // Don't return 500 — the payments row is already updated. We'll rely
    // on the verify endpoint to backfill profiles if the user polls it.
  } else {
    console.log('[webhook] plan activated for user:', payment.user_id, '| plan:', payment.plan)
  }

  return NextResponse.json({ received: true })
}
