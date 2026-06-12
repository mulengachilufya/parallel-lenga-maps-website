/**
 * POST   /api/team/invite — owner invites an email to the team: { email }.
 *                           Counts members + pending invites against the
 *                           seat cap so the owner can never over-promise.
 * DELETE /api/team/invite — owner revokes a pending invite: { id }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getMembership, isOrgActive } from '@/lib/teams'
import { sendEmail, teamInviteEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function requireOwner() {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { denied: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const membership = await getMembership(service, user.id)
  if (!membership) return { denied: NextResponse.json({ error: 'no_team' }, { status: 404 }) }
  if (membership.role !== 'owner') {
    return { denied: NextResponse.json({ error: 'owner_only', message: 'Only the team owner can manage seats.' }, { status: 403 }) }
  }
  return { user, membership }
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner()
  if ('denied' in gate) return gate.denied
  const { user, membership } = gate

  if (!isOrgActive(membership)) {
    return NextResponse.json(
      { error: 'org_inactive', message: 'Your team plan is not active. Contact lengamaps@gmail.com.' },
      { status: 403 },
    )
  }

  let body: { email?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'validation', message: 'Enter a valid email address.' }, { status: 400 })
  }

  // Seat math: occupied + promised must stay within the subscription.
  const [{ count: used }, { count: pending }] = await Promise.all([
    service.from('organization_members').select('user_id', { count: 'exact', head: true }).eq('org_id', membership.org_id),
    service.from('organization_invites').select('id', { count: 'exact', head: true }).eq('org_id', membership.org_id).eq('status', 'pending'),
  ])
  if ((used ?? 0) + (pending ?? 0) >= membership.org.seat_count) {
    return NextResponse.json(
      {
        error:   'seats_full',
        message: `All ${membership.org.seat_count} seats are used or reserved by pending invites. Remove a member, revoke an invite, or ask us to add seats.`,
      },
      { status: 409 },
    )
  }

  // Already on the team?
  const { data: existing } = await service
    .from('organization_members')
    .select('user_id')
    .eq('org_id', membership.org_id)
    .ilike('member_email', email)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'already_member', message: 'That address is already on your team.' }, { status: 409 })
  }

  const { data: invite, error } = await service
    .from('organization_invites')
    .insert({ org_id: membership.org_id, email, role: 'member' })
    .select('id, email, token, created_at')
    .single()
  if (error || !invite) {
    // Unique partial index → duplicate pending invite.
    const dup = error?.code === '23505'
    return NextResponse.json(
      { error: dup ? 'invite_exists' : 'create_failed', message: dup ? 'There is already a pending invite for that address.' : error?.message },
      { status: dup ? 409 : 500 },
    )
  }

  // Owner's name for a friendlier email. Best-effort everything.
  const { data: me } = await service
    .from('organization_members')
    .select('member_name').eq('org_id', membership.org_id).eq('user_id', user.id).maybeSingle()
  const sent = await sendEmail(
    teamInviteEmail(email, membership.org.name, me?.member_name ?? null, invite.token),
  ).catch(() => false)

  return NextResponse.json({ ok: true, invite: { id: invite.id, email: invite.email, created_at: invite.created_at }, email_sent: sent })
}

export async function DELETE(req: NextRequest) {
  const gate = await requireOwner()
  if ('denied' in gate) return gate.denied
  const { membership } = gate

  let body: { id?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }
  if (!body.id) return NextResponse.json({ error: 'validation' }, { status: 400 })

  const { error } = await service
    .from('organization_invites')
    .update({ status: 'revoked' })
    .eq('id', body.id)
    .eq('org_id', membership.org_id)   // owners can only touch their own org
    .eq('status', 'pending')
  if (error) {
    console.error('[team/invite] revoke failed:', error)
    return NextResponse.json({ error: 'revoke_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
