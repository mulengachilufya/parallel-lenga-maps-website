/**
 * GET /api/workspace/dms/voice/:id — play a voice note. Only the sender and
 * the recipient get through; they are redirected to a 10-minute signed URL
 * (so <audio src> works directly and the bucket stays private).
 */
import { NextRequest, NextResponse } from 'next/server'
import { VOICE_BUCKET } from '@/lib/workspace/dms'
import { jsonError, requireWorkspace, service } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError('not_found', 404)

  const { data: m } = await service.from('workspace_direct_messages')
    .select('sender_id, recipient_id, voice_path, org_id').eq('id', id).maybeSingle()
  const me = gate.user.id
  if (!m?.voice_path || m.org_id !== gate.membership.org_id || (m.sender_id !== me && m.recipient_id !== me)) {
    return jsonError('not_found', 404)
  }
  const { data, error } = await service.storage.from(VOICE_BUCKET).createSignedUrl(m.voice_path, 600)
  if (error || !data?.signedUrl) return jsonError('sign_failed', 500)
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
