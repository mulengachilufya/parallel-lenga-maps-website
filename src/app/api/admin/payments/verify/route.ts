import { after, NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { accessFor, can } from '@/lib/staff'
import { computeGrant, GRANT_PROFILE_FIELDS } from '@/lib/payments/grant'
import { deliverPaymentNotifications } from '@/lib/jobs/payment-notifications'

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

export async function POST(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !can(await accessFor(user.email), 'payments_approve')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: 'too many actions — slow down and try again in a minute' },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
  const action = body?.action
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : ''
  if (!reference || (action !== 'verify' && action !== 'reject')) {
    return NextResponse.json({ error: 'reference and valid action required' }, { status: 400 })
  }

  // Look up the payment.
  const { data: payment, error: payErr } = await service
    .from('manual_payments')
    .select('id, user_id, plan, product, account_type')
    .eq('reference', reference)
    .single()
  if (payErr || !payment) {
    return NextResponse.json({ error: 'payment not found' }, { status: 404 })
  }
  const target = action === 'verify' ? 'verified' : 'rejected'
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: current, error: profileError } = await service
      .from('profiles').select(GRANT_PROFILE_FIELDS).eq('id', payment.user_id).maybeSingle()
    if (profileError) return NextResponse.json({ error: 'could not load profile' }, { status: 500 })
    const { changes, expiresAt } = computeGrant(payment, current)
    const { data, error } = await service.rpc('decide_manual_payment', {
      p_reference: reference,
      p_actor: user.id,
      p_status: target,
      p_note: note || null,
      p_expected: current,
      p_changes: action === 'verify' ? changes : {},
      p_expires_at: expiresAt,
    })
    if (error) {
      console.error('[admin/payments/verify] transaction failed', error)
      return NextResponse.json({ error: 'could not update payment and access' }, { status: 500 })
    }
    if (data === 'retry') continue
    if (data === 'not_found') return NextResponse.json({ error: 'payment not found' }, { status: 404 })
    if (data === 'conflict') return NextResponse.json({ error: 'payment already decided' }, { status: 409 })
    if (data === 'profile_missing') return NextResponse.json({ error: 'customer profile missing' }, { status: 409 })
    if (data !== 'updated' && data !== 'already') {
      return NextResponse.json({ error: 'unexpected payment result' }, { status: 500 })
    }
    after(async () => { await deliverPaymentNotifications(service, String(payment.id)) })
    return NextResponse.json({ ok: true, action: target, already: data === 'already' })
  }
  return NextResponse.json({ error: 'account changed during approval, please retry' }, { status: 409 })
}
