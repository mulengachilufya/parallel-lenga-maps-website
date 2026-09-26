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

async function fetchBytes(projectId: string, layer: WsLayer): Promise<ArrayBuffer> {
  const cached = await cacheGet(layer.r2_key)
  if (cached) return cached

  const res = await fetch(`/api/workspace/projects/${projectId}/layers/${layer.id}/source`)
  if (!res.ok) throw new Error('Could not get access to this file.')
  const { url, proxy } = await res.json() as { url: string; proxy: string }

  let bytes: ArrayBuffer | null = null
  try {
    const direct = await fetch(url)
    if (direct.ok) bytes = await direct.arrayBuffer()
  } catch { /* blocked by CORS: fall through to the same-origin proxy */ }
  if (!bytes) {
    const viaProxy = await fetch(proxy)
    if (!viaProxy.ok) throw new Error('The file could not be downloaded.')
    bytes = await viaProxy.arrayBuffer()
  }
  void cachePut(layer.r2_key, bytes)
  return bytes
}

// ── Parse ───────────────────────────────────────────────────────────────────

function magic(b: Uint8Array): 'zip' | 'sqlite' | 'tiff' | 'json' | 'unknown' {
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip'
  if (b.length > 16 && new TextDecoder().decode(b.subarray(0, 15)) === 'SQLite format 3') return 'sqlite'
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return 'tiff'
  const first = b.subarray(0, 64).find((c) => c > 0x20)
  if (first === 0x7b) return 'json'
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

async function parseBytes(buf: ArrayBuffer, ramp: RasterRamp): Promise<LoadedLayer> {
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
  if (kind === 'json') {
    const fc = JSON.parse(new TextDecoder().decode(bytes)) as FeatureCollection
    return summarise(fc.type === 'FeatureCollection' ? fc : { type: 'FeatureCollection', features: [] })
  }
  if (kind === 'zip') {
    const { unzipSync } = await import('fflate')
    const entries = unzipSync(bytes, { filter: (f) => !f.name.startsWith('__MACOSX') })
    const names = Object.keys(entries)
    const find = (re: RegExp) => names.find((n) => re.test(n))

    const geojson = find(/\.(geo)?json$/i)
    if (geojson) return parseBytes(toArrayBuffer(entries[geojson]), ramp)
    const gpkg = find(/\.gpkg$/i)
    if (gpkg) return parseBytes(toArrayBuffer(entries[gpkg]), ramp)
    const tif = find(/\.tiff?$/i)
    if (tif && !find(/\.shp$/i)) return parseBytes(toArrayBuffer(entries[tif]), ramp)
    if (find(/\.shp$/i)) {
      const { parseZip } = await import('shpjs')
      const out = await parseZip(buf)
      const collections = (Array.isArray(out) ? out : [out]) as FeatureCollection[]
      const features = collections.flatMap((c) => c.features)
      return summarise({ type: 'FeatureCollection', features })
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
    p = fetchBytes(projectId, layer).then((b) => parseBytes(b, layer.style.ramp))
    p.catch(() => memo.delete(key))
    memo.set(key, p)
  }
  return p
}
