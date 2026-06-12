/**
 * DELETE /api/team/members — owner removes a member: { user_id }.
 *
 * Frees the seat (replace = remove + invite). The removed account drops to a
 * normal free profile: plan cleared, status 'free'. Owners cannot remove
 * themselves — ownership transfer is a manual admin operation for now.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getMembership } from '@/lib/teams'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function DELETE(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: 'no_team' }, { status: 404 })
  if (membership.role !== 'owner') {
    return NextResponse.json({ error: 'owner_only', message: 'Only the team owner can remove members.' }, { status: 403 })
  }

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }
  if (!body.user_id) return NextResponse.json({ error: 'validation' }, { status: 400 })
  if (body.user_id === user.id) {
    return NextResponse.json(
      { error: 'cannot_remove_self', message: 'Owners cannot remove themselves. Email lengamaps@gmail.com to transfer or close the team.' },
      { status: 400 },
    )
  }

  const { error, count } = await service
    .from('organization_members')
    .delete({ count: 'exact' })
    .eq('org_id', membership.org_id)   // scope: own org only
    .eq('user_id', body.user_id)
    .neq('role', 'owner')              // belt-and-braces: never delete an owner row
  if (error) {
    console.error('[team/members] remove failed:', error)
    return NextResponse.json({ error: 'remove_failed' }, { status: 500 })
  }
  if (!count) {
    return NextResponse.json({ error: 'not_found', message: 'That member is not on your team.' }, { status: 404 })
  }

  // Their access came from the team; the team took it back.
  // (The DB trigger already cleared profiles.org_id.)
  await service.from('profiles')
    .update({ plan: null, plan_status: 'free', plan_expires_at: null })
    .eq('id', body.user_id)
    .eq('plan', 'team')   // never clobber an unrelated personal plan

  return NextResponse.json({ ok: true })
}
