/**
 * Admin: put people on a team or take them off, for any team.
 *
 * POST   /api/admin/orgs/members  { org_id, email, project_id?, project_role? }
 *        Has an account: added now. No account: emailed an invite; the
 *        link signs them up and puts them in (and in the project).
 * DELETE /api/admin/orgs/members  { org_id, user_id }  remove a member
 *                                  { org_id, invite_id } cancel an invite
 *
 * Same rules as the owner's own controls: the person needs a Lenga Maps
 * account, the seat cap holds, and the owner can't be removed. Joining a
 * paid team puts the person on the team plan with the team's expiry;
 * leaving takes it back unless another paid team still carries it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { accessFor, can } from '@/lib/staff'
import { hasActivePaidTeam } from '@/lib/teams'
import { audit } from '@/lib/ops/log'
import { sendEmail, teamInviteEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function admin(): Promise<string | null> {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  return user && can(await accessFor(user.email), 'orgs') ? (user.email ?? 'admin') : null
}

const bad = (message: string, status = 400) => NextResponse.json({ error: 'validation', message }, { status })
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export async function POST(req: NextRequest) {
  const who = await admin()
  if (!who) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isUuid(body.org_id)) return bad('Team is required.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('Enter a valid email address.')
  const projectRole = ['viewer', 'editor', 'manager'].includes(String(body.project_role)) ? String(body.project_role) : 'editor'

  const [{ data: org }, { data: profile }, { count: used }, { data: pending }] = await Promise.all([
    service.from('organizations').select('id, name, plan, status, seat_count, access_expires_at').eq('id', body.org_id).maybeSingle(),
    service.from('profiles').select('id, email, full_name').ilike('email', email).maybeSingle(),
    service.from('organization_members').select('user_id', { count: 'exact', head: true }).eq('org_id', body.org_id),
    service.from('organization_invites').select('id, email').eq('org_id', body.org_id).eq('status', 'pending'),
  ])
  if (!org) return bad('Team not found.', 404)

  let project: { id: string; name: string } | null = null
  if (body.project_id) {
    if (!isUuid(body.project_id)) return bad('Unknown project.')
    const { data } = await service.from('workspace_projects').select('id, name')
      .eq('id', body.project_id).eq('org_id', org.id).is('archived_at', null).maybeSingle()
    if (!data) return bad('That project is not in this team.', 404)
    project = data
  }

  // Already on the team: only the project role (if any) is left to do.
  if (profile) {
    const { data: member } = await service.from('organization_members').select('user_id')
      .eq('org_id', org.id).eq('user_id', profile.id).maybeSingle()
    if (member) {
      if (!project) return bad(`${email} is already on ${org.name}.`, 409)
      await service.from('workspace_project_members').upsert({ project_id: project.id, user_id: profile.id, role: projectRole })
      await audit(who, 'console', 'project_role_set', project.name, { email, role: projectRole })
      return NextResponse.json({ ok: true, result: 'project', message: `${email} is now a ${projectRole} on ${project.name}.` })
    }
  }

  // Seats: members plus pending invites (their own pending invite aside).
  const otherPending = (pending ?? []).filter((i) => i.email.toLowerCase() !== email).length
  if ((used ?? 0) + otherPending >= org.seat_count) {
    return bad(`${org.name} has no free seats (${used ?? 0} members, ${otherPending} invites pending, ${org.seat_count} seats). Add a seat first.`, 409)
  }

  if (profile) {
    const { error } = await service.from('organization_members').insert({
      org_id: org.id, user_id: profile.id, role: 'member',
      member_name: profile.full_name, member_email: profile.email, joined_at: new Date().toISOString(),
    })
    if (error) return bad(error.message.includes('seat limit') ? `${org.name} has no free seats. Add a seat first.` : error.message, 500)
    if (org.plan !== 'free') {
      await service.from('profiles')
        .update({ plan: 'team', plan_status: 'active', plan_expires_at: org.access_expires_at, expiry_reminder_sent_at: null })
        .eq('id', profile.id)
    }
    if (project) await service.from('workspace_project_members').upsert({ project_id: project.id, user_id: profile.id, role: projectRole })
    await service.from('organization_invites').update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('org_id', org.id).ilike('email', email).eq('status', 'pending')
    await audit(who, 'console', 'team_member_added', org.name, { org_id: org.id, email, project: project?.name })
    return NextResponse.json({ ok: true, result: 'added', message: `${email} added to ${org.name}${project ? ` and ${project.name}` : ''}.` })
  }

  // No account yet: invite them. The emailed link takes them to sign up and
  // straight into the team (and project) once their account exists.
  await service.from('organization_invites').update({ status: 'revoked' })
    .eq('org_id', org.id).ilike('email', email).eq('status', 'pending')
  const { data: invite, error } = await service.from('organization_invites')
    .insert({ org_id: org.id, email, role: 'member', project_id: project?.id ?? null, project_role: project ? projectRole : null })
    .select('token').single()
  if (error || !invite) return bad(error?.message ?? 'Could not create the invite.', 500)
  const sent = await sendEmail(teamInviteEmail(email, org.name, 'Lenga Maps', invite.token)).catch(() => false)
  await audit(who, 'console', 'team_member_invited', org.name, { org_id: org.id, email, project: project?.name, email_sent: sent })
  return NextResponse.json({
    ok: true, result: 'invited', email_sent: sent,
    message: sent
      ? `${email} has no account yet, so we emailed them an invite. They join ${project ? project.name : org.name} as soon as they sign up from the link.`
      : `${email} has no account yet. The invite was saved but the email failed; send them this link: /team/join?token=${invite.token}`,
  })
}

export async function DELETE(req: NextRequest) {
  const who = await admin()
  if (!who) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  if (isUuid(body.org_id) && isUuid(body.invite_id)) {
    const { error } = await service.from('organization_invites').update({ status: 'revoked' })
      .eq('id', body.invite_id).eq('org_id', body.org_id).eq('status', 'pending')
    if (error) return bad(error.message, 500)
    return NextResponse.json({ ok: true, message: 'Invite cancelled. The seat is free again.' })
  }
  if (!isUuid(body.org_id) || !isUuid(body.user_id)) return bad('Team and member are required.')

  const { data: row } = await service.from('organization_members').select('role, member_email')
    .eq('org_id', body.org_id).eq('user_id', body.user_id).maybeSingle()
  if (!row) return bad('That person is not on this team.', 404)
  if (row.role === 'owner') return bad('The owner cannot be removed. Close or suspend the team instead.', 409)

  const { error } = await service.from('organization_members').delete()
    .eq('org_id', body.org_id).eq('user_id', body.user_id).neq('role', 'owner')
  if (error) return bad(error.message, 500)

  // Their explicit roles on this team's projects go with them.
  const { data: projects } = await service.from('workspace_projects').select('id').eq('org_id', body.org_id)
  const ids = (projects ?? []).map((p) => p.id as string)
  if (ids.length) await service.from('workspace_project_members').delete().eq('user_id', body.user_id).in('project_id', ids)

  if (!(await hasActivePaidTeam(service, body.user_id))) {
    await service.from('profiles')
      .update({ plan: null, plan_status: 'free', plan_expires_at: null })
      .eq('id', body.user_id).eq('plan', 'team')
  }
  await audit(who, 'console', 'team_member_removed', String(row.member_email ?? body.user_id), { org_id: body.org_id })
  return NextResponse.json({ ok: true, message: `${row.member_email ?? 'Member'} removed from the team.` })
}
