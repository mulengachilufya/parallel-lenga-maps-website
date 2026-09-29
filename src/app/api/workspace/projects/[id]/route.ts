/**
 * GET    /api/workspace/projects/:id  — everything the workstation needs
 * PATCH  /api/workspace/projects/:id  — { name?, description?, map_state?,
 *        visibility?, default_role? }  (manager)
 * DELETE /api/workspace/projects/:id  — archive (manager)
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  commit, jsonError, loadProject, needRole, readJson, requireWorkspace, service, str,
} from '@/lib/workspace/server'
import { openTeam } from '@/lib/teams'
import { resolveRole, sanitizeMapState, type ProjectRole, type WsProjectBundle, type WsMember } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate, id)
  if (!project) {
    // A link to a project on another of the caller's teams: open that team
    // and ask the page to load again (every workspace route then scopes to it).
    if (/^[0-9a-f-]{36}$/i.test(id)) {
      const { data: other } = await service.from('workspace_projects').select('org_id').eq('id', id).is('archived_at', null).maybeSingle()
      if (other && other.org_id !== gate.membership.org_id && await openTeam(service, gate.user.id, other.org_id)) {
        return jsonError('switched_team', 409)
      }
    }
    return jsonError('not_found', 404)
  }

  const [layers, bookmarks, members, head, explicit] = await Promise.all([
    service.from('workspace_layers').select('*').eq('project_id', id)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    service.from('workspace_bookmarks').select('*').eq('project_id', id)
      .order('created_at', { ascending: true }),
    service.from('organization_members').select('user_id, role, member_name, member_email')
      .eq('org_id', gate.membership.org_id),
    service.from('workspace_revisions').select('seq').eq('project_id', id)
      .order('seq', { ascending: false }).limit(1).maybeSingle(),
    service.from('workspace_project_members').select('user_id, role').eq('project_id', id),
  ])
  const explicitRole = new Map((explicit.data ?? []).map((m) => [m.user_id as string, m.role as string]))
  const roleFor = (userId: string, orgRole: string): ProjectRole | null =>
    resolveRole(orgRole === 'owner' || project.created_by === userId, explicitRole.get(userId), project.visibility, project.default_role)

  const bundle: WsProjectBundle = {
    project,
    layers:    layers.data ?? [],
    bookmarks: bookmarks.data ?? [],
    members:   (members.data ?? []).map((m): WsMember => ({
      user_id: m.user_id,
      name:    m.member_name?.trim() || m.member_email || 'Team member',
      email:   m.member_email ?? '',
      role:    m.role,
      project_role: roleFor(m.user_id, m.role),
      explicit:     explicitRole.has(m.user_id),
    })),
    me:   { user_id: gate.user.id, name: gate.name, role: gate.membership.role, project_role: project.role },
    org:  { id: gate.membership.org_id, name: gate.membership.org.name },
    head: head.data?.seq ?? 0,
  }
  return NextResponse.json(bundle)
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)
  const denied = needRole(project, 'manager')
  if (denied) return denied

  const body = await readJson(req)
  const patch: Record<string, unknown> = {}
  const notes: string[] = []

  if (body.visibility === 'team' || body.visibility === 'private') {
    if (body.visibility !== project.visibility) {
      patch.visibility = body.visibility
      notes.push(body.visibility === 'private' ? 'made the project private to its members' : 'opened the project to the whole team')
    }
  }
  if (body.default_role === 'viewer' || body.default_role === 'editor') {
    if (body.default_role !== project.default_role) {
      patch.default_role = body.default_role
      notes.push(`set the team's default role to ${body.default_role}`)
    }
  }

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
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)
  const denied = needRole(project, 'manager')
  if (denied) return denied
  const { error } = await service.from('workspace_projects')
    .update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) return jsonError('archive_failed', 500)
  return NextResponse.json({ ok: true })
}
