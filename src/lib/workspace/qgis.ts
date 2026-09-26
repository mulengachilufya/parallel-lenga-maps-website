// src/lib/workspace/qgis.ts
//
// QGIS project interchange, both directions.
//
//  readQgisProject  — .qgz / .qgs (plus the data files that came with it) →
//                     layer list with names, draw order, visibility and
//                     single-symbol styling, each matched to its data file.
//  writeQgisProject — a Lenga project → .qgs XML whose layers point at
//                     ./data/… files packaged alongside it, styled to match
//                     the web map (single symbol / pseudocolour / paletted).
//
// Only what a web map can represent is carried: geometry, colour, width,
// opacity, order, visibility. Labels, rule-based and graduated renderers
// fall back to a single symbol in the layer's main colour.

import { unzipSync } from 'fflate'
import type { LayerStyle, RasterRamp } from './types'

// ── Reading ─────────────────────────────────────────────────────────────────

export interface QgisLayerSpec {
  name:       string
  kind:       'vector' | 'raster'
  source:     string          // datasource as written in the project
  file:       string | null   // matched file name inside the package
  sublayer:   string | null   // GeoPackage table (|layername=…)
  visible:    boolean
  style:      Partial<LayerStyle>
}

export interface QgisProjectSpec {
  title:   string
  layers:  QgisLayerSpec[]      // top → bottom, as in the QGIS Layers panel
  skipped: { name: string; reason: string }[]
}

const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p

function rgbaToHex(v: string | null | undefined): { hex: string; alpha: number } | null {
  if (!v) return null
  const m = /^(\d+),(\d+),(\d+)(?:,(\d+))?/.exec(v.trim())
  if (!m) return null
  const hex = '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
  return { hex, alpha: m[4] !== undefined ? Number(m[4]) / 255 : 1 }
}

/** Read one symbol-layer property from either the new <Option> or old <prop> form. */
function prop(el: Element, ...keys: string[]): string | null {
  for (const k of keys) {
    const opt = el.querySelector(`Option[name="${k}"]`)
    if (opt?.getAttribute('value')) return opt.getAttribute('value')
    const old = el.querySelector(`prop[k="${k}"]`)
    if (old?.getAttribute('v')) return old.getAttribute('v')
  }
  return null
}

function styleFrom(maplayer: Element): Partial<LayerStyle> {
  const out: Partial<LayerStyle> = {}
  const symbol = maplayer.querySelector('renderer-v2 symbols > symbol')
  const layerOpacity = Number(maplayer.querySelector(':scope > layerOpacity')?.textContent ?? '1')
  if (symbol) {
    const alpha = Number(symbol.getAttribute('alpha') ?? '1')
    const sl = symbol.querySelector('layer')
    if (sl) {
      const cls = sl.getAttribute('class') ?? ''
      const fill = rgbaToHex(prop(sl, 'color'))
      const line = rgbaToHex(prop(sl, 'line_color', 'outline_color'))
      const width = Number(prop(sl, 'line_width', 'outline_width') ?? '')
      if (cls === 'SimpleFill') {
        const noBrush = prop(sl, 'style') === 'no'
        out.fill = !noBrush
        out.color = (noBrush ? line?.hex : fill?.hex) ?? line?.hex ?? fill?.hex
      } else {
        out.color = (cls === 'SimpleLine' ? line?.hex : fill?.hex) ?? line?.hex ?? fill?.hex
      }
      // QGIS widths are millimetres; the web map uses screen pixels.
      if (Number.isFinite(width) && width > 0) out.width = Math.min(8, Math.max(0.25, Math.round((width / 0.26) * 4) / 4))
      out.opacity = Math.max(0.05, Math.min(1, alpha * (Number.isFinite(layerOpacity) ? layerOpacity : 1)))
    }
  }
  const raster = maplayer.querySelector('pipe rasterrenderer')
  if (raster) {
    const t = raster.getAttribute('type')
    out.ramp = t === 'paletted' ? 'categorical' : 'terrain'
    const o = Number(raster.getAttribute('opacity') ?? '')
    if (Number.isFinite(o)) out.opacity = o
  }
  return out
}

/** Find the .qgs XML among uploaded files (a .qgz is a zip holding one). */
export function findProjectXml(files: Map<string, Uint8Array>): { name: string; xml: string } | null {
  for (const [name, bytes] of files) {
    if (/\.qgs$/i.test(name)) return { name, xml: new TextDecoder().decode(bytes) }
  }
  for (const [name, bytes] of files) {
    if (!/\.qgz$/i.test(name)) continue
    const inner = unzipSync(bytes)
    const qgs = Object.keys(inner).find((n) => /\.qgs$/i.test(n))
    if (qgs) return { name, xml: new TextDecoder().decode(inner[qgs]) }
  }
  return null
}

export function readQgisProject(xml: string, files: Map<string, Uint8Array>): QgisProjectSpec {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The QGIS project file could not be read.')
  const title = doc.querySelector('qgis > title')?.textContent?.trim() || doc.documentElement.getAttribute('projectname') || 'QGIS project'

  // Tree order (top → bottom) and visibility.
  const order: { id: string; visible: boolean }[] = []
  doc.querySelectorAll('layer-tree-group layer-tree-layer').forEach((n) => {
    let visible = n.getAttribute('checked') !== 'Qt::Unchecked'
    for (let p = n.parentElement; p && p.tagName === 'layer-tree-group'; p = p.parentElement) {
      if (p.getAttribute('checked') === 'Qt::Unchecked') visible = false
    }
    order.push({ id: n.getAttribute('id') ?? '', visible })
  })

  const byBase = new Map<string, string>()
  for (const name of files.keys()) byBase.set(basename(name).toLowerCase(), name)

  const layers: QgisLayerSpec[] = []
  const skipped: QgisProjectSpec['skipped'] = []
  const maplayers = new Map<string, Element>()
  doc.querySelectorAll('projectlayers > maplayer').forEach((m) => {
    const id = m.querySelector(':scope > id')?.textContent ?? ''
    maplayers.set(id, m)
  })
  const ids = order.length ? order.map((o) => o.id) : [...maplayers.keys()]

  for (const id of ids) {
    const m = maplayers.get(id)
    if (!m) continue
    const name = m.querySelector(':scope > layername')?.textContent?.trim() || 'Layer'
    const type = m.getAttribute('type')
    const provider = m.querySelector(':scope > provider')?.textContent?.trim() ?? ''
    const source = m.querySelector(':scope > datasource')?.textContent?.trim() ?? ''
    if (type !== 'vector' && type !== 'raster') { skipped.push({ name, reason: `${type ?? 'unknown'} layers are not supported` }); continue }
    if (!['ogr', 'gdal', ''].includes(provider)) {
      skipped.push({ name, reason: `${provider} source (database or web service): add the data as a file instead` }); continue
    }
    const [pathPart, ...opts] = source.split('|')
    const cleaned = pathPart.replace(/^\/vsizip\//, '').replace(/\.zip\/.*$/i, '.zip')
    const sub = opts.find((o) => o.startsWith('layername='))?.slice('layername='.length) ?? null
    const file = byBase.get(basename(cleaned).toLowerCase()) ?? null
    if (!file) { skipped.push({ name, reason: `data file "${basename(cleaned)}" was not in the upload` }); continue }
    layers.push({
      name, kind: type, source, file, sublayer: sub,
      visible: order.find((o) => o.id === id)?.visible ?? true,
      style: styleFrom(m),
    })
  }
  return { title, layers, skipped }
}

/** Shapefile companions that must travel with a .shp. */
export function shapefileSiblings(shp: string, files: Map<string, Uint8Array>): string[] {
  const stem = shp.replace(/\.shp$/i, '').toLowerCase()
  return [...files.keys()].filter((n) => n.toLowerCase().startsWith(stem + '.') &&
    /\.(shp|shx|dbf|prj|cpg|qix|sbn|sbx)$/i.test(n))
}

// ── Writing ─────────────────────────────────────────────────────────────────

export interface QgisExportLayer {
  id:        string
  name:      string
  path:      string                 // relative, e.g. ./data/rivers/rivers.shp
  kind:      'vector' | 'raster'
  geometry:  'Point' | 'Line' | 'Polygon'
  visible:   boolean
  style:     LayerStyle
  raster?:   { min: number; max: number; categories: number[] | null }
}

const WGS84 = `<spatialrefsys nativeFormat="Wkt"><wkt>GEOGCRS["WGS 84",DATUM["World Geodetic System 1984",ELLIPSOID["WGS 84",6378137,298.257223563,LENGTHUNIT["metre",1]]],PRIMEM["Greenwich",0,ANGLEUNIT["degree",0.0174532925199433]],CS[ellipsoidal,2],AXIS["geodetic latitude (Lat)",north,ORDER[1],ANGLEUNIT["degree",0.0174532925199433]],AXIS["geodetic longitude (Lon)",east,ORDER[2],ANGLEUNIT["degree",0.0174532925199433]],USAGE[SCOPE["Horizontal component of 3D system."],AREA["World."],BBOX[-90,-180,90,180]],ID["EPSG",4326]]</wkt><proj4>+proj=longlat +datum=WGS84 +no_defs</proj4><srsid>3452</srsid><srid>4326</srid><authid>EPSG:4326</authid><description>WGS 84</description><projectionacronym>longlat</projectionacronym><ellipsoidacronym>EPSG:7030</ellipsoidacronym><geographicflag>true</geographicflag></spatialrefsys>`

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))

function rgba(hex: string, a = 255): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a}`
}

function props(p: Record<string, string>): string {
  const opt = Object.entries(p).map(([k, v]) => `<Option type="QString" name="${k}" value="${esc(v)}"/>`).join('')
  const old = Object.entries(p).map(([k, v]) => `<prop k="${k}" v="${esc(v)}"/>`).join('')
  return `<Option type="Map">${opt}</Option>${old}`
}

function vectorRenderer(l: QgisExportLayer): string {
  const s = l.style
  const mm = (Math.max(0.25, s.width) * 0.26).toFixed(2)
  let type = 'line', layer = ''
  if (l.geometry === 'Point') {
    type = 'marker'
    layer = `<layer class="SimpleMarker" enabled="1" pass="0" locked="0">${props({
      name: 'circle', color: rgba(s.color), outline_color: '255,255,255,255', outline_width: '0.2',
      outline_width_unit: 'MM', size: (1.4 + s.width * 0.6).toFixed(2), size_unit: 'MM',
    })}</layer>`
  } else if (l.geometry === 'Polygon') {
    type = 'fill'
    layer = `<layer class="SimpleFill" enabled="1" pass="0" locked="0">${props({
      color: rgba(s.color, s.fill ? 97 : 0), style: s.fill ? 'solid' : 'no',
      outline_color: rgba(s.color), outline_style: 'solid', outline_width: mm, outline_width_unit: 'MM',
    })}</layer>`
  } else {
    layer = `<layer class="SimpleLine" enabled="1" pass="0" locked="0">${props({
      line_color: rgba(s.color), line_style: 'solid', line_width: mm, line_width_unit: 'MM',
      capstyle: 'round', joinstyle: 'round',
    })}</layer>`
  }
  return `<renderer-v2 type="singleSymbol" symbollevels="0" enableorderby="0" forceraster="0"><symbols><symbol type="${type}" name="0" alpha="${s.opacity.toFixed(2)}" clip_to_extent="1" force_rhr="0">${layer}</symbol></symbols><rotation/><sizescale/></renderer-v2>`
}

const QGIS_RAMPS: Record<Exclude<RasterRamp, 'categorical'>, string[]> = {
  terrain:  ['#3e703e', '#8ca55a', '#e2d496', '#c49664', '#966e50', '#f5f5f0'],
  rainfall: ['#f5eed6', '#c7e1b4', '#78beaa', '#3c8cb4', '#1e5096', '#142864'],
  heat:     ['#315c9c', '#78aac8', '#f0ebc8', '#f0aa5a', '#cd5532', '#8c1e1e'],
}
const QGIS_CLASSES = ['#1f78b4', '#33a02c', '#e31a1c', '#ff7f00', '#6a3d9a', '#b15928', '#a6cee3', '#b2df8a', '#fb9a99', '#fdbf6f',
  '#cab2d6', '#ffff99', '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666']

function rasterRenderer(l: QgisExportLayer): string {
  const r = l.raster ?? { min: 0, max: 1, categories: null }
  if (l.style.ramp === 'categorical' && r.categories?.length) {
    const entries = r.categories.map((v, i) => `<paletteEntry value="${v}" color="${QGIS_CLASSES[i % QGIS_CLASSES.length]}" alpha="255" label="${v}"/>`).join('')
    return `<pipe><rasterrenderer type="paletted" band="1" opacity="${l.style.opacity.toFixed(2)}" alphaBand="-1" nodataColor=""><colorPalette>${entries}</colorPalette></rasterrenderer></pipe>`
  }
  const stops = QGIS_RAMPS[l.style.ramp === 'categorical' ? 'terrain' : l.style.ramp]
  const items = stops.map((c, i) => {
    const v = r.min + ((r.max - r.min) * i) / (stops.length - 1)
    return `<item value="${v}" color="${c}" alpha="255" label="${v.toFixed(1)}"/>`
  }).join('')
  return `<pipe><rasterrenderer type="singlebandpseudocolor" band="1" opacity="${l.style.opacity.toFixed(2)}" alphaBand="-1" classificationMin="${r.min}" classificationMax="${r.max}"><rastershader><colorrampshader colorRampType="INTERPOLATED" classificationMode="1" clip="0" minimumValue="${r.min}" maximumValue="${r.max}">${items}</colorrampshader></rastershader></rasterrenderer></pipe>`
}

export function writeQgisProject(opts: {
  title: string
  extent: [number, number, number, number]
  layers: QgisExportLayer[]   // top → bottom
}): string {
  const { title, extent, layers } = opts
  const tree = layers.map((l) =>
    `<layer-tree-layer id="${l.id}" name="${esc(l.name)}" checked="${l.visible ? 'Qt::Checked' : 'Qt::Unchecked'}" expanded="1" providerKey="${l.kind === 'raster' ? 'gdal' : 'ogr'}" source="${esc(l.path)}"><customproperties/></layer-tree-layer>`).join('')
  const maplayers = layers.map((l) => {
    const head = l.kind === 'raster'
      ? `<maplayer type="raster" hasScaleBasedVisibilityFlag="0" autoRefreshEnabled="0">`
      : `<maplayer type="vector" geometry="${l.geometry}" hasScaleBasedVisibilityFlag="0" autoRefreshEnabled="0" wkbType="${l.geometry === 'Point' ? 'MultiPoint' : l.geometry === 'Line' ? 'MultiLineString' : 'MultiPolygon'}">`
    return `${head}<id>${l.id}</id><datasource>${esc(l.path)}</datasource><layername>${esc(l.name)}</layername><srs>${WGS84}</srs><provider${l.kind === 'vector' ? ' encoding="UTF-8"' : ''}>${l.kind === 'raster' ? 'gdal' : 'ogr'}</provider>${l.kind === 'raster' ? rasterRenderer(l) : vectorRenderer(l)}<layerOpacity>1</layerOpacity></maplayer>`
  }).join('')
  const [xmin, ymin, xmax, ymax] = extent
  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis projectname="${esc(title)}" version="3.34.0-Prizren">
  <homePath path=""/>
  <title>${esc(title)}</title>
  <projectCrs>${WGS84}</projectCrs>
  <layer-tree-group><customproperties/>${tree}</layer-tree-group>
  <mapcanvas name="theMapCanvas" annotationsVisible="1"><units>degrees</units><extent><xmin>${xmin}</xmin><ymin>${ymin}</ymin><xmax>${xmax}</xmax><ymax>${ymax}</ymax></extent><rotation>0</rotation><destinationsrs>${WGS84}</destinationsrs><rendermaptile>0</rendermaptile></mapcanvas>
  <projectlayers>${maplayers}</projectlayers>
  <layerorder>${layers.map((l) => `<layer id="${l.id}"/>`).join('')}</layerorder>
  <properties><SpatialRefSys><ProjectionsEnabled type="int">1</ProjectionsEnabled></SpatialRefSys><Paths><Absolute type="bool">false</Absolute></Paths><Gui><SelectionColorRedPart type="int">255</SelectionColorRedPart><SelectionColorGreenPart type="int">255</SelectionColorGreenPart><SelectionColorBluePart type="int">0</SelectionColorBluePart><SelectionColorAlphaPart type="int">255</SelectionColorAlphaPart></Gui></properties>
</qgis>
`
}
