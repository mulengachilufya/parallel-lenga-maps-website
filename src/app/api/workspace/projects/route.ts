/**
 * GET  /api/workspace/projects  — the caller's org projects, newest activity first
 * POST /api/workspace/projects  — { name, description? } → creates a project (r1)
 */
import { NextRequest, NextResponse } from 'next/server'
import { commit, jsonError, readJson, requireWorkspace, service, str } from '@/lib/workspace/server'
import { DEFAULT_MAP_STATE, type WsProjectSummary } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied

  const { data: projects, error } = await service
    .from('workspace_projects')
    .select('id, org_id, name, description, map_state, created_by, created_at, updated_at')
    .eq('org_id', gate.membership.org_id)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) return jsonError('list_failed', 500)

  const ids = (projects ?? []).map((p) => p.id)
  const [layers, revs] = await Promise.all([
    ids.length
      ? service.from('workspace_layers').select('project_id').in('project_id', ids)
      : Promise.resolve({ data: [] as { project_id: string }[] }),
    // One tiny query per project: an org has tens of projects, not thousands.
    Promise.all(ids.map((id) =>
      service.from('workspace_revisions')
        .select('project_id, seq, author_name, summary, created_at')
        .eq('project_id', id)
        .order('seq', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )),
  ])

  const counts = new Map<string, number>()
  for (const l of layers.data ?? []) counts.set(l.project_id, (counts.get(l.project_id) ?? 0) + 1)
  const latest = new Map<string, WsProjectSummary['last_rev']>()
  for (const r of revs) if (r.data) latest.set(r.data.project_id, r.data)

  const out: WsProjectSummary[] = (projects ?? []).map((p) => ({
    ...p,
    layer_count: counts.get(p.id) ?? 0,
    last_rev:    latest.get(p.id) ?? null,
  }))

  return NextResponse.json({
    projects: out,
    org: { id: gate.membership.org_id, name: gate.membership.org.name },
    me:  { user_id: gate.user.id, name: gate.name, role: gate.membership.role },
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied

  const body = await readJson(req)
  const name = str(body.name, 120)
  const description = str(body.description, 2000)
  if (!name) return jsonError('name_required', 400)

  const { data: project, error } = await service
    .from('workspace_projects')
    .insert({
      org_id: gate.membership.org_id,
      name,
      description,
      map_state: DEFAULT_MAP_STATE,
      created_by: gate.user.id,
    })
    .select('id')
    .single()
  if (error || !project) return jsonError('create_failed', 500)

  await commit(project.id, gate, 'create', `Created the project "${name}"`)
  return NextResponse.json({ id: project.id }, { status: 201 })
}
