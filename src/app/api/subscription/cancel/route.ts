/**
 * POST /api/subscription/cancel
 *
 * Marks the user's subscription as cancelled. Access stays active until
 * their current plan_expires_at — they paid for the period, they keep it.
 * Auto-renew is turned off and no further renewal reminders are sent.
 *
 * The user can resume at any time before expiry via /api/subscription/resume.
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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: fetchErr } = await service
    .from('profiles')
    .select('plan, plan_status, plan_expires_at, auto_renew_enabled')
    .eq('id', session.user.id)
    .single()

  if (fetchErr || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }
  if (profile.plan_status !== 'active') {
    return NextResponse.json({ error: 'Not an active subscription' }, { status: 400 })
  }

  const { error: upErr } = await service
    .from('profiles')
    .update({
      auto_renew_enabled: false,
      cancelled_at:       new Date().toISOString(),
    })
    .eq('id', session.user.id)

  if (upErr) {
    console.error('[cancel] failed to update profile:', upErr)
    return NextResponse.json({ error: 'Could not cancel' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    access_until: profile.plan_expires_at,
    plan:         profile.plan,
  })
}
