/**
 * Admin: put people on a team or take them off, for any team.
 *
 * POST   /api/admin/orgs/members  { org_id, email }    add an existing account
 * DELETE /api/admin/orgs/members  { org_id, user_id }  remove a member
 *
 * Same rules as the owner's own controls: the person needs a Lenga Maps
 * account, the seat cap holds, and the owner can't be removed. Joining a
 * paid team puts the person on the team plan with the team's expiry;
 * leaving takes it back unless another paid team still carries it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
import { hasActivePaidTeam } from '@/lib/teams'
import { audit } from '@/lib/ops/log'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function admin(): Promise<string | null> {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  return user && isAdminEmail(user.email) ? (user.email ?? 'admin') : null
}

const bad = (message: string, status = 400) => NextResponse.json({ error: 'validation', message }, { status })
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export async function POST(req: NextRequest) {
  const who = await admin()
  if (!who) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isUuid(body.org_id) || !email) return bad('Team and email are required.')

  const [{ data: org }, { data: profile }, { count }] = await Promise.all([
    service.from('organizations').select('id, name, plan, seat_count, access_expires_at').eq('id', body.org_id).maybeSingle(),
    service.from('profiles').select('id, email, full_name').ilike('email', email).maybeSingle(),
    service.from('organization_members').select('user_id', { count: 'exact', head: true }).eq('org_id', body.org_id),
  ])
  if (!org) return bad('Team not found.', 404)
  if (!profile) return bad(`No Lenga Maps account exists for ${email}. Ask them to sign up first.`, 404)
  if ((count ?? 0) >= org.seat_count) return bad(`${org.name} has no free seats (${org.seat_count}). Add a seat first.`, 409)

  const { error } = await service.from('organization_members').insert({
    org_id: org.id, user_id: profile.id, role: 'member',
    member_name: profile.full_name, member_email: profile.email, joined_at: new Date().toISOString(),
  })
  if (error) {
    if (error.code === '23505') return bad(`${email} is already on ${org.name}.`, 409)
    return bad(error.message, 500)
  }
  if (org.plan !== 'free') {
    await service.from('profiles')
      .update({ plan: 'team', plan_status: 'active', plan_expires_at: org.access_expires_at, expiry_reminder_sent_at: null })
      .eq('id', profile.id)
  }
  await service.from('organization_invites').update({ status: 'accepted' })
    .eq('org_id', org.id).ilike('email', email).eq('status', 'pending')
  await audit(who, 'console', 'team_member_added', org.name, { org_id: org.id, email })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const who = await admin()
  if (!who) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
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
  return NextResponse.json({ ok: true })
}
