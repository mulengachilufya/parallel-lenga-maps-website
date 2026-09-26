/**
 * GET  /api/workspace/projects  — the org projects the caller can open (private
 *        ones only if they're on them), newest activity first, with their role
 * POST /api/workspace/projects  — { name, description?, template?, country_iso3? }
 *        → creates a project (r1). With a template, its Lenga datasets for
 *        that country are added as r2; datasets with no file for the
 *        country are skipped and reported.
 */
import { NextRequest, NextResponse } from 'next/server'
import { commit, jsonError, readJson, requireWorkspace, service, str } from '@/lib/workspace/server'
import type { ProjectRole } from '@/lib/workspace/types'
import { findDataset, listFilesForDataset, type ApiFile } from '@/lib/api-datasets'
import { fileVariant } from '@/lib/workspace/catalog'
import { AFRICAN_COUNTRIES, findTemplate } from '@/lib/workspace/templates'
import { defaultStyle } from '@/lib/workspace/types'
import { DEFAULT_MAP_STATE, type WsProjectSummary } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied

  const { data: projects, error } = await service
    .from('workspace_projects')
    .select('id, org_id, name, description, map_state, created_by, created_at, updated_at, visibility, default_role')
    .eq('org_id', gate.membership.org_id)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) return jsonError('list_failed', 500)

  const { data: mine } = await service.from('workspace_project_members').select('project_id, role').eq('user_id', gate.user.id)
  const explicit = new Map((mine ?? []).map((m) => [m.project_id as string, m.role as ProjectRole]))
  const roleOf = (p: { id: string; created_by: string | null; visibility: string; default_role: string }): ProjectRole | null =>
    gate.membership.role === 'owner' || p.created_by === gate.user.id ? 'manager'
    : explicit.get(p.id) ?? (p.visibility === 'team' ? p.default_role as ProjectRole : null)
  const visible = (projects ?? []).map((p) => ({ ...p, my_role: roleOf(p) })).filter((p) => p.my_role !== null)

  const ids = visible.map((p) => p.id)
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

  const out: WsProjectSummary[] = visible.map((p) => ({
    ...p,
    my_role:     p.my_role as ProjectRole,
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
  const template = findTemplate(body.template)
  const country = AFRICAN_COUNTRIES.find((c) => c.iso3 === body.country_iso3)
  if (body.template && !template) return jsonError('unknown_template', 400)
  if (template && !country) return jsonError('country_required', 400)

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
  if (!template || !country) return NextResponse.json({ id: project.id }, { status: 201 })

  // Resolve each template dataset to this country's file.
  const picked: { spec: NonNullable<ReturnType<typeof findDataset>>; file: ApiFile }[] = []
  const skipped: string[] = []
  await Promise.all(template.layers.map(async (tl, order) => {
    const spec = findDataset(tl.dataset)
    if (!spec) return
    const files = (await listFilesForDataset(spec, country.name).catch(() => [] as ApiFile[]))
      .filter((f) => f.country_iso3 === country.iso3)
    if (!files.length) { skipped[order] = spec.name; return }
    const pref = (tl.prefer ?? []).map((v) => files.find((f) => fileVariant(f) === v)).find(Boolean)
    picked[order] = { spec, file: pref ?? [...files].sort((a, b) => a.file_size_mb - b.file_size_mb)[0] }
  }))
  const rows = picked.filter(Boolean).map(({ spec, file }, i) => {
    const variant = fileVariant(file)
    return {
      project_id:   project.id,
      dataset_slug: spec.id,
      country:      file.country_name,
      r2_key:       file.r2_key,
      file_format:  file.file_format,
      label:        [spec.name, file.country_name, variant.length <= 24 ? variant : ''].filter(Boolean).join(' · ').slice(0, 160),
      style:        defaultStyle(spec.id),
      sort_order:   i,
      added_by:     gate.user.id,
      added_by_name: gate.name,
    }
  })
  if (rows.length) {
    const { error: layerErr } = await service.from('workspace_layers').insert(rows)
    if (!layerErr) {
      await commit(project.id, gate, 'template', `Started from the "${template.name}" template for ${country.name}: ${rows.length} Lenga datasets`)
    }
  }
  return NextResponse.json({ id: project.id, added: rows.length, skipped: skipped.filter(Boolean) }, { status: 201 })
}
