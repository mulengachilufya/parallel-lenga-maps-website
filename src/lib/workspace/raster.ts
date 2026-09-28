// src/lib/workspace/raster.ts
//
// GeoTIFF (EPSG:4326) → pixels the web map can draw, styled the way a
// desktop GIS would show them:
//   * 3+ band imagery (drone orthomosaics, satellite scenes) in true colour,
//     each band stretched between its 2nd and 98th percentile;
//   * paletted rasters (land cover, soil classes) in the file's own colour
//     table, which is what QGIS uses; ESA WorldCover codes in their official
//     colours; other class rasters in a qualitative palette;
//   * NDVI (a single band inside -1..1) on a brown to green vegetation ramp
//     with a fixed -0.2..0.9 domain, so scenes compare;
//   * elevation on a hypsometric ramp with hillshade.
//
// Two ways in:
//   renderGeoTiff(bytes)  a whole small file → one image (uploads, small data)
//   openCog(url)          a Cloud Optimized GeoTIFF read over HTTP Range,
//                         drawn as map tiles by the "lcog" protocol (cog.ts)
//
// MapLibre draws in Web Mercator while these rasters are linear in latitude,
// so every output row samples the source row at its own latitude.

import type { RasterRamp } from './types'

export interface RasterStats {
  mode:       'rgb' | 'palette' | 'classes' | 'ramp'
  ramp:       RasterRamp
  lo:         number[]              // per band stretch (rgb: 3 values, else 1)
  hi:         number[]
  nodata:     number | null
  classes:    number[] | null       // distinct values for class rasters
  palette:    Map<number, [number, number, number]> | null
  hillshade:  boolean
}

export interface RasterResult {
  dataUrl:     string               // '' when the layer is streamed as tiles
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  bbox:        [number, number, number, number]
  min:         number
  max:         number
  categories:  number[] | null
  width:       number
  height:      number
  stats?:      RasterStats
  /** Set for streamed COGs: MapLibre draws them through the lcog:// protocol. */
  tiles?:      { id: string; maxzoom: number }
}

const MAX_PX = 3072
type RGB = [number, number, number]

const RAMPS: Record<Exclude<RasterRamp, 'categorical'>, RGB[]> = {
  // Hypsometric tints, the colours of a printed atlas.
  terrain:  [[62, 112, 62], [140, 165, 90], [226, 212, 150], [196, 150, 100], [150, 110, 80], [245, 245, 240]],
  // Dry to wet.
  rainfall: [[245, 238, 214], [199, 225, 180], [120, 190, 170], [60, 140, 180], [30, 80, 150], [20, 40, 100]],
  // Cool to hot.
  heat:     [[49, 92, 156], [120, 170, 200], [240, 235, 200], [240, 170, 90], [205, 85, 50], [140, 30, 30]],
  // Bare soil and water to dense canopy (the QGIS / USGS NDVI look).
  ndvi:     [[120, 72, 28], [191, 129, 45], [223, 194, 125], [246, 232, 195], [199, 233, 180], [127, 188, 65], [77, 146, 33], [39, 100, 25], [0, 68, 27]],
  // Drought index (SPI): dry brown through neutral to wet blue, centred on 0.
  drought:  [[140, 45, 4], [204, 76, 2], [236, 112, 20], [254, 196, 79], [247, 247, 247], [158, 202, 225], [66, 146, 198], [8, 81, 156], [8, 48, 107]],
  // Perceptually even, colour-blind safe.
  viridis:  [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
}

// ESA WorldCover (and the many land cover products that reuse its codes).
const WORLDCOVER: Record<number, RGB> = {
  10: [0, 100, 0], 20: [255, 187, 34], 30: [255, 255, 76], 40: [240, 150, 255], 50: [250, 0, 0],
  60: [180, 180, 180], 70: [240, 240, 240], 80: [0, 100, 200], 90: [0, 150, 160], 95: [0, 207, 117], 100: [250, 230, 160],
}
export const WORLDCOVER_LABELS: Record<number, string> = {
  10: 'Tree cover', 20: 'Shrubland', 30: 'Grassland', 40: 'Cropland', 50: 'Built up', 60: 'Bare, sparse vegetation',
  70: 'Snow and ice', 80: 'Water', 90: 'Herbaceous wetland', 95: 'Mangroves', 100: 'Moss and lichen',
}

// Qualitative colours for class rasters with no palette of their own.
const CATEGORICAL: RGB[] = [
  [31, 120, 180], [51, 160, 44], [227, 26, 28], [255, 127, 0], [106, 61, 154], [177, 89, 40],
  [166, 206, 227], [178, 223, 138], [251, 154, 153], [253, 191, 111], [202, 178, 214], [255, 255, 153],
  [27, 158, 119], [217, 95, 2], [117, 112, 179], [231, 41, 138], [102, 166, 30], [230, 171, 2],
  [166, 118, 29], [102, 102, 102],
]

function rampColor(stops: RGB[], t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const a = stops[i], b = stops[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

export const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
export const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90

// ── Reading a GeoTIFF's metadata ────────────────────────────────────────────

type GeoImage = {
  getWidth(): number; getHeight(): number; getSamplesPerPixel(): number
  getBoundingBox(): number[]; getGeoKeys(): Record<string, number> | null
  getGDALNoData(): number | null
  getSampleFormat(i?: number): number
  getBitsPerSample(i?: number): number
  fileDirectory: { loadValue(tag: string): Promise<unknown> }
  readRasters(o: Record<string, unknown>): Promise<unknown>
}

function assertLonLat(image: GeoImage) {
  const keys = image.getGeoKeys() ?? {}
  const projected = keys.ProjectedCSTypeGeoKey
  if (projected && projected !== 4326) {
    throw new Error(`Raster is in EPSG:${projected}; the web map shows EPSG:4326 rasters only. Reproject it in QGIS (Raster > Projections > Warp) first.`)
  }
}

/** The file's own colour table (GDAL "paletted"), as QGIS shows it. */
async function colorTable(image: GeoImage): Promise<Map<number, RGB> | null> {
  const cm = await image.fileDirectory.loadValue('ColorMap').catch(() => undefined) as ArrayLike<number> | undefined
  if (!cm || !cm.length) return null
  const n = cm.length / 3
  const out = new Map<number, RGB>()
  for (let i = 0; i < n; i++) {
    const c: RGB = [cm[i] >> 8, cm[n + i] >> 8, cm[2 * n + i] >> 8]
    if (c[0] || c[1] || c[2]) out.set(i, c)
  }
  return out.size ? out : null
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))]

/**
 * Work out how to colour a raster from a small sample of it (the whole
 * image for small files, the coarsest overview for a COG).
 */
async function analyse(image: GeoImage, bands: ArrayLike<number>[], requested: RasterRamp): Promise<RasterStats> {
  const nodataRaw = image.getGDALNoData()
  const nodata = nodataRaw === null || nodataRaw === undefined ? null : Number(nodataRaw)
  const valid = (v: number) => Number.isFinite(v) && (nodata === null || v !== nodata) && v > -3.0e38
  const spp = bands.length
  const fmt = image.getSampleFormat(0) ?? 1
  const bits = image.getBitsPerSample(0) ?? 8
  const isInt = fmt !== 3

  // Imagery: three or more integer bands.
  if (spp >= 3 && isInt) {
    const lo: number[] = [], hi: number[] = []
    for (let b = 0; b < 3; b++) {
      const s = sample(bands[b], valid, (v) => v !== 0)
      s.sort((a, z) => a - z)
      lo.push(s.length ? pct(s, 0.02) : 0)
      hi.push(s.length ? pct(s, 0.98) : bits === 8 ? 255 : 65535)
    }
    return { mode: 'rgb', ramp: requested, lo, hi, nodata, classes: null, palette: null, hillshade: false }
  }

  const values = sample(bands[0], valid)
  if (!values.length) throw new Error('Raster has no valid cells.')
  values.sort((a, z) => a - z)
  const distinct = new Set<number>()
  for (const v of values) { distinct.add(v); if (distinct.size > 256) break }
  const lo = pct(values, 0.02), hi = pct(values, 0.98)

  const table = await colorTable(image)
  if (table && isInt) {
    return { mode: 'palette', ramp: 'categorical', lo: [lo], hi: [hi], nodata, classes: [...distinct].sort((a, z) => a - z), palette: table, hillshade: false }
  }
  if (isInt && distinct.size <= 256 && (requested === 'categorical' || [...distinct].every((v) => v in WORLDCOVER))) {
    const classes = [...distinct].sort((a, z) => a - z)
    const wc = classes.every((v) => v in WORLDCOVER)
    const palette = new Map<number, RGB>(classes.map((c, i) => [c, wc ? WORLDCOVER[c] : CATEGORICAL[i % CATEGORICAL.length]]))
    return { mode: 'classes', ramp: 'categorical', lo: [lo], hi: [hi], nodata, classes, palette, hillshade: false }
  }

  // Continuous. A float band that lives inside -1..1 is almost always NDVI
  // (or another normalised index): show it the way remote sensing tools do.
  let ramp: RasterRamp = requested === 'categorical' ? 'terrain' : requested
  let lo2 = lo, hi2 = hi
  const looksNdvi = !isInt && values[0] >= -1.001 && values[values.length - 1] <= 1.001
  if (looksNdvi && (requested === 'terrain' || requested === 'ndvi')) { ramp = 'ndvi'; lo2 = -0.2; hi2 = 0.9 }
  else if (ramp === 'ndvi') { lo2 = -0.2; hi2 = 0.9 }
  else if (ramp === 'drought') { const m = Math.max(Math.abs(lo), Math.abs(hi), 0.5); lo2 = -m; hi2 = m }
  return { mode: 'ramp', ramp, lo: [lo2], hi: [hi2], nodata, classes: null, palette: null, hillshade: ramp === 'terrain' && !looksNdvi }
}

function sample(a: ArrayLike<number>, valid: (v: number) => boolean, extra?: (v: number) => boolean): number[] {
  const out: number[] = []
  const step = Math.max(1, Math.floor(a.length / 200_000))
  for (let i = 0; i < a.length; i += step) {
    const v = a[i]
    if (valid(v) && (!extra || extra(v))) out.push(v)
  }
  return out
}

// ── Colouring ───────────────────────────────────────────────────────────────

/**
 * Paint `outH` Mercator rows of a lat/lon grid (bands of w × h, covering
 * north..south) into an RGBA buffer of w × outH, for the output latitude
 * span topLat..botLat.
 */
export function paint(
  out: Uint8ClampedArray, w: number, outH: number,
  bands: ArrayLike<number>[], h: number,
  north: number, south: number, topLat: number, botLat: number,
  st: RasterStats,
) {
  const valid = (v: number) => Number.isFinite(v) && (st.nodata === null || v !== st.nodata) && v > -3.0e38
  const yTop = mercY(topLat), yBot = mercY(botLat)
  const span = north - south
  const b0 = bands[0]
  const stops = st.mode === 'ramp' ? RAMPS[st.ramp === 'categorical' ? 'terrain' : st.ramp] : null
  const shade = st.hillshade ? hillshadeGrid(b0, w, h, valid, span / h) : null

  for (let oy = 0; oy < outH; oy++) {
    const lat = invMercY(yTop + ((yBot - yTop) * (oy + 0.5)) / outH)
    const sy = Math.floor(((north - lat) / span) * h)
    for (let x = 0; x < w; x++) {
      const o = (oy * w + x) * 4
      if (sy < 0 || sy >= h) { out[o + 3] = 0; continue }
      const i = sy * w + x
      if (st.mode === 'rgb') {
        const r = bands[0][i], g = bands[1][i], b = bands[2][i]
        const alpha = bands[3] ? bands[3][i] : 1
        if (!valid(r) || (r === 0 && g === 0 && b === 0) || alpha === 0) { out[o + 3] = 0; continue }
        out[o] = 255 * (r - st.lo[0]) / Math.max(1e-9, st.hi[0] - st.lo[0])
        out[o + 1] = 255 * (g - st.lo[1]) / Math.max(1e-9, st.hi[1] - st.lo[1])
        out[o + 2] = 255 * (b - st.lo[2]) / Math.max(1e-9, st.hi[2] - st.lo[2])
        out[o + 3] = 255
        continue
      }
      const v = b0[i]
      if (!valid(v)) { out[o + 3] = 0; continue }
      let c: RGB | undefined
      if (st.palette) {
        c = st.palette.get(v)
        if (!c) { out[o + 3] = 0; continue }
      } else {
        c = rampColor(stops!, st.hi[0] > st.lo[0] ? (v - st.lo[0]) / (st.hi[0] - st.lo[0]) : 0.5)
      }
      const k = shade ? 0.55 + 0.45 * shade[i] : 1
      out[o] = c[0] * k; out[o + 1] = c[1] * k; out[o + 2] = c[2] * k; out[o + 3] = 255
    }
  }
}

/** Simple hillshade (sun from the north west), 0..1, for elevation rasters. */
function hillshadeGrid(z: ArrayLike<number>, w: number, h: number, valid: (v: number) => boolean, cellDeg: number): Float32Array {
  const out = new Float32Array(w * h).fill(1)
  const cell = Math.max(1, cellDeg * 111_000)
  const az = (315 * Math.PI) / 180, alt = (45 * Math.PI) / 180
  const exag = 2
  // Edges use their nearest inside neighbour, so map tiles meet without seams.
  for (let y = 0; y < h; y++) {
    const yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const xl = Math.max(0, x - 1), xr = Math.min(w - 1, x + 1)
      const l = z[y * w + xl], r = z[y * w + xr], u = z[yu * w + x], d = z[yd * w + x]
      if (!valid(l) || !valid(r) || !valid(u) || !valid(d)) continue
      const dzdx = ((r - l) * exag) / ((xr - xl || 1) * cell), dzdy = ((d - u) * exag) / ((yd - yu || 1) * cell)
      const slope = Math.atan(Math.hypot(dzdx, dzdy))
      const aspect = Math.atan2(dzdy, -dzdx)
      const v = Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(az - aspect)
      out[i] = Math.max(0, Math.min(1, v))
    }
  }
  return out
}

async function readBands(image: GeoImage, opts: Record<string, unknown>): Promise<ArrayLike<number>[]> {
  const spp = image.getSamplesPerPixel()
  const samples = spp >= 3 ? [...Array(Math.min(4, spp)).keys()] : [0]
  const res = await image.readRasters({ ...opts, samples, interleave: false }) as ArrayLike<number>[]
  return Array.from(res)
}

// ── Whole file → one image ──────────────────────────────────────────────────

export async function renderGeoTiff(bytes: ArrayBuffer, ramp: RasterRamp): Promise<RasterResult> {
  const { fromArrayBuffer } = await import('geotiff')
  const tiff = await fromArrayBuffer(bytes)
  const image = await tiff.getImage() as unknown as GeoImage
  assertLonLat(image)

  const [west, south0, east, north0] = image.getBoundingBox()
  const south = Math.max(-85, south0)
  const north = Math.min(85, north0)
  const srcW = image.getWidth()
  const srcH = image.getHeight()
  const scale = Math.min(1, MAX_PX / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const bands = await readBands(image, { width: w, height: h, resampleMethod: 'nearest' })
  const st = await analyse(image, bands, ramp)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  paint(img.data, w, h, bands, h, north0, south0, north, south, st)
  ctx.putImageData(img, 0, 0)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    coordinates: [[west, north], [east, north], [east, south], [west, south]],
    bbox: [west, south, east, north],
    min: st.lo[0], max: st.hi[0],
    categories: st.classes,
    width: srcW, height: srcH,
    stats: st,
  }
}

// ── Streamed COG ────────────────────────────────────────────────────────────

export interface CogHandle {
  tiff:   { readRasters(o: Record<string, unknown>): Promise<unknown>; getImage(i?: number): Promise<unknown>; getImageCount(): Promise<number> }
  image:  GeoImage
  bbox:   [number, number, number, number]
  width:  number
  height: number
  stats:  RasterStats
  spp:    number
}

/**
 * Open a COG over HTTP Range and work out its styling from the coarsest
 * overview (a few hundred KB even for a 1 GB file).
 */
export async function openCog(url: string, ramp: RasterRamp): Promise<CogHandle> {
  const { fromUrl } = await import('geotiff')
  // A generous block cache: neighbouring map tiles share file blocks, and
  // without it each tile re-downloads them (about 50 MB of memory at most).
  const tiff = await fromUrl(url, { allowFullFile: false, blockSize: 65536, cacheSize: 800 } as Parameters<typeof fromUrl>[1])
  const image = await tiff.getImage() as unknown as GeoImage
  assertLonLat(image)
  const count = await tiff.getImageCount()
  const smallest = await tiff.getImage(count - 1) as unknown as GeoImage
  const sw = smallest.getWidth(), sh = smallest.getHeight()
  const k = Math.min(1, 1024 / Math.max(sw, sh))
  const bands = await readBands(smallest, { width: Math.max(1, Math.round(sw * k)), height: Math.max(1, Math.round(sh * k)), resampleMethod: 'nearest' })
  // Nodata and the colour table live on the full resolution image.
  const stats = await analyse(image, bands, ramp)
  const bb = image.getBoundingBox()
  return {
    tiff: tiff as unknown as CogHandle['tiff'],
    image, bbox: [bb[0], bb[1], bb[2], bb[3]],
    width: image.getWidth(), height: image.getHeight(), stats, spp: image.getSamplesPerPixel(),
  }
}

/** Read the cells of a lon/lat window at roughly w × h, from the best overview. */
export async function readCogWindow(c: CogHandle, bbox: [number, number, number, number], w: number, h: number): Promise<ArrayLike<number>[]> {
  const samples = c.spp >= 3 ? [...Array(Math.min(4, c.spp)).keys()] : [0]
  const fill = c.stats.nodata ?? 0
  const res = await c.tiff.readRasters({
    bbox, width: w, height: h, samples, interleave: false,
    resampleMethod: c.stats.mode === 'ramp' ? 'bilinear' : 'nearest', fillValue: fill,
  }) as ArrayLike<number>[]
  return Array.from(res)
}

// ── Legend helpers ──────────────────────────────────────────────────────────

export function rampCss(ramp: RasterRamp): string {
  if (ramp === 'categorical') {
    return `linear-gradient(to right, ${CATEGORICAL.slice(0, 8).map((c, i) => `rgb(${c}) ${i * 12.5}% ${(i + 1) * 12.5}%`).join(', ')})`
  }
  return `linear-gradient(to right, ${RAMPS[ramp].map((c) => `rgb(${c.join(',')})`).join(', ')})`
}

export function categoryColor(i: number, value?: number, stats?: RasterStats): string {
  const c = value !== undefined && stats?.palette?.get(value)
  return `rgb(${(c || CATEGORICAL[i % CATEGORICAL.length]).join(',')})`
}

export function categoryLabel(value: number, stats?: RasterStats): string {
  if (stats?.mode === 'classes' && stats.classes?.every((v) => v in WORLDCOVER)) return WORLDCOVER_LABELS[value] ?? `Class ${value}`
  return `Class ${value}`
}
