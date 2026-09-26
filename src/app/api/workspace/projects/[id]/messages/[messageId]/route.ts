/**
 * PATCH  /api/workspace/projects/:id/messages/:messageId  — { body } author only
 * DELETE /api/workspace/projects/:id/messages/:messageId  — author or org owner;
 *        soft delete so thread structure and Realtime updates stay intact.
 */
import { NextRequest, NextResponse } from 'next/server'
import { jsonError, loadProject, readJson, requireWorkspace, service } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; messageId: string }> }

async function load(projectId: string, messageId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return null
  const { data } = await service.from('workspace_messages')
    .select('id, author_id, deleted_at').eq('id', messageId).eq('project_id', projectId).maybeSingle()
  return data
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, messageId } = await params
  if (!(await loadProject(gate.membership.org_id, id))) return jsonError('not_found', 404)
  const msg = await load(id, messageId)
  if (!msg || msg.deleted_at) return jsonError('not_found', 404)
  if (msg.author_id !== gate.user.id) return jsonError('forbidden', 403)

  const input = await readJson(req)
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n/g, '\n').trim().slice(0, 4000) : ''
  if (!body) return jsonError('body_required', 400)

  const { data, error } = await service.from('workspace_messages')
    .update({ body, edited_at: new Date().toISOString() }).eq('id', messageId).select('*').single()
  if (error) return jsonError('update_failed', 500)
  return NextResponse.json({ message: data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, messageId } = await params
  if (!(await loadProject(gate.membership.org_id, id))) return jsonError('not_found', 404)
  const msg = await load(id, messageId)
  if (!msg || msg.deleted_at) return jsonError('not_found', 404)
  if (msg.author_id !== gate.user.id && gate.membership.role !== 'owner') return jsonError('forbidden', 403)

  const { error } = await service.from('workspace_messages')
    .update({ deleted_at: new Date().toISOString(), body: '(deleted)' }).eq('id', messageId)
  if (error) return jsonError('delete_failed', 500)
  return NextResponse.json({ ok: true })
}
