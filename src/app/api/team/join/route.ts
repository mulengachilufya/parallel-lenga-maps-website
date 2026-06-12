/**
 * POST /api/team/join — accept a team invitation: { token }.
 *
 * Rules (defense in depth — the DB trigger re-checks the seat cap):
 *   * caller must be signed in,
 *   * the invite must be pending and the token must match,
 *   * the invite email must match the caller's account email (an invite is
 *     a seat reservation for ONE address, not a shareable link),
 *   * the caller must not already belong to an org (UNIQUE enforces this too).
 *
 * On success the caller becomes a member, their profile flips to plan='team'
 * (active, no expiry — the org's status is the kill switch), and the invite
 * is marked accepted.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function POST(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'unauthorized', message: 'Sign in first, then open the invite link again.' }, { status: 401 })
  }

  let body: { token?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const token = (body.token ?? '').trim()
  if (!token) return NextResponse.json({ error: 'validation', message: 'Missing invite token.' }, { status: 400 })

  const { data: invite } = await service
    .from('organization_invites')
    .select('id, org_id, email, role, status, organizations!inner(name, status)')
    .eq('token', token)
    .maybeSingle()

  if (!invite || invite.status !== 'pending') {
    return NextResponse.json(
      { error: 'invalid_invite', message: 'This invite does not exist, was revoked, or was already used.' },
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
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name: string; status: string }
  if (org.status !== 'active') {
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
  if (profile?.org_id) {
    return NextResponse.json(
      { error: 'already_in_org', message: 'Your account already belongs to a team.' },
      { status: 409 },
    )
  }

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
    service.from('profiles')
      .update({ plan: 'team', plan_status: 'active', plan_expires_at: null })
      .eq('id', user.id),
  ])

  return NextResponse.json({ ok: true, org_name: org.name })
}
