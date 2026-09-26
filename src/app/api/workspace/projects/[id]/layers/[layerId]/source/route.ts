/**
 * GET /api/workspace/projects/:id/layers/:layerId/source
 *   → { url, proxy } — a 15-minute presigned R2 URL for the layer's file, plus
 *     a same-origin fallback the browser uses if the direct fetch is blocked.
 * GET …/source?raw=1
 *   → streams the file through this origin.
 *
 * Only members of the project's organization get either.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getDownloadUrl, getObjectStream } from '@/lib/r2'
import { jsonError, loadProject, requireWorkspace, service } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string; layerId: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, layerId } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)

  const { data: layer } = await service.from('workspace_layers')
    .select('r2_key').eq('id', layerId).eq('project_id', id).maybeSingle()
  if (!layer) return jsonError('not_found', 404)

  // Team uploads live in Supabase Storage (browser-friendly CORS), not R2.
  if (layer.r2_key.startsWith('upload:')) {
    const path = layer.r2_key.slice('upload:'.length)
    if (!path.startsWith(`${gate.membership.org_id}/`)) return jsonError('not_found', 404)
    const { data, error } = await service.storage.from('workspace-uploads').createSignedUrl(path, 900)
    if (error || !data) return jsonError('file_missing', 404)
    return NextResponse.json({ url: data.signedUrl, proxy: data.signedUrl, key: layer.r2_key })
  }

  if (req.nextUrl.searchParams.get('raw') === '1') {
    try {
      const obj = await getObjectStream(layer.r2_key)
      if (!obj.body) return jsonError('file_missing', 404)
      const headers: Record<string, string> = {
        'Content-Type':  obj.contentType,
        'Cache-Control': 'private, max-age=300',
      }
      if (obj.contentLength) headers['Content-Length'] = String(obj.contentLength)
      return new Response(obj.body, { headers })
    } catch (err) {
      console.error('[workspace/source] stream failed', { key: layer.r2_key, err })
      return jsonError('file_missing', 404)
    }
  }

  try {
    const url = await getDownloadUrl(layer.r2_key, 900)
    return NextResponse.json({
      url,
      proxy: `/api/workspace/projects/${id}/layers/${layerId}/source?raw=1`,
      key:   layer.r2_key,
    })
  } catch {
    return jsonError('sign_failed', 500)
  }
}
