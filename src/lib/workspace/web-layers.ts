// src/lib/workspace/web-layers.ts
//
// Server side: the "web version" of a catalogue raster.
//
// Catalogue rasters are stored as the files people download (a 1 GB land
// cover GeoTIFF, a zipped DEM). Loading those into a browser is what made the
// workspace slow. The build-web-layers job (.github/workflows/build-web-layers.yml)
// writes a Cloud Optimized GeoTIFF next to each one, at a predictable key.
// A COG has internal tiles and zoomed-out overviews, so the map reads only
// the few hundred kilobytes it needs for the current view, over HTTP Range
// requests, instead of the whole file.

import { NextResponse } from 'next/server'
import { getDownloadUrl, getObjectStream, objectExists } from '@/lib/r2'

/** Where the web version of a catalogue file lives. */
export function webKeyFor(r2Key: string): string {
  return `web/${r2Key.replace(/\.(zip|tiff?)$/i, '')}.cog.tif`
}

// Existence checks are cached per server instance: a web version, once
// built, does not go away, and a missing one is rechecked every few minutes.
const seen = new Map<string, { ok: boolean; at: number }>()
const RECHECK_MS = 5 * 60_000

export async function hasWebLayer(r2Key: string): Promise<boolean> {
  if (r2Key.startsWith('upload:')) return false
  const key = webKeyFor(r2Key)
  const hit = seen.get(key)
  if (hit && (hit.ok || Date.now() - hit.at < RECHECK_MS)) return hit.ok
  const ok = await objectExists(key).catch(() => false)
  seen.set(key, { ok, at: Date.now() })
  return ok
}

/** { url, proxy } for streaming the web version, or null if none is built yet. */
export async function webLayerLinks(r2Key: string, proxyBase: string) {
  if (!(await hasWebLayer(r2Key))) return null
  // Long enough for a working session; the client asks again when it expires.
  const url = await getDownloadUrl(webKeyFor(r2Key), 6 * 3600)
  const sep = proxyBase.includes('?') ? '&' : '?'
  return { url, proxy: `${proxyBase}${sep}raw=1&web=1` }
}

/**
 * Stream an R2 object through this origin, honouring Range so a COG can be
 * read piece by piece even where the browser cannot reach R2 directly.
 */
export async function streamObject(key: string, range: string | null): Promise<Response> {
  try {
    const obj = await getObjectStream(key, range)
    if (!obj.body) return NextResponse.json({ error: 'file_missing' }, { status: 404 })
    const headers: Record<string, string> = {
      'Content-Type':  obj.contentType,
      'Cache-Control': 'private, max-age=300',
      'Accept-Ranges': 'bytes',
    }
    if (obj.contentLength) headers['Content-Length'] = String(obj.contentLength)
    if (obj.contentRange) headers['Content-Range'] = obj.contentRange
    return new Response(obj.body, { status: range && obj.contentRange ? 206 : 200, headers })
  } catch (err) {
    console.error('[workspace/stream] failed', { key, err })
    return NextResponse.json({ error: 'file_missing' }, { status: 404 })
  }
}
