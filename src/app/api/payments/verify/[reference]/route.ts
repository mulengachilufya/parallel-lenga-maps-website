/**
 * GET /api/payments/verify/[reference]
 *
 * Checks the status of a Lipila payment. Primary source of truth is our own DB
 * record, which the Lipila webhook (/api/payments/webhook) updates on a terminal
 * callback.
 *
 * SAFETY NET: webhooks can be missed (provider outage, the customer closes the
 * tab the instant after paying). If the DB still says `pending`, we ask Lipila
 * directly via its Collection Status endpoint and reconcile — so a real payment
 * always activates even when no webhook arrived. (The old comment here claimed
 * Lipila was "webhook-only"; it is not — GET /api/v1/collections/check-status
 * exists and is exactly what this needs.)
 *
 * Responses:
 *   { status: 'pending' }                     — waiting for customer to approve
 *   { status: 'successful', plan: string }     — plan activated; safe to redirect
 *   { status: 'failed' }                       — customer rejected / timed out
 *   { status: 'not_initiated' }                — /initiate was never called
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLAN_PERIOD_DAYS = 30

const LIPILA_BASE = process.env.LIPILA_SANDBOX === 'true'
  ? 'https://api.lipila.dev'
  : 'https://blz.lipila.io'

/**
 * Ask Lipila directly whether a collection reached a terminal state.
 * Returns 'pending' for any non-terminal/unknown/error case (incl. 404/429 and
 * network errors), so a transient blip just keeps us polling rather than wrongly
 * marking a payment failed.
 */
async function checkLipilaStatus(referenceId: string): Promise<'successful' | 'failed' | 'pending'> {
  try {
    const res = await fetch(
      `${LIPILA_BASE}/api/v1/collections/check-status?referenceId=${encodeURIComponent(referenceId)}`,
      { headers: { accept: 'application/json', 'x-api-key': process.env.LIPILA_API_KEY! } },
    )
    if (!res.ok) return 'pending'
    const data = await res.json() as { status?: string }
    const s = String(data.status ?? '').toLowerCase()
    if (s === 'successful') return 'successful'
    if (s === 'failed')     return 'failed'
    return 'pending'
  } catch (err) {
    console.error('[verify] check-status call failed:', err)
    return 'pending'
  }
}

/** Activate the user's plan (idempotent — safe to call more than once). */
async function activateProfile(userId: string, plan: string) {
  const expiresAt = new Date(Date.now() + PLAN_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await serviceSupabase
    .from('profiles')
    .update({
      plan,
      plan_status:     'active',
      plan_expires_at: expiresAt,
    })
    .eq('id', userId)
  if (error) console.error('[verify] failed to activate profile:', error)
  return !error
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const supabase = await createServerSupabase()
  // getUser() (verified). With getSession() a forged `sub` could read
  // another user's payment status by reference. (Security audit 2026-06-18.)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reference } = await params

  // Fetch the payment record — must belong to the calling user
  const { data: payment, error: fetchError } = await serviceSupabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  // If Lipila was never called we can report that explicitly
  if (!payment.lipila_reference && payment.status === 'pending') {
    return NextResponse.json({ status: 'not_initiated' })
  }

  if (payment.status === 'failed') {
    return NextResponse.json({ status: 'failed' })
  }

  if (payment.status === 'successful') {
    // Webhook may have updated payments but not yet profiles (edge case on
    // server restart). Re-apply the plan activation as a safety net.
    await activateProfile(payment.user_id, payment.plan)
    return NextResponse.json({ status: 'successful', plan: payment.plan })
  }

  // Still pending in our DB. The webhook may have been missed, so reconcile
  // directly against Lipila. We only reach here once /initiate succeeded (the
  // not_initiated branch above returns earlier), so lipila_reference is set.
  const refForStatus = payment.lipila_reference ?? payment.reference
  const live = await checkLipilaStatus(refForStatus)

  if (live === 'successful') {
    // Guard with .eq('status','pending') so we never clobber a concurrent
    // webhook write that already finalised the row.
    await serviceSupabase
      .from('payments')
      .update({ status: 'successful' })
      .eq('reference', payment.reference)
      .eq('status', 'pending')
    await activateProfile(payment.user_id, payment.plan)
    console.log('[verify] reconciled pending→successful via check-status:', payment.reference)
    return NextResponse.json({ status: 'successful', plan: payment.plan })
  }

  if (live === 'failed') {
    await serviceSupabase
      .from('payments')
      .update({ status: 'failed' })
      .eq('reference', payment.reference)
      .eq('status', 'pending')
    console.log('[verify] reconciled pending→failed via check-status:', payment.reference)
    return NextResponse.json({ status: 'failed' })
  }

  // Genuinely still pending — client should keep polling
  return NextResponse.json({ status: 'pending' })
}
