/**
 * POST /api/account/delete — { confirm: 'DELETE' }
 *
 * Deletes the signed-in person's account for good. Deleting the auth user
 * cascades to their profile, team membership, API keys, project roles and
 * direct messages. Things they made inside shared projects (layers,
 * comments, revisions) stay for the team, with their name kept on them.
 *
 * Teams:
 *   * a member simply leaves the team (the seat frees up);
 *   * an owner with teammates must remove them first, so nobody loses a
 *     workspace without warning;
 *   * an owner alone on a free team takes the team and its projects with
 *     them;
 *   * an owner alone on an active paid team is asked to email us first, so a
 *     paid plan is never thrown away by accident.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { deletePrefix } from '@/lib/r2'
import { listMemberships } from '@/lib/teams'
import { isExpired } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const fail = (error: string, message: string, status: number) => NextResponse.json({ error, message }, { status })

export async function POST(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return fail('unauthorized', 'Sign in first.', 401)

  let body: { confirm?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }
  if (body.confirm !== 'DELETE') return fail('confirm', 'Type DELETE to confirm.', 400)

  // Every team this person owns (they can be on several, migration 044).
  const owned = (await listMemberships(service, user.id)).filter((m) => m.role === 'owner')
  const deleteOrgs: string[] = []

  for (const membership of owned) {
    const { count } = await service.from('organization_members')
      .select('user_id', { count: 'exact', head: true }).eq('org_id', membership.org_id)
    if ((count ?? 0) > 1) {
      return fail('owner_has_members',
        'You own a team with other people in it. Remove them on the Team page first (or email lengamaps@gmail.com to hand the team to someone else), then delete your account.', 409)
    }
    const paidAndActive = membership.org.plan !== 'free' && membership.org.status === 'active' && !isExpired(membership.org.access_expires_at)
    if (paidAndActive) {
      return fail('paid_team',
        'Your paid team plan is still active. Email lengamaps@gmail.com and we will close it and delete your account for you.', 409)
    }
    deleteOrgs.push(membership.org_id)
  }

  // Downloads, sales notes and project items that point at this person or
  // their team are kept and unhooked by the database (ON DELETE SET NULL).
  // The one link that would block: a payment this person verified as admin.
  await service.from('manual_payments').update({ verified_by: null }).eq('verified_by', user.id)

  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[account/delete] auth delete failed', { user: user.id, error })
    return fail('delete_failed', 'We could not delete your account just now. Nothing was removed. Try again, or email lengamaps@gmail.com.', 500)
  }

  for (const deleteOrg of deleteOrgs) {
    // Uploaded files for the team's projects, then the team itself (its
    // projects, invites and messages go with it).
    try { await deletePrefix(`workspace-uploads/${deleteOrg}/`) }
    catch (err) { console.error('[account/delete] upload cleanup failed', { org: deleteOrg, err }) }
    const { error: orgErr } = await service.from('organizations').delete().eq('id', deleteOrg)
    if (orgErr) console.error('[account/delete] org delete failed (account already deleted)', { org: deleteOrg, orgErr })
  }

  await auth.auth.signOut().catch(() => {})
  return NextResponse.json({ ok: true })
}
