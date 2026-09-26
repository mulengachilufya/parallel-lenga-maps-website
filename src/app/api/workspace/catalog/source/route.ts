/**
 * GET /api/workspace/catalog/source?dataset=rivers&key=datasets/…
 *   → { url, proxy } for previewing a catalogue file on the map before it is
 *     added to a project. The key must be a real file of that dataset.
 * GET …&raw=1 → streams the file through this origin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { findDataset, listFilesForDataset } from '@/lib/api-datasets'
import { getDownloadUrl, getObjectStream } from '@/lib/r2'
import { jsonError, requireWorkspace } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied

  const sp = req.nextUrl.searchParams
  const spec = findDataset(sp.get('dataset') ?? '')
  const key = sp.get('key') ?? ''
  if (!spec || !key) return jsonError('bad_request', 400)
  const files = await listFilesForDataset(spec).catch(() => [])
  if (!files.some((f) => f.r2_key === key)) return jsonError('unknown_file', 404)

  if (sp.get('raw') === '1') {
    try {
      const obj = await getObjectStream(key)
      if (!obj.body) return jsonError('file_missing', 404)
      const headers: Record<string, string> = { 'Content-Type': obj.contentType, 'Cache-Control': 'private, max-age=300' }
      if (obj.contentLength) headers['Content-Length'] = String(obj.contentLength)
      return new Response(obj.body, { headers })
    } catch {
      return jsonError('file_missing', 404)
    }
  }

  const url = await getDownloadUrl(key, 900)
  return NextResponse.json({
    url,
    proxy: `/api/workspace/catalog/source?dataset=${encodeURIComponent(spec.id)}&key=${encodeURIComponent(key)}&raw=1`,
    key,
  })
}
