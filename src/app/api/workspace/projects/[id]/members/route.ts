/**
 * PUT /api/workspace/projects/:id/members — { user_id, role } (manager only)
 *     role: 'viewer' | 'editor' | 'manager' sets that person's role on this
 *     project; role: null removes the explicit role so they fall back to
 *     the project's default (or lose access, if the project is private).
 *
 * Org owners are always managers and the project's creator always keeps
 * manager, so neither can be changed here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { commit, jsonError, loadProject, needRole, readJson, requireWorkspace, service, teammate } from '@/lib/workspace/server'
import { ROLE_LABEL, type ProjectRole } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const ROLES: ProjectRole[] = ['viewer', 'editor', 'manager']

export async function PUT(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)
  const denied = needRole(project, 'manager')
  if (denied) return denied

  const body = await readJson(req)
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  const role = body.role === null ? null : ROLES.includes(body.role as ProjectRole) ? body.role as ProjectRole : undefined
  if (role === undefined) return jsonError('bad_role', 400)

  const other = await teammate(gate, userId)
  if (!other) return jsonError('not_a_teammate', 404)
  const { data: org } = await service.from('organization_members').select('role')
    .eq('org_id', gate.membership.org_id).eq('user_id', userId).maybeSingle()
  if (org?.role === 'owner' || project.created_by === userId) return jsonError('always_manager', 409)

  const name = other.member_name?.trim() || other.member_email || 'a teammate'
  if (role === null) {
    const { error } = await service.from('workspace_project_members').delete().eq('project_id', id).eq('user_id', userId)
    if (error) return jsonError('update_failed', 500)
    await commit(id, gate, 'members', `Reset ${name} to the project default role`)
  } else {
    const { error } = await service.from('workspace_project_members')
      .upsert({ project_id: id, user_id: userId, role, added_by: gate.user.id })
    if (error) return jsonError('update_failed', 500)
    await commit(id, gate, 'members', `Made ${name} a ${ROLE_LABEL[role].toLowerCase()} on this project`)
  }
  return NextResponse.json({ ok: true })
}
