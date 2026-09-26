// src/lib/workspace/raster.ts
//
// GeoTIFF (EPSG:4326) → a PNG the web map can drape.
//
// MapLibre stretches an image linearly between its corners in Web Mercator,
// but a lat/lon raster is linear in latitude. Rendering row-by-row in
// Mercator space (sampling the source row for each output row's latitude)
// keeps the raster registered against the basemap at every scale.

import type { RasterRamp } from './types'

export interface RasterResult {
  dataUrl:     string
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  bbox:        [number, number, number, number]
  min:         number
  max:         number
  categories:  number[] | null
  width:       number
  height:      number
}

const MAX_PX = 2048

const RAMPS: Record<Exclude<RasterRamp, 'categorical'>, [number, number, number][]> = {
  // Hypsometric tints, the colours of a printed atlas.
  terrain:  [[62, 112, 62], [140, 165, 90], [226, 212, 150], [196, 150, 100], [150, 110, 80], [245, 245, 240]],
  // Dry to wet.
  rainfall: [[245, 238, 214], [199, 225, 180], [120, 190, 170], [60, 140, 180], [30, 80, 150], [20, 40, 100]],
  // Cool to hot.
  heat:     [[49, 92, 156], [120, 170, 200], [240, 235, 200], [240, 170, 90], [205, 85, 50], [140, 30, 30]],
}

// Qualitative colours for class rasters (land cover, soil orders).
const CATEGORICAL: [number, number, number][] = [
  [31, 120, 180], [51, 160, 44], [227, 26, 28], [255, 127, 0], [106, 61, 154], [177, 89, 40],
  [166, 206, 227], [178, 223, 138], [251, 154, 153], [253, 191, 111], [202, 178, 214], [255, 255, 153],
  [27, 158, 119], [217, 95, 2], [117, 112, 179], [231, 41, 138], [102, 166, 30], [230, 171, 2],
  [166, 118, 29], [102, 102, 102],
]

function rampColor(stops: [number, number, number][], t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const a = stops[i], b = stops[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90

export async function renderGeoTiff(bytes: ArrayBuffer, ramp: RasterRamp): Promise<RasterResult> {
  const { fromArrayBuffer } = await import('geotiff')
  const tiff = await fromArrayBuffer(bytes)
  const image = await tiff.getImage()

  const keys = image.getGeoKeys() ?? {}
  const projected = keys.ProjectedCSTypeGeoKey
  if (projected && projected !== 4326) {
    throw new Error(`Raster is in EPSG:${projected}; the web map shows EPSG:4326 rasters only.`)
  }

  const [west, south0, east, north0] = image.getBoundingBox()
  const south = Math.max(-85, south0)
  const north = Math.min(85, north0)

  const srcW = image.getWidth()
  const srcH = image.getHeight()
  const scale = Math.min(1, MAX_PX / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const data = (await image.readRasters({
    samples: [0], width: w, height: h, resampleMethod: 'nearest', interleave: true,
  })) as unknown as ArrayLike<number>

  const nodataRaw = image.getGDALNoData()
  const nodata = nodataRaw === null || nodataRaw === undefined ? null : Number(nodataRaw)
  const isValid = (v: number) => Number.isFinite(v) && (nodata === null || v !== nodata) && v > -3.0e38

  // Continuous: stretch between the 2nd and 98th percentile so a few outliers
  // don't wash the map out. Categorical: collect the distinct classes.
  const values: number[] = []
  const classes = new Set<number>()
  const step = Math.max(1, Math.floor(data.length / 200_000))
  for (let i = 0; i < data.length; i += step) {
    const v = data[i]
    if (!isValid(v)) continue
    values.push(v)
    if (classes.size <= 256) classes.add(v)
  }
  if (!values.length) throw new Error('Raster has no valid cells.')
  values.sort((a, b) => a - b)
  const lo = values[Math.floor(values.length * 0.02)]
  const hi = values[Math.min(values.length - 1, Math.floor(values.length * 0.98))]
  const categorical = ramp === 'categorical' && classes.size <= 256
  const classList = categorical ? [...classes].sort((a, b) => a - b) : null
  const classIndex = new Map(classList?.map((c, i) => [c, i]) ?? [])

  // Output in Mercator rows.
  const outH = h
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = outH
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, outH)
  const yTop = mercY(north), yBot = mercY(south)
  const latSpan = north0 - south0

  for (let oy = 0; oy < outH; oy++) {
    const lat = invMercY(yTop + ((yBot - yTop) * (oy + 0.5)) / outH)
    const sy = Math.min(h - 1, Math.max(0, Math.floor(((north0 - lat) / latSpan) * h)))
    for (let x = 0; x < w; x++) {
      const v = data[sy * w + x]
      const o = (oy * w + x) * 4
      if (!isValid(v)) { img.data[o + 3] = 0; continue }
      let c: [number, number, number]
      if (categorical) c = CATEGORICAL[(classIndex.get(v) ?? 0) % CATEGORICAL.length]
      else c = rampColor(RAMPS[ramp === 'categorical' ? 'terrain' : ramp], hi > lo ? (v - lo) / (hi - lo) : 0.5)
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    coordinates: [[west, north], [east, north], [east, south], [west, south]],
    bbox: [west, south, east, north],
    min: lo, max: hi,
    categories: classList,
    width: w, height: outH,
  }
}

export function rampCss(ramp: RasterRamp): string {
  if (ramp === 'categorical') {
    return `linear-gradient(to right, ${CATEGORICAL.slice(0, 8).map((c, i) => `rgb(${c}) ${i * 12.5}% ${(i + 1) * 12.5}%`).join(', ')})`
  }
  return `linear-gradient(to right, ${RAMPS[ramp].map((c) => `rgb(${c.join(',')})`).join(', ')})`
}

export function categoryColor(i: number): string {
  return `rgb(${CATEGORICAL[i % CATEGORICAL.length].join(',')})`
}
