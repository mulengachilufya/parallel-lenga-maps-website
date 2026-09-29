/**
 * GET /api/workspace/teams — every team the signed-in person is on, for the
 * workspace's "Your teams" page: name, plan, their role, how many people and
 * projects, and which team is open.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getMembership, isOrgActive, listMemberships } from '@/lib/teams'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET() {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [all, open] = await Promise.all([listMemberships(service, user.id), getMembership(service, user.id)])
  const ids = all.map((m) => m.org_id)
  const [members, projects] = ids.length
    ? await Promise.all([
        service.from('organization_members').select('org_id').in('org_id', ids),
        service.from('workspace_projects').select('org_id').in('org_id', ids).is('archived_at', null),
      ])
    : [{ data: [] }, { data: [] }]
  const count = (rows: { org_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.org_id === id).length

  return NextResponse.json({
    open: open?.org_id ?? null,
    teams: all.map((m) => ({
      org_id:        m.org_id,
      name:          m.org.name,
      plan:          m.org.plan === 'free' ? 'free' : 'paid',
      role:          m.role,
      seat_count:    m.org.seat_count,
      active:        isOrgActive(m),
      member_count:  count(members.data as { org_id: string }[] | null, m.org_id),
      project_count: count(projects.data as { org_id: string }[] | null, m.org_id),
    })),
  })
}
