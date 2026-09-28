// src/lib/workspace/cog.ts
//
// Draws streamed Cloud Optimized GeoTIFFs as ordinary MapLibre raster tiles.
//
// A layer registers its open COG under an id; its map source then uses
// tiles like  lcog://<id>/{z}/{x}/{y}.  For each tile we read just the cells
// under it, from the overview that matches the zoom, over HTTP Range, and
// colour them with the layer's styling (raster.ts). Nothing else is fetched,
// so a 1 GB land cover file opens as fast as a small one.

import type { CogHandle } from './raster'

const TILE = 256
const registry = new Map<string, CogHandle>()
let registered = false

export function registerCog(id: string, cog: CogHandle) { registry.set(id, cog) }
export function unregisterCog(id: string) { registry.delete(id) }

const tile2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

async function emptyTile(): Promise<ArrayBuffer> {
  const c = new OffscreenCanvas(1, 1)
  return (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()
}

/** Zoom at which one screen pixel matches one cell of the full resolution raster. */
export function nativeZoom(c: CogHandle): number {
  const degPerCell = (c.bbox[2] - c.bbox[0]) / c.width
  return Math.min(20, Math.max(0, Math.ceil(Math.log2(360 / (degPerCell * TILE)))))
}

export async function ensureCogProtocol() {
  if (registered) return
  registered = true
  const ml = await import('maplibre-gl')
  const { paint, readCogWindow } = await import('./raster')

  ml.addProtocol('lcog', async (params) => {
    const m = /^lcog:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url)
    const cog = m ? registry.get(decodeURIComponent(m[1])) : undefined
    if (!m || !cog) return { data: await emptyTile() }
    const z = +m[2], x = +m[3], y = +m[4]
    const west = tile2lon(x, z), east = tile2lon(x + 1, z)
    const north = tile2lat(y, z), south = tile2lat(y + 1, z)
    const [bw, bs, be, bn] = cog.bbox
    if (east <= bw || west >= be || south >= bn || north <= bs) return { data: await emptyTile() }

    // Read the tile's lon/lat window (linear in latitude), a little taller
    // than the tile so the Mercator resample has enough rows, then paint.
    const rows = TILE * 2
    const bands = await readCogWindow(cog, [west, south, east, north], TILE, rows)
    const canvas = new OffscreenCanvas(TILE, TILE)
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(TILE, TILE)
    paint(img.data, TILE, TILE, bands, rows, north, south, north, south, cog.stats)
    // Cells outside the raster came back as the fill value; clear them.
    if (west < bw || east > be || north > bn || south < bs) {
      const { invMercY, mercY } = await import('./raster')
      const yTop = mercY(north), yBot = mercY(south)
      for (let py = 0; py < TILE; py++) {
        const lat = invMercY(yTop + ((yBot - yTop) * (py + 0.5)) / TILE)
        const rowOut = lat > bn || lat < bs
        for (let px = 0; px < TILE; px++) {
          const lon = west + ((east - west) * (px + 0.5)) / TILE
          if (rowOut || lon < bw || lon > be) img.data[(py * TILE + px) * 4 + 3] = 0
        }
      }
    }
    ctx.putImageData(img, 0, 0)
    return { data: await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer() }
  })
}
