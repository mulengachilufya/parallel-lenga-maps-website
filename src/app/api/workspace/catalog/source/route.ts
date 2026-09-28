/**
 * GET /api/workspace/catalog/source?dataset=rivers&key=datasets/…
 *   → { url, proxy } for previewing a catalogue file on the map before it is
 *     added to a project. The key must be a real file of that dataset.
 * GET …&raw=1 → streams the file through this origin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { findDataset, listFilesForDataset } from '@/lib/api-datasets'
import { getDownloadUrl } from '@/lib/r2'
import { streamObject, webKeyFor, webLayerLinks } from '@/lib/workspace/web-layers'
import { datasetAllowed, jsonError, lockedDataset, requireWorkspace } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied

  const sp = req.nextUrl.searchParams
  const spec = findDataset(sp.get('dataset') ?? '')
  const key = sp.get('key') ?? ''
  if (!spec || !key) return jsonError('bad_request', 400)
  if (!datasetAllowed(gate, spec.id)) return lockedDataset()
  const files = await listFilesForDataset(spec).catch(() => [])
  if (!files.some((f) => f.r2_key === key)) return jsonError('unknown_file', 404)

  if (sp.get('raw') === '1') {
    return streamObject(sp.get('web') === '1' ? webKeyFor(key) : key, req.headers.get('range'))
  }

  const base = `/api/workspace/catalog/source?dataset=${encodeURIComponent(spec.id)}&key=${encodeURIComponent(key)}`
  const [url, web] = await Promise.all([
    getDownloadUrl(key, 900),
    webLayerLinks(key, base).catch(() => null),
  ])
  return NextResponse.json({ url, proxy: `${base}&raw=1`, key, web })
}
