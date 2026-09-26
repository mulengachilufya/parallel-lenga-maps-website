/**
 * POST /api/workspace/projects/:id/duplicate — { name } (editor or manager)
 *
 * A new project with the same layers, styles, saved views, brief and map
 * view: for consultancies that run the same kind of job again and again.
 * Files the team uploaded are copied into the new project's folder, so the
 * two projects never share storage. Discussion and history are not copied;
 * the new project's history starts with where it came from.
 */
import { NextRequest, NextResponse } from 'next/server'
import { commit, jsonError, loadProject, needRole, readJson, requireWorkspace, service, str } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

const UPLOAD_BUCKET = 'workspace-uploads'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const source = await loadProject(gate, id)
  if (!source) return jsonError('not_found', 404)
  const denied = needRole(source, 'editor')
  if (denied) return denied

  const body = await readJson(req)
  const name = str(body.name, 120) || `${source.name} (copy)`.slice(0, 120)

  const [layers, bookmarks, head] = await Promise.all([
    service.from('workspace_layers').select('*').eq('project_id', id).order('sort_order', { ascending: true }),
    service.from('workspace_bookmarks').select('*').eq('project_id', id),
    service.from('workspace_revisions').select('seq').eq('project_id', id).order('seq', { ascending: false }).limit(1).maybeSingle(),
  ])

  const { data: project, error } = await service.from('workspace_projects').insert({
    org_id: gate.membership.org_id, name, description: source.description,
    map_state: source.map_state, created_by: gate.user.id,
  }).select('id').single()
  if (error || !project) return jsonError('create_failed', 500)

  const oldPrefix = `${gate.membership.org_id}/${id}/`
  const newPrefix = `${gate.membership.org_id}/${project.id}/`
  const rows = []
  for (const l of layers.data ?? []) {
    let r2 = l.r2_key as string
    if (r2.startsWith(`upload:${oldPrefix}`)) {
      const from = r2.slice('upload:'.length)
      const to = newPrefix + from.slice(oldPrefix.length)
      const { error: cpErr } = await service.storage.from(UPLOAD_BUCKET).copy(from, to)
      if (cpErr) continue            // the source file is gone; leave that layer out
      r2 = `upload:${to}`
    }
    rows.push({
      project_id: project.id, dataset_slug: l.dataset_slug, country: l.country, r2_key: r2,
      file_format: l.file_format, label: l.label, style: l.style, sort_order: l.sort_order,
      added_by: gate.user.id, added_by_name: gate.name,
    })
  }
  if (rows.length) await service.from('workspace_layers').insert(rows)
  const views = (bookmarks.data ?? []).map((b) => ({
    project_id: project.id, name: b.name, lng: b.lng, lat: b.lat, zoom: b.zoom,
    created_by: gate.user.id, created_by_name: gate.name,
  }))
  if (views.length) await service.from('workspace_bookmarks').insert(views)

  await commit(project.id, gate, 'create',
    `Duplicated "${source.name}" at r${head.data?.seq ?? 0}: ${rows.length} layer${rows.length === 1 ? '' : 's'}, ${views.length} saved view${views.length === 1 ? '' : 's'}`)
  return NextResponse.json({ id: project.id }, { status: 201 })
}
