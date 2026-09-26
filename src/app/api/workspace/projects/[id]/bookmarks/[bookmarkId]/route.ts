/**
 * DELETE /api/workspace/projects/:id/bookmarks/:bookmarkId
 */
import { NextRequest, NextResponse } from 'next/server'
import { commit, jsonError, loadProject, requireWorkspace, service } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; bookmarkId: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, bookmarkId } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)
  if (!/^[0-9a-f-]{36}$/i.test(bookmarkId)) return jsonError('not_found', 404)

  const { data: bookmark } = await service.from('workspace_bookmarks')
    .select('name').eq('id', bookmarkId).eq('project_id', id).maybeSingle()
  if (!bookmark) return jsonError('not_found', 404)

  const { error } = await service.from('workspace_bookmarks').delete().eq('id', bookmarkId).eq('project_id', id)
  if (error) return jsonError('delete_failed', 500)

  const rev = await commit(id, gate, 'bookmark.remove', `Removed the view "${bookmark.name}"`)
  return NextResponse.json({ ok: true, rev })
}
