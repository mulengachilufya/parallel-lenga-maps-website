/**
 * POST /api/team/join — accept a team invitation: { token }.
 *
 * Rules (defense in depth — the DB trigger re-checks the seat cap):
 *   * caller must be signed in,
 *   * the invite must be pending and the token must match,
 *   * the invite email must match the caller's account email (an invite is
 *     a seat reservation for ONE address, not a shareable link),
 *   * joining a team you are already on is a no-op success (people can be
 *     on many teams, migration 044).
 *
 * On success the caller becomes a member, their profile flips to plan='team'
 * (active until the org's access_expires_at; org status is the kill switch), and the invite
 * is marked accepted.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isExpired } from '@/lib/pricing'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

/**
 * GET /api/team/join?token=…  (no sign in needed) → who is inviting, so the
 *   join page can say "Join Kafue Consultants" and prefill sign up.
 * GET /api/team/join          (signed in) → pending invites for my email, so
 *   someone who lost the link can still join from their dashboard.
 */
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get('token') ?? '').trim()
  if (token) {
    const { data: invite } = await service
      .from('organization_invites')
      .select('email, status, organizations!inner(name, plan)')
      .eq('token', token)
      .maybeSingle()
    if (!invite || invite.status === 'revoked') {
      return NextResponse.json({ error: 'invalid_invite', message: 'This invite does not exist or was revoked. Ask your team owner for a new link.' }, { status: 404 })
    }
    const orgRaw = (invite as { organizations: unknown }).organizations
    const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name: string; plan?: string }
    return NextResponse.json({ org_name: org.name, free: org.plan === 'free', email: invite.email, used: invite.status !== 'pending' })
  }

  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user?.email) return NextResponse.json({ invites: [] })
  const { data } = await service
    .from('organization_invites')
    .select('id, created_at, organizations!inner(name, plan, status)')
    .ilike('email', user.email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  const invites = (data ?? []).map((i) => {
    const o = (Array.isArray(i.organizations) ? i.organizations[0] : i.organizations) as { name: string; plan?: string; status: string }
    return { id: i.id, org_name: o.name, free: o.plan === 'free', active: o.status === 'active' }
  }).filter((i) => i.active)
  return NextResponse.json({ invites })
}

export async function POST(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'unauthorized', message: 'Sign in first, then open the invite link again.' }, { status: 401 })
  }

  // Accept by the link's token, or by invite id from the dashboard banner
  // (the email match below is what authorises either).
  let body: { token?: string; invite_id?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const token = (body.token ?? '').trim()
  const inviteId = (body.invite_id ?? '').trim()
  if (!token && !inviteId) return NextResponse.json({ error: 'validation', message: 'Missing invite token.' }, { status: 400 })

  const q = service
    .from('organization_invites')
    .select('id, org_id, email, role, status, organizations!inner(name, status, access_expires_at, plan)')
  const { data: invite } = await (token ? q.eq('token', token) : q.eq('id', inviteId)).maybeSingle()

  if (!invite || !['pending', 'accepted'].includes(invite.status)) {
    return NextResponse.json(
      { error: 'invalid_invite', message: 'This invite does not exist or was revoked. Ask your team owner for a new link.' },
      { status: 404 },
    )
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: 'email_mismatch', message: `This invite was sent to ${invite.email}. Sign in with that address to accept it.` },
      { status: 403 },
    )
  }
  const orgRaw = (invite as { organizations: unknown }).organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name: string; status: string; access_expires_at: string | null; plan?: string }

  // Already in this very team (a double click, a retried request, the link
  // opened twice): that is success, not an error.
  const { data: already } = await service.from('organization_members')
    .select('org_id').eq('user_id', user.id).eq('org_id', invite.org_id).maybeSingle()
  if (already) {
    if (invite.status === 'pending') {
      await service.from('organization_invites').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', invite.id)
    }
    return NextResponse.json({ ok: true, org_name: org.name })
  }
  if (invite.status !== 'pending') {
    return NextResponse.json(
      { error: 'invalid_invite', message: 'This invite was already used. Ask your team owner for a new link.' },
      { status: 404 },
    )
  }
  if (org.status !== 'active' || isExpired(org.access_expires_at)) {
    return NextResponse.json(
      { error: 'org_inactive', message: 'This team\'s plan is not active right now.' },
      { status: 403 },
    )
  }

  const { data: profile } = await service
    .from('profiles')
    .select('id, email, full_name, org_id')
    .eq('id', user.id)
    .single()
  const { error: memErr } = await service.from('organization_members').insert({
    org_id:       invite.org_id,
    user_id:      user.id,
    role:         invite.role,
    member_name:  profile?.full_name ?? null,
    member_email: user.email,
    joined_at:    new Date().toISOString(),
  })
  if (memErr) {
    const seatsFull = memErr.message.includes('seat limit reached')
    return NextResponse.json(
      {
        error:   seatsFull ? 'seats_full' : 'join_failed',
        message: seatsFull
          ? 'Your team has no free seats right now. Ask your team owner to free one up.'
          : memErr.message,
      },
      { status: seatsFull ? 409 : 500 },
    )
  }

  await Promise.all([
    service.from('organization_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id),
    // Paid teams carry every member on plan 'team'. A free team's members
    // keep their own free profile; the team's 3 datasets come through the
    // membership (src/lib/entitlements.ts).
    org.plan === 'free' ? Promise.resolve() : service.from('profiles')
      .update({ plan: 'team', plan_status: 'active', plan_expires_at: org.access_expires_at })
      .eq('id', user.id),
  ])

  return NextResponse.json({ ok: true, org_name: org.name })
}
