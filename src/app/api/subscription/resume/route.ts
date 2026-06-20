/**
 * POST /api/subscription/resume
 *
 * Reverses a cancellation. Only meaningful before the current expiry —
 * after expiry the user is already on 'free' and needs to pay again,
 * which is the normal /dashboard/payment flow.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(_request: NextRequest) {
  const supabase = await createServerSupabase()
  // getUser() (verified). With getSession() a forged `sub` could resume
  // another user's subscription. (Security audit 2026-06-18.)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await service
    .from('profiles')
    .select('plan_status, plan_expires_at')
    .eq('id', user.id)
    .single()

  if (!profile || profile.plan_status !== 'active') {
    return NextResponse.json({ error: 'No active subscription to resume' }, { status: 400 })
  }
  if (profile.plan_expires_at && new Date(profile.plan_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Subscription has already expired' }, { status: 400 })
  }

  const { error: upErr } = await service
    .from('profiles')
    .update({
      auto_renew_enabled: true,
      cancelled_at:       null,
    })
    .eq('id', user.id)

  if (upErr) {
    console.error('[resume] failed:', upErr)
    return NextResponse.json({ error: 'Could not resume' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
