// src/lib/workspace/wkb.ts
//
// Well-Known Binary → GeoJSON geometry. Handles ISO (1000/2000/3000 offsets)
// and EWKB (high-bit flags) Z/M variants; Z and M values are dropped since
// the web map is 2D.

import type { Geometry, Position } from 'geojson'

export function parseWkb(view: DataView, offset = 0): { geometry: Geometry | null; offset: number } {
  const little = view.getUint8(offset) === 1
  offset += 1
  let type = view.getUint32(offset, little)
  offset += 4

  // EWKB: Z=0x80000000, M=0x40000000, SRID=0x20000000
  let hasZ = (type & 0x80000000) !== 0
  let hasM = (type & 0x40000000) !== 0
  if (type & 0x20000000) offset += 4
  type &= 0x0fffffff
  // ISO: 1000s = Z, 2000s = M, 3000s = ZM
  if (type >= 3000) { hasZ = true; hasM = true; type -= 3000 }
  else if (type >= 2000) { hasM = true; type -= 2000 }
  else if (type >= 1000) { hasZ = true; type -= 1000 }

  const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0)

  const point = (): Position => {
    const x = view.getFloat64(offset, little)
    const y = view.getFloat64(offset + 8, little)
    offset += 8 * dims
    return [x, y]
  }
  const ring = (): Position[] => {
    const n = view.getUint32(offset, little); offset += 4
    const out: Position[] = new Array(n)
    for (let i = 0; i < n; i++) out[i] = point()
    return out
  }
  const count = () => { const n = view.getUint32(offset, little); offset += 4; return n }
  const child = () => { const r = parseWkb(view, offset); offset = r.offset; return r.geometry }

  switch (type) {
    case 1: {
      const p = point()
      return { geometry: Number.isNaN(p[0]) ? null : { type: 'Point', coordinates: p }, offset }
    }
    case 2: return { geometry: { type: 'LineString', coordinates: ring() }, offset }
    case 3: {
      const n = count(); const rings: Position[][] = []
      for (let i = 0; i < n; i++) rings.push(ring())
      return { geometry: { type: 'Polygon', coordinates: rings }, offset }
    }
    case 4: {
      const n = count(); const pts: Position[] = []
      for (let i = 0; i < n; i++) { const g = child(); if (g?.type === 'Point') pts.push(g.coordinates) }
      return { geometry: { type: 'MultiPoint', coordinates: pts }, offset }
    }
    case 5: {
      const n = count(); const lines: Position[][] = []
      for (let i = 0; i < n; i++) { const g = child(); if (g?.type === 'LineString') lines.push(g.coordinates) }
      return { geometry: { type: 'MultiLineString', coordinates: lines }, offset }
    }
    case 6: {
      const n = count(); const polys: Position[][][] = []
      for (let i = 0; i < n; i++) { const g = child(); if (g?.type === 'Polygon') polys.push(g.coordinates) }
      return { geometry: { type: 'MultiPolygon', coordinates: polys }, offset }
    }
    case 7: {
      const n = count(); const geoms: Geometry[] = []
      for (let i = 0; i < n; i++) { const g = child(); if (g) geoms.push(g) }
      return { geometry: { type: 'GeometryCollection', geometries: geoms }, offset }
    }
    default:
      throw new Error(`Unsupported WKB geometry type ${type}`)
  }
}

/**
 * GeoPackage geometry blob: "GP" magic, version, flags, srs_id, optional
 * envelope, then standard WKB.
 */
export function parseGpkgGeometry(blob: Uint8Array): Geometry | null {
  if (blob.length < 8 || blob[0] !== 0x47 || blob[1] !== 0x50) return null
  const flags = blob[3]
  if (flags & 0x10) return null // empty geometry
  const envelopeBytes = [0, 32, 48, 48, 64][(flags >> 1) & 0x07] ?? 0
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  return parseWkb(view, 8 + envelopeBytes).geometry
}
