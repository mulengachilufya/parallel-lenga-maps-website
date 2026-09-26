// src/lib/workspace/transfer.ts
//
// Moving work between desktop GIS and the workspace, in the browser.
//
//  prepareImport  — whatever the user dropped (a QGIS project with its data,
//                   a zipped project folder, loose shapefile parts, GeoPackage,
//                   GeoTIFF, GeoJSON, KML/KMZ, GPX) → a list of clean uploads,
//                   each already parsed once so bad files fail here, not on
//                   the team's map.
//  buildDesktopPackage — the project → one ZIP: a QGIS project (.qgs) with
//                   every layer's data in ./data, styled to match the web map,
//                   plus a README for ArcGIS Pro / QGIS.

import { strToU8, unzipSync, zipSync } from 'fflate'
import { findProjectXml, readQgisProject, shapefileSiblings, writeQgisProject, type QgisExportLayer } from './qgis'
import { parseBytes, getLayerBytes, type LoadedLayer } from './loaders'
import type { LayerStyle, WsLayer } from './types'

export interface PreparedUpload {
  filename:    string
  bytes:       Uint8Array
  label:       string
  file_format: string
  style:       Partial<LayerStyle>
  visible:     boolean
  summary:     string        // "1,204 features" / "Raster 800 × 600"
}

export interface PreparedImport {
  projectTitle: string | null
  uploads:      PreparedUpload[]
  skipped:      { name: string; reason: string }[]
}

const DATA_EXT = /\.(shp|gpkg|geojson|json|kml|kmz|gpx|tif|tiff)$/i
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-80) || 'layer'
const stemOf = (n: string) => (n.replace(/\\/g, '/').split('/').pop() ?? n).replace(/\.[^.]+$/, '')

function formatOf(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.shp') || n.endsWith('.zip')) return 'Shapefile (ZIP)'
  if (n.endsWith('.gpkg')) return 'GeoPackage'
  if (n.endsWith('.tif') || n.endsWith('.tiff')) return 'GeoTIFF'
  if (n.endsWith('.kml') || n.endsWith('.kmz')) return 'KML'
  if (n.endsWith('.gpx')) return 'GPX'
  return 'GeoJSON'
}

function describe(d: LoadedLayer): string {
  return d.kind === 'raster' ? `Raster ${d.raster.width} × ${d.raster.height}` : `${d.count.toLocaleString()} features`
}

const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

/** Turn one data file (plus its siblings, for shapefiles) into an upload. */
async function toUpload(
  name: string, files: Map<string, Uint8Array>, label: string,
  style: Partial<LayerStyle>, visible: boolean, sublayer: string | null,
): Promise<PreparedUpload[]> {
  const lower = name.toLowerCase()
  let bytes: Uint8Array
  let filename: string

  if (lower.endsWith('.shp')) {
    const parts = shapefileSiblings(name, files)
    if (!parts.some((p) => /\.dbf$/i.test(p))) throw new Error('the .dbf file is missing')
    const zipped: Record<string, Uint8Array> = {}
    for (const p of parts) zipped[`${safe(stemOf(name))}${p.slice(p.lastIndexOf('.')).toLowerCase()}`] = files.get(p)!
    bytes = zipSync(zipped)
    filename = `${safe(stemOf(name))}.zip`
  } else if (lower.endsWith('.gpkg')) {
    const { readGeoPackage } = await import('./gpkg')
    const probe = await readGeoPackage(files.get(name)!, sublayer)
    if (!sublayer && probe.tables.length > 1) {
      // One layer per table, like QGIS asks when you open a multi-layer GeoPackage.
      const out: PreparedUpload[] = []
      for (const t of probe.tables) out.push(...await toUpload(name, files, `${label} · ${t}`, style, visible, t))
      return out
    }
    if (sublayer) {
      bytes = strToU8(JSON.stringify(probe.fc))
      filename = `${safe(stemOf(name))}-${safe(sublayer)}.geojson`
    } else {
      bytes = files.get(name)!
      filename = `${safe(stemOf(name))}.gpkg`
    }
  } else {
    bytes = files.get(name)!
    filename = safe(name.replace(/\\/g, '/').split('/').pop() ?? name)
  }

  const parsed = await parseBytes(ab(bytes), style.ramp ?? 'terrain')
  if (parsed.kind === 'vector' && parsed.count === 0) throw new Error('it has no features')
  return [{ filename, bytes, label: label.slice(0, 160), file_format: formatOf(filename), style, visible, summary: describe(parsed) }]
}

export async function prepareImport(input: File[]): Promise<PreparedImport> {
  // Expand everything into one name → bytes map (zips unpacked, paths kept).
  const files = new Map<string, Uint8Array>()
  const rawZips: string[] = []
  for (const f of input) {
    const bytes = new Uint8Array(await f.arrayBuffer())
    if (/\.zip$/i.test(f.name)) {
      const inner = unzipSync(bytes, { filter: (e) => !e.name.startsWith('__MACOSX') && !e.name.endsWith('/') })
      const names = Object.keys(inner)
      // A plain data archive (zipped shapefile / GeoJSON) stays as one file;
      // anything with a project or several datasets is unpacked.
      const hasProject = names.some((n) => /\.qg[sz]$/i.test(n))
      const datasets = new Set(names.filter((n) => DATA_EXT.test(n) && !/\.(shx|dbf|prj)$/i.test(n)).map(stemOf))
      if (!hasProject && datasets.size <= 1) { files.set(f.name, bytes); rawZips.push(f.name); continue }
      for (const [n, b] of Object.entries(inner)) files.set(n, b)
    } else {
      files.set(f.name, bytes)
    }
  }

  const uploads: PreparedUpload[] = []
  const skipped: PreparedImport['skipped'] = []
  const project = findProjectXml(files)

  if (project) {
    const spec = readQgisProject(project.xml, files)
    skipped.push(...spec.skipped)
    for (const l of spec.layers) {
      try { uploads.push(...await toUpload(l.file!, files, l.name, l.style, l.visible, l.sublayer)) }
      catch (e) { skipped.push({ name: l.name, reason: e instanceof Error ? e.message : 'could not be read' }) }
    }
    return { projectTitle: spec.title, uploads, skipped }
  }

  const seen = new Set<string>()
  for (const name of files.keys()) {
    const lower = name.toLowerCase()
    const isData = rawZips.includes(name) || (DATA_EXT.test(lower) && !lower.endsWith('.aux.xml'))
    if (!isData) continue
    const key = lower.endsWith('.shp') ? lower.replace(/\.shp$/, '') : lower
    if (seen.has(key)) continue
    seen.add(key)
    try { uploads.push(...await toUpload(name, files, stemOf(name).replace(/[_-]+/g, ' '), {}, true, null)) }
    catch (e) { skipped.push({ name: stemOf(name), reason: e instanceof Error ? e.message : 'could not be read' }) }
  }
  if (!uploads.length && !skipped.length) {
    skipped.push({ name: 'Upload', reason: 'no GIS data found (expected .qgz/.qgs, .shp, .gpkg, .tif, .geojson, .kml, .gpx or a .zip of these)' })
  }
  return { projectTitle: null, uploads, skipped }
}

// ── Export ──────────────────────────────────────────────────────────────────

export async function buildDesktopPackage(opts: {
  projectId: string
  title:     string
  layers:    WsLayer[]                             // top → bottom
  hidden:    Set<string>
  loaded:    Record<string, LoadedLayer | undefined>
  extent:    [number, number, number, number]
  onProgress?: (done: number, total: number) => void
}): Promise<{ blob: Blob; filename: string; skipped: string[] }> {
  const root = safe(opts.title) || 'Lenga_project'
  const out: Record<string, Uint8Array> = {}
  const qLayers: QgisExportLayer[] = []
  const skipped: string[] = []
  const used = new Set<string>()
  const unique = (s: string) => { let n = s, i = 2; while (used.has(n)) n = `${s}_${i++}`; used.add(n); return n }

  let done = 0
  for (const layer of opts.layers) {
    opts.onProgress?.(done, opts.layers.length)
    try {
      const raw = new Uint8Array(await getLayerBytes(opts.projectId, layer))
      const base = unique(safe(layer.label).slice(0, 60))
      let path = ''
      const isZip = raw[0] === 0x50 && raw[1] === 0x4b
      if (isZip) {
        const inner = unzipSync(raw, { filter: (e) => !e.name.startsWith('__MACOSX') && !e.name.endsWith('/') })
        const names = Object.keys(inner)
        const shp = names.find((n) => /\.shp$/i.test(n))
        const pick = shp ?? names.find((n) => /\.(gpkg|geojson|json|kml|tif|tiff)$/i.test(n))
        if (!pick) throw new Error('no data file in archive')
        if (shp) {
          const stem = shp.replace(/\.shp$/i, '')
          for (const n of names.filter((x) => x.startsWith(stem + '.'))) out[`${root}/data/${base}/${base}${n.slice(n.lastIndexOf('.')).toLowerCase()}`] = inner[n]
          path = `./data/${base}/${base}.shp`
        } else {
          const ext = pick.slice(pick.lastIndexOf('.')).toLowerCase()
          out[`${root}/data/${base}${ext}`] = inner[pick]
          path = `./data/${base}${ext}`
        }
      } else {
        const head = new TextDecoder().decode(raw.subarray(0, 16))
        const ext = head.startsWith('SQLite format 3') ? '.gpkg'
          : (raw[0] === 0x49 && raw[1] === 0x49) || (raw[0] === 0x4d && raw[1] === 0x4d) ? '.tif'
          : head.trimStart().startsWith('<') ? '.kml' : '.geojson'
        out[`${root}/data/${base}${ext}`] = raw
        path = `./data/${base}${ext}`
      }

      const d = opts.loaded[layer.id]
      const geom = d?.kind === 'vector' ? d.geom : null
      qLayers.push({
        id: `lenga_${layer.id.replace(/[^A-Za-z0-9]/g, '')}`,
        name: layer.label,
        path,
        kind: d?.kind === 'raster' || path.endsWith('.tif') ? 'raster' : 'vector',
        geometry: geom?.has('Polygon') ? 'Polygon' : geom?.has('LineString') ? 'Line' : geom?.has('Point') ? 'Point' : 'Polygon',
        visible: !opts.hidden.has(layer.id),
        style: layer.style,
        raster: d?.kind === 'raster' ? { min: d.raster.min, max: d.raster.max, categories: d.raster.categories } : undefined,
      })
    } catch (e) {
      skipped.push(`${layer.label}: ${e instanceof Error ? e.message : 'could not be packaged'}`)
    }
    done++
  }
  opts.onProgress?.(done, opts.layers.length)

  out[`${root}/${root}.qgs`] = strToU8(writeQgisProject({ title: opts.title, extent: opts.extent, layers: qLayers }))
  out[`${root}/README.txt`] = strToU8(readme(opts.title, qLayers, skipped))
  const zipped = zipSync(out, { level: 6 })
  return { blob: new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }), filename: `${root}.zip`, skipped }
}

function readme(title: string, layers: QgisExportLayer[], skipped: string[]): string {
  return [
    `${title}`,
    `Exported from the Lenga Maps workspace on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    'QGIS (3.x)',
    `  Unzip, then double-click ${safe(title) || 'Lenga_project'}.qgs, or Project > Open in QGIS.`,
    '  Layers, draw order, visibility and styling match the web map. Paths are',
    '  relative, so keep the .qgs file next to the data folder.',
    '',
    'ArcGIS Pro',
    '  Unzip, then Insert > New Map and Add Data > Data, and select the files in',
    '  the data folder (shapefiles, GeoPackages, GeoTIFFs). All data is WGS 84',
    '  (EPSG:4326). Styling is carried in the QGIS project only; in ArcGIS Pro the',
    '  layers open with default symbology.',
    '',
    'Layers (top to bottom)',
    ...layers.map((l) => `  - ${l.name}  →  ${l.path}`),
    ...(skipped.length ? ['', 'Not included', ...skipped.map((s) => `  - ${s}`)] : []),
    '',
  ].join('\r\n')
}
