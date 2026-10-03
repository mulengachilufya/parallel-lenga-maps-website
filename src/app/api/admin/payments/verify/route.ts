import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
import { UPDATE_MONTHS, accessExpiry } from '@/lib/pricing'
import { sendEmail, paymentVerifiedEmail, paymentRejectedEmail } from '@/lib/email'

/**
 * POST /api/admin/payments/verify
 * body: { reference: string, action: 'verify' | 'reject', note?: string }
 *
 * Admin-only. On 'verify':
 *   - manual_payments.status → 'verified', verified_at = now(), verified_by = admin.id
 *   - profiles.plan → plan recorded on the payment row
 *   - Individual licence: plan_status → 'active', plan_expires_at → null
 *     (the catalogue is theirs for good), updates_until → UPDATE_MONTHS on
 *     (from the current updates_until if still running). An 'updates'
 *     payment only extends updates_until.
 *   - Older rows without a product (time-limited plans): 3 months as before.
 *   - fires Web3Forms email to the customer letting them know access is live
 *
 * On 'reject':
 *   - manual_payments.status → 'rejected', admin_note = note
 *   - profiles.plan_status → 'free'  (they'll need to resubmit)
 *
 * Rate limit: 30 verify/reject actions per admin per minute. Protects against
 * accidental scripts/double-clicks flipping the whole queue at once.
 */

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Simple per-admin in-memory rate limiter. Fine for a single Vercel instance
// under normal admin load; if we ever need cross-instance enforcement we
// can move this into the DB.
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_ACTIONS = 30
const adminActionHistory = new Map<string, number[]>()

function checkRateLimit(adminId: string): boolean {
  const now = Date.now()
  const history = (adminActionHistory.get(adminId) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  )
  if (history.length >= RATE_LIMIT_MAX_ACTIONS) {
    adminActionHistory.set(adminId, history)
    return false
  }
  history.push(now)
  adminActionHistory.set(adminId, history)
  return true
}

async function notifyCustomer(
  action: 'verify' | 'reject',
  email: string,
  name: string | null,
  plan: string,
  note: string,
  expiresAt: string | null = null,
) {
  // Customer-facing payment email, on the Resend payments channel
  // (from support@, replies forward to Gmail).
  const msg = action === 'verify'
    ? paymentVerifiedEmail(email, name, plan, expiresAt)
    : paymentRejectedEmail(email, name, note)
  await sendEmail(msg, 'payments')
}

export async function POST(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: 'too many actions — slow down and try again in a minute' },
      { status: 429 }
    )
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
    .select('id, user_id, user_email, user_name, plan, product, account_type, status')
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

    // Promote pending -> active in one write. Clear pending_plan so the
    // profile stops advertising a pending request.
    const { data: current } = await service
      .from('profiles').select('plan, plan_status, plan_expires_at, updates_until').eq('id', payment.user_id).maybeSingle()
    const permanent = current?.plan_status === 'active' && !current.plan_expires_at
    const product = payment.product as 'licence' | 'updates' | null
    let changes: Record<string, unknown>
    let expiresAt: string | null
    if (product === 'updates') {
      expiresAt = null
      changes = { updates_until: accessExpiry(current?.updates_until, UPDATE_MONTHS), pending_plan: null }
    } else if (product === 'licence') {
      // Someone with permanent access from an earlier plan already has
      // everything with no limit; buying again leaves that alone.
      const unlimited = permanent && !current?.updates_until && current?.plan === 'individual'
      expiresAt = null
      changes = {
        plan: 'individual', account_type: payment.account_type, plan_status: 'active',
        plan_expires_at: null, expiry_reminder_sent_at: null, pending_plan: null,
        updates_until: unlimited ? null : accessExpiry(current?.updates_until, UPDATE_MONTHS),
      }
    } else {
      expiresAt = permanent ? null : accessExpiry(current?.plan_expires_at)
      changes = {
        plan: payment.plan, account_type: payment.account_type, plan_status: 'active',
        plan_expires_at: expiresAt, expiry_reminder_sent_at: null, pending_plan: null,
      }
    }
    const { error: profErr } = await service
      .from('profiles')
      .update(changes)
      .eq('id', payment.user_id)
    if (profErr) {
      console.error('[admin/payments/verify] profile update failed:', profErr)
      return NextResponse.json({ error: 'payment verified but profile update failed' }, { status: 500 })
    }

    // fire-and-forget customer email
    notifyCustomer('verify', payment.user_email, payment.user_name, payment.plan, note, expiresAt)
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

  // On reject: clear the pending request only. Don't touch the user's
  // current plan or plan_status — they keep whatever access they had
  // before submitting. If they had no plan, they remain on the free trial
  // (or expired-trial 'free') exactly as before.
  await service
    .from('profiles')
    .update({ pending_plan: null })
    .eq('id', payment.user_id)

  notifyCustomer('reject', payment.user_email, payment.user_name, payment.plan, note)
  return NextResponse.json({ ok: true, action: 'rejected' })
}