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
import { getDownloadUrl } from '@/lib/r2'
import { streamObject, webKeyFor, webLayerLinks } from '@/lib/workspace/web-layers'
import { datasetAllowed, jsonError, loadProject, lockedDataset, requireWorkspace, service } from '@/lib/workspace/server'
import { UPLOAD_PREFIX, WHOLE_FILE_MAX } from '@/lib/workspace/upload-limits'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string; layerId: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, layerId } = await params
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)

  const { data: layer } = await service.from('workspace_layers')
    .select('r2_key, dataset_slug, file_format, file_bytes').eq('id', layerId).eq('project_id', id).maybeSingle()
  if (!layer) return jsonError('not_found', 404)

  const base = `/api/workspace/projects/${id}/layers/${layerId}/source`

  // Team uploads in R2: only the team's own folder.
  if (layer.dataset_slug === 'upload' && layer.r2_key.startsWith(`${UPLOAD_PREFIX}/`)) {
    if (!layer.r2_key.startsWith(`${UPLOAD_PREFIX}/${gate.membership.org_id}/`)) return jsonError('not_found', 404)
    if (req.nextUrl.searchParams.get('raw') === '1') return streamObject(layer.r2_key, req.headers.get('range'))
    try {
      // Rasters too big to open whole are streamed straight from the file
      // (the import only accepts those that are Cloud Optimized GeoTIFFs).
      const stream = Number(layer.file_bytes) > WHOLE_FILE_MAX && /tiff?/i.test(layer.file_format)
      const url = await getDownloadUrl(layer.r2_key, stream ? 6 * 3600 : 900)
      return NextResponse.json({
        url, proxy: `${base}?raw=1`, key: layer.r2_key,
        web: stream ? { url, proxy: `${base}?raw=1` } : null,
      })
    } catch {
      return jsonError('sign_failed', 500)
    }
  }

  // Early uploads were kept in Supabase Storage.
  if (layer.r2_key.startsWith('upload:')) {
    const path = layer.r2_key.slice('upload:'.length)
    if (!path.startsWith(`${gate.membership.org_id}/`)) return jsonError('not_found', 404)
    const { data, error } = await service.storage.from('workspace-uploads').createSignedUrl(path, 900)
    if (error || !data) return jsonError('file_missing', 404)
    return NextResponse.json({ url: data.signedUrl, proxy: data.signedUrl, key: layer.r2_key })
  }

  if (!datasetAllowed(gate, layer.dataset_slug)) return lockedDataset()

  const sp = req.nextUrl.searchParams
  if (sp.get('raw') === '1') {
    const key = sp.get('web') === '1' ? webKeyFor(layer.r2_key) : layer.r2_key
    return streamObject(key, req.headers.get('range'))
  }

  try {
    const [url, web] = await Promise.all([
      getDownloadUrl(layer.r2_key, 900),
      webLayerLinks(layer.r2_key, base).catch(() => null),
    ])
    return NextResponse.json({ url, proxy: `${base}?raw=1`, key: layer.r2_key, web })
  } catch {
    return jsonError('sign_failed', 500)
  }
}
