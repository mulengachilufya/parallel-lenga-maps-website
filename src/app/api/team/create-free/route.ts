/**
 * POST /api/team/create-free — { name }
 *
 * Anyone signed in who is not on a team yet can open a free team
 * workspace: 2 seats, 3 datasets the owner chooses, no end date. Paying
 * later turns the same team into a paid one (Admin → Organizations, or the
 * sales pipeline's "Payment received"), keeping its projects and members.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { FREE_TEAM_SEATS } from '@/lib/pricing'
import { clientIp, checkIpRateLimit, rateLimitedResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function POST(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'unauthorized', message: 'Sign in first.' }, { status: 401 })

  let body: { name?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
  if (name.length < 2) return NextResponse.json({ error: 'validation', message: 'Give your team a name.' }, { status: 400 })

  const { data: profile } = await service.from('profiles').select('id, email, full_name, org_id').eq('id', user.id).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'no_profile', message: 'Your account is still being set up. Reload the page and try again.' }, { status: 409 })

  const rl = await checkIpRateLimit(service, 'create-free-team', clientIp(req), 5, 3600)
  if (!rl.ok) return rateLimitedResponse(rl, 'Too many teams created from here. Try again later.')

  const { data: org, error } = await service.from('organizations').insert({
    name, plan: 'free', seat_count: FREE_TEAM_SEATS, status: 'active', access_expires_at: null,
    contact_email: user.email.toLowerCase(), notes: 'Free team, created by the owner.',
  }).select('id').single()
  if (error || !org) {
    console.error('[team/create-free] create failed', error)
    return NextResponse.json({ error: 'create_failed', message: 'Could not create the team. Please try again.' }, { status: 500 })
  }
  const { error: memErr } = await service.from('organization_members').insert({
    org_id: org.id, user_id: user.id, role: 'owner',
    member_name: profile.full_name, member_email: user.email, joined_at: new Date().toISOString(),
  })
  if (memErr) {
    await service.from('organizations').delete().eq('id', org.id)
    return NextResponse.json({ error: 'member_failed', message: 'Could not create the team.' }, { status: 409 })
  }
  return NextResponse.json({ ok: true, org_id: org.id })
}
