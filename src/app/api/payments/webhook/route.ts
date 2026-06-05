/**
 * POST /api/payments/webhook
 *
 * Lipila Callback endpoint.
 *
 * Lipila fires this URL (passed as the `callbackUrl` header when the
 * collection is initiated) whenever a payment transitions to a terminal
 * state — "Successful" or "Failed".
 *
 * Payload shape:
 * {
 *   referenceId:   string  — Lipila-generated transaction GUID
 *   currency:      string  — e.g. "ZMW"
 *   amount:        number
 *   accountNumber: string  — customer's mobile number
 *   status:        string  — "Successful" | "Failed"
 *   paymentType:   string  — "AirtelMoney" | "MTNMoney" | "ZamtelKwacha" | "Card"
 *   type:          string  — "Collection" | "Disbursement"
 *   ipAddress:     string
 *   identifier:    string  — our internal reference (what we sent as `referenceId`)
 *   message:       string
 *   externalId?:   string  — MNO transaction ID
 *   referenceData?:string  — narration
 * }
 *
 * We match on `identifier` (our reference), update the payments row,
 * then activate the user's plan in profiles.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLAN_PERIOD_DAYS = 30

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    referenceId:   lipilaReferenceId,
    identifier:    ourReference,
    status:        rawStatus,
    paymentType,
    externalId,
    amount,
    currency,
  } = payload as Record<string, unknown>

  console.log('[webhook] Lipila callback received:', {
    lipilaReferenceId,
    ourReference,
    rawStatus,
    paymentType,
    amount,
    currency,
  })

  if (!ourReference) {
    // Lipila may send test pings with no identifier — acknowledge silently
    console.log('[webhook] no identifier in payload — ignoring')
    return NextResponse.json({ received: true })
  }

  // Normalise status: Lipila uses "Successful" / "Failed" (title case)
  const statusNorm = String(rawStatus ?? '').toLowerCase()

  if (statusNorm !== 'successful' && statusNorm !== 'failed') {
    console.log('[webhook] ignoring intermediate status:', rawStatus)
    return NextResponse.json({ received: true })
  }

  // Look up the payment record by our reference
  const { data: payment, error: fetchErr } = await serviceSupabase
    .from('payments')
    .select('*')
    .eq('reference', ourReference)
    .single()

  if (fetchErr || !payment) {
    console.error('[webhook] payment not found for identifier:', ourReference)
    // Acknowledge anyway so Lipila doesn't keep retrying for a record we'll never have
    return NextResponse.json({ received: true })
  }

  if (payment.status === 'successful') {
    console.log('[webhook] already processed, skipping duplicate for:', ourReference)
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
    console.log('[webhook] payment failed for:', ourReference, '| externalId:', externalId)
    return NextResponse.json({ received: true })
  }

  // ── 2. Activate the user's plan in profiles ──────────────────────────────
  const expiresAt = new Date(Date.now() + PLAN_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error: profErr } = await serviceSupabase
    .from('profiles')
    .update({
      plan:            payment.plan,
      account_type:    payment.account_type,
      plan_status:     'active',
      plan_expires_at: expiresAt,
    })
    .eq('id', payment.user_id)

  if (profErr) {
    console.error('[webhook] failed to update profiles:', profErr)
    // Don't return 500 — payments row is already marked successful.
    // The verify endpoint will re-apply activation on next poll.
  } else {
    console.log('[webhook] plan activated:', {
      userId:  payment.user_id,
      plan:    payment.plan,
      type:    payment.account_type,
      via:     paymentType,
      mno_ref: externalId ?? 'n/a',
    })
  }

  return NextResponse.json({ received: true })
}
