// src/lib/workspace/loaders.ts
//
// Client-side: fetch a layer's file from R2 and turn it into something the
// map can draw. Files are sniffed by their bytes, not their names:
//   ZIP      → shapefile / GeoJSON / GeoTIFF / GeoPackage inside
//   SQLite   → GeoPackage
//   TIFF     → GeoTIFF raster
//   JSON     → GeoJSON
// Raw bytes are cached in IndexedDB per R2 key, so reopening a project or a
// teammate's layer doesn't re-download it.

import type { FeatureCollection } from 'geojson'
import { WHOLE_FILE_MAX } from './upload-limits'
import type { RasterRamp, WsLayer } from './types'
import type { RasterResult } from './raster'

export type LoadedLayer =
  | { kind: 'vector'; fc: FeatureCollection; bbox: [number, number, number, number] | null; geom: Set<string>; count: number }
  | { kind: 'raster'; raster: RasterResult }

// ── IndexedDB byte cache ────────────────────────────────────────────────────

const DB_NAME = 'lenga-workspace'
const STORE = 'files'

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

async function cacheGet(key: string): Promise<ArrayBuffer | null> {
  const db = await idb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const r = db.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => resolve((r.result as ArrayBuffer) ?? null)
      r.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

async function cachePut(key: string, bytes: ArrayBuffer): Promise<void> {
  const db = await idb()
  if (!db) return
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(bytes, key) } catch { /* quota: fine */ }
}

// ── Fetch ───────────────────────────────────────────────────────────────────

/** Layers with this id prefix are catalogue previews, not project layers. */
export const PREVIEW_PREFIX = 'preview-'

function sourceEndpoint(projectId: string, layer: WsLayer): string {
  if (layer.id.startsWith(PREVIEW_PREFIX)) {
    return `/api/workspace/catalog/source?dataset=${encodeURIComponent(layer.dataset_slug)}&key=${encodeURIComponent(layer.r2_key)}`
  }
  return `/api/workspace/projects/${projectId}/layers/${layer.id}/source`
}

interface SourceInfo { url: string; proxy: string; web?: { url: string; proxy: string } | null }

async function sourceInfo(projectId: string, layer: WsLayer): Promise<SourceInfo> {
  const res = await fetch(sourceEndpoint(projectId, layer))
  if (res.status === 403) throw new Error('This dataset is not one of your plan\'s datasets.')
  if (!res.ok) throw new Error('Could not get access to this file.')
  return await res.json() as SourceInfo
}

// Whole-file loading holds the file in browser memory; past this size it
// would stall or crash the tab. Such files wait for their web version.
const MAX_WHOLE_FILE = WHOLE_FILE_MAX

function tooBig(res: Response): boolean {
  const n = Number(res.headers.get('content-length') ?? 0)
  return n > MAX_WHOLE_FILE
}

async function download(info: SourceInfo): Promise<ArrayBuffer> {
  let res: Response | null = null
  try {
    const direct = await fetch(info.url)
    if (direct.ok) res = direct
  } catch { /* blocked by CORS: fall through to the same-origin proxy */ }
  if (!res) {
    res = await fetch(info.proxy)
    if (!res.ok) throw new Error('The file could not be downloaded.')
  }
  const big = 'This file is too large to open in the browser until its fast map version is ready. Download it for QGIS in the meantime.'
  if (tooBig(res)) {
    void res.body?.cancel()
    throw new Error(big)
  }
  // No Content-Length (a streamed proxy response): read with a cap, so a
  // 900 MB raster stops at the limit instead of crashing the tab.
  if (!res.headers.get('content-length') && res.body) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_WHOLE_FILE) { void reader.cancel(); throw new Error(big) }
      chunks.push(value)
    }
    const out = new Uint8Array(total)
    let at = 0
    for (const c of chunks) { out.set(c, at); at += c.byteLength }
    return out.buffer
  }
  return res.arrayBuffer()
}

async function fetchBytes(projectId: string, layer: WsLayer): Promise<ArrayBuffer> {
  const cached = await cacheGet(layer.r2_key)
  if (cached) return cached
  const bytes = await download(await sourceInfo(projectId, layer))
  void cachePut(layer.r2_key, bytes)
  return bytes
}

/** Open a streamed web version (COG) and hand it to the tile protocol. */
async function loadCog(layer: WsLayer, web: { url: string; proxy: string }): Promise<LoadedLayer> {
  const { openCog } = await import('./raster')
  const { ensureCogProtocol, registerCog, nativeZoom } = await import('./cog')
  let cog
  try {
    cog = await openCog(web.url, layer.style.ramp)
  } catch {
    // Direct Range requests blocked (bucket CORS): stream through our origin.
    cog = await openCog(new URL(web.proxy, window.location.origin).href, layer.style.ramp)
  }
  await ensureCogProtocol()
  const id = `${layer.id}:${layer.style.ramp}`
  registerCog(id, cog)
  const [w, s, e, n] = cog.bbox
  return {
    kind: 'raster',
    raster: {
      dataUrl: '',
      coordinates: [[w, n], [e, n], [e, s], [w, s]],
      bbox: cog.bbox,
      min: cog.stats.lo[0], max: cog.stats.hi[0],
      categories: cog.stats.classes,
      width: cog.width, height: cog.height,
      stats: cog.stats,
      tiles: { id, maxzoom: nativeZoom(cog) },
    },
  }
}

// ── Parse ───────────────────────────────────────────────────────────────────

function magic(b: Uint8Array): 'zip' | 'sqlite' | 'tiff' | 'json' | 'xml' | 'unknown' {
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip'
  if (b.length > 16 && new TextDecoder().decode(b.subarray(0, 15)) === 'SQLite format 3') return 'sqlite'
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return 'tiff'
  const first = b.subarray(0, 64).find((c) => c > 0x20)
  if (first === 0x7b) return 'json'
  if (first === 0x3c) return 'xml'
  return 'unknown'
}

function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

function summarise(fc: FeatureCollection): LoadedLayer {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const geom = new Set<string>()
  const visit = (c: unknown): void => {
    if (typeof (c as number[])[0] === 'number') {
      const [x, y] = c as number[]
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    } else (c as unknown[]).forEach(visit)
  }
  for (const f of fc.features) {
    if (!f.geometry) continue
    const t = f.geometry.type
    geom.add(t.replace('Multi', ''))
    if (t !== 'GeometryCollection') visit(f.geometry.coordinates)
  }
  const bbox = Number.isFinite(minX) ? [minX, minY, maxX, maxY] as [number, number, number, number] : null
  return { kind: 'vector', fc, bbox, geom, count: fc.features.length }
}

function checkLonLat(fc: FeatureCollection): void {
  const s = summarise(fc)
  if (s.kind === 'vector' && s.bbox && (Math.abs(s.bbox[0]) > 180.5 || Math.abs(s.bbox[3]) > 90.5)) {
    throw new Error('This file is in a projected coordinate system the web map cannot display yet.')
  }
}

export async function parseBytes(buf: ArrayBuffer, ramp: RasterRamp): Promise<LoadedLayer> {
  const bytes = new Uint8Array(buf)
  const kind = magic(bytes)

  if (kind === 'tiff') {
    const { renderGeoTiff } = await import('./raster')
    return { kind: 'raster', raster: await renderGeoTiff(buf, ramp) }
  }
  if (kind === 'sqlite') {
    const { readGeoPackage } = await import('./gpkg')
    const { fc, srsId } = await readGeoPackage(bytes)
    if (srsId && srsId !== 4326 && srsId !== 0 && srsId !== -1) checkLonLat(fc)
    return summarise(fc)
  }
  if (kind === 'xml') {
    const text = new TextDecoder().decode(bytes)
    const doc = new DOMParser().parseFromString(text, 'text/xml')
    const tg = await import('@tmcw/togeojson')
    if (doc.getElementsByTagName('kml').length) return summarise(tg.kml(doc) as FeatureCollection)
    if (doc.getElementsByTagName('gpx').length) return summarise(tg.gpx(doc) as FeatureCollection)
    throw new Error('Unrecognised XML: expected KML or GPX.')
  }
  if (kind === 'json') {
    const fc = JSON.parse(new TextDecoder().decode(bytes)) as FeatureCollection
    return summarise(fc.type === 'FeatureCollection' ? fc : { type: 'FeatureCollection', features: [] })
  }
  if (kind === 'zip') {
    const { unzipSync } = await import('fflate')
    const entries = unzipSync(bytes, { filter: (f) => !f.name.startsWith('__MACOSX') })
    const names = Object.keys(entries)
    const find = (re: RegExp) => names.find((n) => re.test(n))

    // Archives often hold more than the data (geoBoundaries "-all" zips carry
    // a metaData.json next to full and simplified boundaries), so take the
    // first JSON that really is a FeatureCollection, full detail before
    // simplified, .geojson before .json.
    const jsons = names.filter((n) => /\.(geo)?json$/i.test(n))
      .sort((a, b) => Number(/simplif/i.test(a)) - Number(/simplif/i.test(b)) || Number(/\.json$/i.test(a)) - Number(/\.json$/i.test(b)))
    for (const n of jsons) {
      try {
        const fc = JSON.parse(new TextDecoder().decode(entries[n])) as FeatureCollection
        if (fc?.type === 'FeatureCollection' && Array.isArray(fc.features) && fc.features.length) return summarise(fc)
      } catch { /* not JSON data; try the next file */ }
    }
    const kmlFile = find(/\.kml$/i)
    if (kmlFile) return parseBytes(toArrayBuffer(entries[kmlFile]), ramp)
    const gpkg = find(/\.gpkg$/i)
    if (gpkg) return parseBytes(toArrayBuffer(entries[gpkg]), ramp)
    const tif = find(/\.tiff?$/i)
    if (tif && !find(/\.shp$/i)) return parseBytes(toArrayBuffer(entries[tif]), ramp)
    if (find(/\.shp$/i)) {
      const { parseZip } = await import('shpjs')
      const out = await parseZip(buf)
      const collections = (Array.isArray(out) ? out : [out]) as (FeatureCollection & { fileName?: string })[]
      // Several shapefiles in one zip: show the full-detail one, not a merge
      // of full and simplified copies (every feature would appear twice).
      const full = collections.filter((c) => !/simplif/i.test(c.fileName ?? ''))
      const pick = full.length ? full : collections
      return summarise({ type: 'FeatureCollection', features: pick.flatMap((c) => c.features) })
    }
    throw new Error('The archive has no shapefile, GeoJSON, GeoPackage or GeoTIFF inside.')
  }
  throw new Error('Unrecognised file format.')
}

// Parsed results, keyed by R2 key + ramp (rasters re-render per ramp).
const memo = new Map<string, Promise<LoadedLayer>>()

export function loadLayer(projectId: string, layer: WsLayer): Promise<LoadedLayer> {
  const key = `${layer.r2_key}|${layer.style.ramp}`
  let p = memo.get(key)
  if (!p) {
    p = (async () => {
      const cached = await cacheGet(layer.r2_key)
      if (cached) return parseBytes(cached, layer.style.ramp)
      const info = await sourceInfo(projectId, layer)
      if (info.web) {
        try { return await loadCog(layer, info.web) } catch { /* fall back to the whole file */ }
      }
      const bytes = await download(info)
      void cachePut(layer.r2_key, bytes)
      return parseBytes(bytes, layer.style.ramp)
    })()
    p.catch(() => memo.delete(key))
    memo.set(key, p)
  }
  return p
}

/** Raw file bytes for a layer (from the browser cache when possible). */
export function getLayerBytes(projectId: string, layer: WsLayer): Promise<ArrayBuffer> {
  return fetchBytes(projectId, layer)
}

/** Put freshly uploaded bytes in the cache so the map doesn't re-download them. */
export function primeCache(key: string, bytes: ArrayBuffer): Promise<void> {
  return cachePut(key, bytes)
}
