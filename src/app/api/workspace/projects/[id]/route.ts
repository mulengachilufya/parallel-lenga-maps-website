/**
 * GET    /api/workspace/projects/:id  — everything the workstation needs
 * PATCH  /api/workspace/projects/:id  — { name?, description?, map_state? }
 * DELETE /api/workspace/projects/:id  — archive (owner or the project's creator)
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  commit, jsonError, loadProject, readJson, requireWorkspace, service, str,
} from '@/lib/workspace/server'
import { sanitizeMapState, type WsProjectBundle, type WsMember } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)

  const [layers, bookmarks, members, head] = await Promise.all([
    service.from('workspace_layers').select('*').eq('project_id', id)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    service.from('workspace_bookmarks').select('*').eq('project_id', id)
      .order('created_at', { ascending: true }),
    service.from('organization_members').select('user_id, role, member_name, member_email')
      .eq('org_id', gate.membership.org_id),
    service.from('workspace_revisions').select('seq').eq('project_id', id)
      .order('seq', { ascending: false }).limit(1).maybeSingle(),
  ])

  const bundle: WsProjectBundle = {
    project,
    layers:    layers.data ?? [],
    bookmarks: bookmarks.data ?? [],
    members:   (members.data ?? []).map((m): WsMember => ({
      user_id: m.user_id,
      name:    m.member_name?.trim() || m.member_email || 'Team member',
      email:   m.member_email ?? '',
      role:    m.role,
    })),
    me:   { user_id: gate.user.id, name: gate.name, role: gate.membership.role },
    org:  { id: gate.membership.org_id, name: gate.membership.org.name },
    head: head.data?.seq ?? 0,
  }
  return NextResponse.json(bundle)
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)

  const body = await readJson(req)
  const patch: Record<string, unknown> = {}
  const notes: string[] = []

  if ('name' in body) {
    const name = str(body.name, 120)
    if (!name) return jsonError('name_required', 400)
    if (name !== project.name) { patch.name = name; notes.push(`renamed the project to "${name}"`) }
  }
  if ('description' in body) {
    const description = str(body.description, 2000)
    if (description !== project.description) { patch.description = description; notes.push('edited the description') }
  }
  if ('map_state' in body) {
    patch.map_state = sanitizeMapState(body.map_state, project.map_state)
    notes.push('set the project view')
  }
  if (!notes.length) return NextResponse.json({ ok: true, unchanged: true })

  const { error } = await service.from('workspace_projects').update(patch).eq('id', id)
  if (error) return jsonError('update_failed', 500)

  const summary = notes.join(', ')
  const rev = await commit(id, gate, 'project', summary.charAt(0).toUpperCase() + summary.slice(1))
  return NextResponse.json({ ok: true, rev })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)
  if (gate.membership.role !== 'owner' && project.created_by !== gate.user.id) {
    return jsonError('forbidden', 403)
  }
  const { error } = await service.from('workspace_projects')
    .update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) return jsonError('archive_failed', 500)
  return NextResponse.json({ ok: true })
}
