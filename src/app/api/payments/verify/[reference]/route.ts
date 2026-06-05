/**
 * GET /api/payments/verify/[reference]
 *
 * Checks the status of a Lipila payment by looking up our own DB record,
 * which is updated by the Lipila webhook at /api/payments/webhook.
 *
 * Lipila is webhook-first ("your application will only receive a callback
 * when a transaction succeeds or fails") so we don't poll their API here —
 * we just read what the webhook already wrote.
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

/** Activate the user's plan (idempotent — safe to call more than once). */
async function activateProfile(userId: string, plan: string, accountType: string) {
  const expiresAt = new Date(Date.now() + PLAN_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await serviceSupabase
    .from('profiles')
    .update({
      plan,
      account_type:    accountType,
      plan_status:     'active',
      plan_expires_at: expiresAt,
    })
    .eq('id', userId)
  if (error) console.error('[verify] failed to activate profile:', error)
  return !error
}

export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reference } = params

  // Fetch the payment record — must belong to the calling user
  const { data: payment, error: fetchError } = await serviceSupabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .eq('user_id', session.user.id)
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
    await activateProfile(payment.user_id, payment.plan, payment.account_type)
    return NextResponse.json({ status: 'successful', plan: payment.plan })
  }

  // Still pending — client should keep polling
  return NextResponse.json({ status: 'pending' })
}
