/**
 * GET /api/workspace/projects/:id/messages/:messageId/voice — play a voice
 * note left on a project. Only members of the project's organization get
 * through; they are redirected to a 10-minute signed URL so the bucket
 * itself stays private.
 */
import { NextRequest, NextResponse } from 'next/server'
import { VOICE_BUCKET } from '@/lib/workspace/dms'
import { jsonError, loadProject, requireWorkspace, service } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; messageId: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, messageId } = await params
  if (!(await loadProject(gate.membership.org_id, id))) return jsonError('not_found', 404)
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return jsonError('not_found', 404)

  const { data: m } = await service.from('workspace_messages')
    .select('voice_path, deleted_at').eq('id', messageId).eq('project_id', id).maybeSingle()
  // The path must sit in this org's own folder: defence in depth on top of the project check.
  if (!m?.voice_path || m.deleted_at || !m.voice_path.startsWith(`${gate.membership.org_id}/${id}/`)) {
    return jsonError('not_found', 404)
  }
  const { data, error } = await service.storage.from(VOICE_BUCKET).createSignedUrl(m.voice_path, 600)
  if (error || !data?.signedUrl) return jsonError('sign_failed', 500)
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } })
}
