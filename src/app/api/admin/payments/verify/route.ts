import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

/**
 * POST /api/admin/payments/verify
 * body: { reference: string, action: 'verify' | 'reject', note?: string }
 *
 * Admin-only. On 'verify':
 *   - manual_payments.status → 'verified', verified_at = now(), verified_by = admin.id
 *   - profiles.plan → plan recorded on the payment row
 *   - profiles.plan_status → 'active'
 *   - fires Web3Forms email to the customer letting them know access is live
 *
 * On 'reject':
 *   - manual_payments.status → 'rejected', admin_note = note
 *   - profiles.plan_status → 'free'  (they'll need to resubmit)
 */

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function notifyCustomer(
  action: 'verify' | 'reject',
  email: string,
  name: string | null,
  plan: string,
  note: string,
) {
  const key = process.env.NEXT_PUBLIC_WEB3FORMS_KEY
  if (!key) return
  const displayName = name || 'there'
  const subject = action === 'verify'
    ? `Your Lenga Maps ${plan.toUpperCase()} plan is active`
    : `Your Lenga Maps payment needs another look`
  const message = action === 'verify'
    ? `Hi ${displayName},\n\nGreat news — we've verified your payment. Your ${plan.toUpperCase()} plan is now active, and you can download datasets right away at https://lengamaps.com/dashboard.\n\nIf you need anything, reply to this email.\n\n— Lenga Maps`
    : `Hi ${displayName},\n\nWe reviewed your recent payment submission but couldn't verify it.\n\nReason: ${note || 'No additional detail provided.'}\n\nYou can resubmit from https://lengamaps.com/dashboard/payment, or reply to this email for help.\n\n— Lenga Maps`

  try {
    await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: key,
        from_name:  'Lenga Maps',
        subject,
        email,
        message,
      }),
    })
  } catch (err) {
    console.error('[admin/payments/verify] customer email failed:', err)
  }
}

export async function POST(req: NextRequest) {
  const auth = createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const reference = typeof body.reference === 'string' ? body.reference.trim() : ''
  const action = body.action === 'reject' ? 'reject' : 'verify'
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!reference) {
    return NextResponse.json({ error: 'reference required' }, { status: 400 })
  }

  // Look up the payment.
  const { data: payment, error: payErr } = await service
    .from('manual_payments')
    .select('id, user_id, user_email, user_name, plan, account_type, status')
    .eq('reference', reference)
    .single()
  if (payErr || !payment) {
    return NextResponse.json({ error: 'payment not found' }, { status: 404 })
  }
  if (payment.status === 'verified' && action === 'verify') {
    return NextResponse.json({ ok: true, already: true })
  }

  const now = new Date().toISOString()

  if (action === 'verify') {
    const { error: updErr } = await service
      .from('manual_payments')
      .update({
        status:      'verified',
        verified_at: now,
        verified_by: user.id,
        admin_note:  note || null,
      })
      .eq('id', payment.id)
    if (updErr) {
      console.error('[admin/payments/verify] update payment failed:', updErr)
      return NextResponse.json({ error: 'could not update payment' }, { status: 500 })
    }

    const { error: profErr } = await service
      .from('profiles')
      .update({
        plan:          payment.plan,
        account_type:  payment.account_type,
        plan_status:   'active',
      })
      .eq('id', payment.user_id)
    if (profErr) {
      console.error('[admin/payments/verify] profile update failed:', profErr)
      return NextResponse.json({ error: 'payment verified but profile update failed' }, { status: 500 })
    }

    // fire-and-forget customer email
    notifyCustomer('verify', payment.user_email, payment.user_name, payment.plan, note)
    return NextResponse.json({ ok: true, action: 'verified' })
  }

  // reject
  const { error: updErr } = await service
    .from('manual_payments')
    .update({
      status:      'rejected',
      verified_at: now,
      verified_by: user.id,
      admin_note:  note || null,
    })
    .eq('id', payment.id)
  if (updErr) {
    console.error('[admin/payments/verify] reject payment failed:', updErr)
    return NextResponse.json({ error: 'could not update payment' }, { status: 500 })
  }

  // Drop the user back to 'free' so they can resubmit.
  await service
    .from('profiles')
    .update({ plan_status: 'free' })
    .eq('id', payment.user_id)

  notifyCustomer('reject', payment.user_email, payment.user_name, payment.plan, note)
  return NextResponse.json({ ok: true, action: 'rejected' })
}
