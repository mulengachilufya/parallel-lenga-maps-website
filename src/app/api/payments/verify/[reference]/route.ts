import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LENCO_BASE = process.env.LENCO_SANDBOX === 'true'
  ? 'https://sandbox.lenco.co/access/v2'
  : 'https://api.lenco.co/access/v2'

const PLAN_PERIOD_DAYS = 30

/** Activate a user's plan in the profiles table (the source of truth). */
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
  { params }: { params: Promise<{ reference: string }> }
) {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reference } = await params

  // Ensure this reference belongs to the calling user
  const { data: payment, error: fetchError } = await serviceSupabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .eq('user_id', session.user.id)
    .single()

  if (fetchError || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  // Already confirmed (webhook got here first) — return immediately
  if (payment.status === 'successful') {
    return NextResponse.json({ status: 'successful', plan: payment.plan })
  }

  // Poll Lenco for the live status
  const lencoRes = await fetch(`${LENCO_BASE}/collections/status/${reference}`, {
    headers: {
      Authorization: `Bearer ${process.env.LENCO_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!lencoRes.ok) {
    console.error('[verify] Lenco returned', lencoRes.status)
    return NextResponse.json({ error: 'Lenco verification failed' }, { status: 502 })
  }

  const lencoData = await lencoRes.json()
  const txStatus   = lencoData?.data?.status as string | undefined
  const mmDetails  = lencoData?.data?.mobileMoneyDetails as Record<string, string> | undefined

  if (txStatus !== 'successful') {
    return NextResponse.json({ status: txStatus ?? 'pending' })
  }

  // ── Mark payment successful ────────────────────────────────────────────
  const { error: payErr } = await serviceSupabase
    .from('payments')
    .update({
      status:          'successful',
      operator:        mmDetails?.operator ?? null,
      lenco_reference: lencoData.data?.lencoReference ?? null,
    })
    .eq('reference', reference)

  if (payErr) {
    console.error('[verify] failed to update payments row:', payErr)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // ── Activate plan in profiles ──────────────────────────────────────────
  await activateProfile(payment.user_id, payment.plan, payment.account_type)

  return NextResponse.json({ status: 'successful', plan: payment.plan })
}
