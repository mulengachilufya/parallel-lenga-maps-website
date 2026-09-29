/**
 * POST /api/team/switch — { org_id }: open another of your teams.
 *
 * People can be on many teams (migration 044). The team page, workspace and
 * entitlements all work on the team you have open (profiles.org_id); this
 * changes it, only ever to a team you are a member of.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { openTeam } from '@/lib/teams'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function POST(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { org_id?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const orgId = typeof body.org_id === 'string' ? body.org_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return NextResponse.json({ error: 'validation' }, { status: 400 })

  if (!(await openTeam(service, user.id, orgId))) {
    return NextResponse.json({ error: 'not_member', message: 'You are not on that team.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
