'use client'

/**
 * The workstation map (MapLibre GL).
 *
 * Layers arrive ordered bottom → top. Each is fetched and parsed on demand
 * (see lib/workspace/loaders), then drawn as up to three sublayers:
 * polygon fill, line/outline, and points, or a single raster image. The
 * component owns MapLibre; the page owns project state.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Map as MlMap, Marker, Popup, StyleSpecification, MapMouseEvent } from 'maplibre-gl'
import { loadLayer, type LoadedLayer } from '@/lib/workspace/loaders'
import type { Basemap, WsLayer, WsMessage } from '@/lib/workspace/types'

export interface LayerStatus {
  state: 'loading' | 'ready' | 'error'
  error?: string
  loaded?: LoadedLayer
}

export interface MapViewHandle {
  flyTo: (lng: number, lat: number, zoom: number) => void
  zoomToLayer: (id: string) => void
  getView: () => { lng: number; lat: number; zoom: number } | null
  getBounds: () => [number, number, number, number] | null
  /** Features of a vector layer are addressed by their index in its FeatureCollection. */
  highlight: (layerId: string | null, ids: number[]) => void
  zoomToFeatures: (layerId: string, ids: number[]) => void
  filterFeatures: (layerId: string, ids: number[] | null) => void
  resize: () => void
}

export interface ViewInfo { lng: number; lat: number; zoom: number; scale: number }

interface Props {
  projectId:     string
  layers:        WsLayer[]              // bottom → top
  hidden:        Set<string>
  basemap:       Basemap
  initial:       { center: [number, number]; zoom: number }
  pins:          WsMessage[]
  draftPin:      { lng: number; lat: number } | null
  picking:       boolean
  onPick:        (lng: number, lat: number) => void
  onPinClick:    (messageId: string) => void
  onStatus:      (layerId: string, status: LayerStatus) => void
  onView:        (v: ViewInfo) => void
  onCursor:      (c: { lng: number; lat: number } | null) => void
  onBasemapFailed?: () => void
  /** A feature was clicked on the map (identify). additive = Ctrl/Cmd/Shift held. */
  onFeaturePick?: (layerId: string, featureIndex: number, additive: boolean) => void
}

// ── Basemaps ────────────────────────────────────────────────────────────────

const PAPER_BG = '#f4f1e8'

function rasterStyle(tiles: string[], attribution: string, maxzoom = 19): StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles, tileSize: 256, attribution, maxzoom } },
    layers: [
      { id: 'paper', type: 'background', paint: { 'background-color': PAPER_BG } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  }
}

function basemapStyle(b: Basemap): string | StyleSpecification {
  switch (b) {
    case 'light':
      return 'https://tiles.openfreemap.org/styles/positron'
    case 'topo':
      return rasterStyle(
        ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
        'Map data © OpenStreetMap contributors, SRTM · Style © OpenTopoMap (CC-BY-SA)', 17)
    case 'imagery':
      return rasterStyle(
        ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
        'Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016)', 15)
    default:
      return {
        version: 8, sources: {},
        layers: [{ id: 'paper', type: 'background', paint: { 'background-color': PAPER_BG } }],
      }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const src = (id: string) => `ws-src-${id}`
const sub = (id: string, k: 'fill' | 'line' | 'circle' | 'raster') => `ws-${k}-${id}`
const ALL_SUBS = ['fill', 'line', 'circle', 'raster'] as const

function metresPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ── Component ───────────────────────────────────────────────────────────────

const MapView = forwardRef<MapViewHandle, Props>(function MapView(props, ref) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const lib = useRef<typeof import('maplibre-gl') | null>(null)
  const loaded = useRef(new Map<string, { key: string; data: LoadedLayer }>())
  const pending = useRef(new Set<string>())
  const markers = useRef<Marker[]>([])
  const draftMarker = useRef<Marker | null>(null)
  const popup = useRef<Popup | null>(null)
  const latest = useRef(props)
  latest.current = props
  const styleReady = useRef(false)
  const [ready, setReady] = useState(false)

  // ── Draw one loaded layer (idempotent) ───────────────────────────────────
  const drawLayer = useCallback((layer: WsLayer, data: LoadedLayer) => {
    const m = map.current
    if (!m || !styleReady.current) return
    const s = layer.style
    const hidden = latest.current.hidden.has(layer.id)
    const vis = hidden ? 'none' : 'visible'

    if (data.kind === 'raster') {
      const r = data.raster
      // Streamed COGs are drawn as tiles (lib/workspace/cog.ts); small files as one image.
      const want = r.tiles ? `lcog://${encodeURIComponent(r.tiles.id)}/{z}/{x}/{y}` : r.dataUrl
      const existing = m.getSource(src(layer.id)) as { url?: string; tiles?: string[] } | undefined
      if (existing && (existing.tiles?.[0] ?? existing.url) !== want) {
        if (m.getLayer(sub(layer.id, 'raster'))) m.removeLayer(sub(layer.id, 'raster'))
        m.removeSource(src(layer.id))
      }
      if (!m.getSource(src(layer.id))) {
        if (r.tiles) {
          m.addSource(src(layer.id), { type: 'raster', tiles: [want], tileSize: 256, bounds: r.bbox, maxzoom: r.tiles.maxzoom })
        } else {
          m.addSource(src(layer.id), { type: 'image', url: r.dataUrl, coordinates: r.coordinates })
        }
      }
      if (!m.getLayer(sub(layer.id, 'raster'))) {
        m.addLayer({ id: sub(layer.id, 'raster'), type: 'raster', source: src(layer.id),
          paint: { 'raster-opacity': s.opacity, 'raster-resampling': r.stats?.mode === 'ramp' || r.stats?.mode === 'rgb' ? 'linear' : 'nearest', 'raster-fade-duration': 0 } })
      } else {
        m.setPaintProperty(sub(layer.id, 'raster'), 'raster-opacity', s.opacity)
      }
      m.setLayoutProperty(sub(layer.id, 'raster'), 'visibility', vis)
      return
    }

    if (!m.getSource(src(layer.id))) m.addSource(src(layer.id), { type: 'geojson', data: data.fc, tolerance: 0.4, generateId: true })
    const polys = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]
    const lines = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']]]
    const points = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]]

    if (!m.getLayer(sub(layer.id, 'fill'))) {
      m.addLayer({ id: sub(layer.id, 'fill'), type: 'fill', source: src(layer.id), filter: polys as never, paint: {} })
      m.addLayer({ id: sub(layer.id, 'line'), type: 'line', source: src(layer.id), filter: lines as never,
        layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: {} })
      m.addLayer({ id: sub(layer.id, 'circle'), type: 'circle', source: src(layer.id), filter: points as never, paint: {} })
    }
    m.setPaintProperty(sub(layer.id, 'fill'), 'fill-color', s.color)
    m.setPaintProperty(sub(layer.id, 'fill'), 'fill-opacity', s.fill ? s.opacity * 0.38 : 0)
    m.setPaintProperty(sub(layer.id, 'line'), 'line-color', s.color)
    // Hierarchy the way a cartographer draws it: bigger rivers (Strahler
    // order, HydroRIVERS) and bigger roads (Natural Earth type) draw wider.
    // Features without those fields keep the layer's width.
    m.setPaintProperty(sub(layer.id, 'line'), 'line-width', ['*', s.width, ['case',
      ['has', 'ORD_STRA'], ['max', 0.35, ['*', 0.32, ['to-number', ['get', 'ORD_STRA'], 3]]],
      ['has', 'type'], ['match', ['get', 'type'], 'Major Highway', 2, 'Secondary Highway', 1.4, 'Road', 1, 'Track', 0.6, 'Ferry Route', 0.8, 1],
      1]] as never)
    m.setPaintProperty(sub(layer.id, 'line'), 'line-opacity', s.opacity)
    m.setPaintProperty(sub(layer.id, 'circle'), 'circle-color', s.color)
    m.setPaintProperty(sub(layer.id, 'circle'), 'circle-opacity', s.opacity)
    m.setPaintProperty(sub(layer.id, 'circle'), 'circle-radius', ['interpolate', ['linear'], ['zoom'], 3, 1.5 + s.width * 0.6, 10, 3 + s.width * 1.2])
    m.setPaintProperty(sub(layer.id, 'circle'), 'circle-stroke-color', '#ffffff')
    m.setPaintProperty(sub(layer.id, 'circle'), 'circle-stroke-width', 0.6)
    m.setPaintProperty(sub(layer.id, 'circle'), 'circle-stroke-opacity', s.opacity)
    for (const k of ['fill', 'line', 'circle'] as const) m.setLayoutProperty(sub(layer.id, k), 'visibility', vis)
    const f = featureFilter.current.get(layer.id)
    for (const [k, base] of [['fill', polys], ['line', lines], ['circle', points]] as const) {
      m.setFilter(sub(layer.id, k), (f ? ['all', base, ['in', ['id'], ['literal', f]]] : base) as never)
    }
  }, [])

  // ── Selection highlight (drawn above everything) ─────────────────────────
  const selection = useRef<{ layerId: string | null; ids: number[] }>({ layerId: null, ids: [] })
  const featureFilter = useRef(new Map<string, number[]>())
  const drawHighlight = useCallback(() => {
    const m = map.current
    if (!m || !styleReady.current) return
    const { layerId, ids } = selection.current
    const d = layerId ? loaded.current.get(layerId)?.data : undefined
    const feats = d && d.kind === 'vector' ? ids.map((i) => d.fc.features[i]).filter(Boolean) : []
    const fc = { type: 'FeatureCollection' as const, features: feats }
    const s = m.getSource('ws-sel') as { setData?: (d: unknown) => void } | undefined
    if (s?.setData) s.setData(fc)
    else {
      m.addSource('ws-sel', { type: 'geojson', data: fc })
      m.addLayer({ id: 'ws-sel-fill', type: 'fill', source: 'ws-sel', filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]] as never,
        paint: { 'fill-color': '#f2c94c', 'fill-opacity': 0.28 } })
      m.addLayer({ id: 'ws-sel-line', type: 'line', source: 'ws-sel', filter: ['!', ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]]] as never,
        layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#f2c94c', 'line-width': 3 } })
      m.addLayer({ id: 'ws-sel-circle', type: 'circle', source: 'ws-sel', filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]] as never,
        paint: { 'circle-color': '#f2c94c', 'circle-radius': 6, 'circle-stroke-color': '#10161c', 'circle-stroke-width': 1.5 } })
    }
    for (const id of ['ws-sel-fill', 'ws-sel-line', 'ws-sel-circle']) if (m.getLayer(id)) m.moveLayer(id)
  }, [])

  const removeLayer = useCallback((id: string) => {
    const m = map.current
    if (!m) return
    for (const k of ALL_SUBS) if (m.getLayer(sub(id, k))) m.removeLayer(sub(id, k))
    if (m.getSource(src(id))) m.removeSource(src(id))
  }, [])

  // ── Bring the map in line with the layer list ────────────────────────────
  const sync = useCallback(() => {
    const m = map.current
    if (!m || !styleReady.current) return
    const { layers, projectId, onStatus } = latest.current
    const ids = new Set(layers.map((l) => l.id))

    for (const id of [...loaded.current.keys()]) {
      if (!ids.has(id)) { removeLayer(id); loaded.current.delete(id) }
    }

    for (const layer of layers) {
      const key = `${layer.r2_key}|${layer.style.ramp}`
      const have = loaded.current.get(layer.id)
      if (have && have.key === key) { drawLayer(layer, have.data); continue }
      if (pending.current.has(`${layer.id}|${key}`)) continue
      pending.current.add(`${layer.id}|${key}`)
      onStatus(layer.id, { state: 'loading' })
      loadLayer(projectId, layer)
        .then((data) => {
          pending.current.delete(`${layer.id}|${key}`)
          const current = latest.current.layers.find((l) => l.id === layer.id)
          if (!current || `${current.r2_key}|${current.style.ramp}` !== key) return
          if (have) removeLayer(layer.id)
          loaded.current.set(layer.id, { key, data })
          drawLayer(current, data)
          order()
          latest.current.onStatus(layer.id, { state: 'ready', loaded: data })
        })
        .catch((err: unknown) => {
          pending.current.delete(`${layer.id}|${key}`)
          latest.current.onStatus(layer.id, { state: 'error', error: err instanceof Error ? err.message : 'Could not load' })
        })
    }
    order()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawLayer, removeLayer])

  // If a basemap style can't be fetched (offline, blocked by a corporate
  // proxy), fall back to plain paper so the data layers still draw.
  const fellBack = useRef(false)
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function fallbackToPaper() {
    const m = map.current
    if (!m || styleReady.current || fellBack.current) return
    fellBack.current = true
    m.setStyle(basemapStyle('none'), { diff: false })
    latest.current.onBasemapFailed?.()
  }
  function armFallback() {
    fellBack.current = false
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current)
    fallbackTimer.current = setTimeout(fallbackToPaper, 10_000)
  }

  // Stack sublayers bottom → top; moveLayer with no target sends to the top.
  function order() {
    const m = map.current
    if (!m) return
    for (const layer of latest.current.layers) {
      for (const k of ['raster', 'fill', 'line', 'circle'] as const) {
        if (m.getLayer(sub(layer.id, k))) m.moveLayer(sub(layer.id, k))
      }
    }
    for (const id of ['ws-sel-fill', 'ws-sel-line', 'ws-sel-circle']) if (m.getLayer(id)) m.moveLayer(id)
  }

  // ── Create the map once ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const maplibregl = await import('maplibre-gl')
      if (cancelled || !box.current) return
      // Bundlers break MapLibre's "worker next to me" lookup; serve the
      // version-matched worker from public/vendor (scripts/copy-vendor.mjs).
      maplibregl.setWorkerUrl(new URL('/vendor/maplibre/maplibre-gl-worker.mjs', window.location.origin).href)
      lib.current = maplibregl
      const { initial, basemap } = latest.current
      const m = new maplibregl.Map({
        container: box.current,
        style: basemapStyle(basemap),
        center: initial.center,
        zoom: initial.zoom,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
      })
      map.current = m
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      m.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left')
      m.touchZoomRotate.disableRotation()

      m.on('style.load', () => { styleReady.current = true; sync(); drawHighlight() })

      m.on('error', () => fallbackToPaper())
      armFallback()

      const report = () => {
        const c = m.getCenter(); const z = m.getZoom()
        latest.current.onView({ lng: c.lng, lat: c.lat, zoom: z, scale: metresPerPixel(c.lat, z) / 0.00028 })
      }
      m.on('moveend', report)
      m.on('load', () => { report(); setReady(true) })
      m.on('mousemove', (e) => latest.current.onCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat }))
      m.on('mouseout', () => latest.current.onCursor(null))

      m.on('click', (e: MapMouseEvent) => {
        if (latest.current.picking) { latest.current.onPick(e.lngLat.lng, e.lngLat.lat); return }
        identify(e)
      })
    })()
    return () => {
      cancelled = true
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current)
      map.current?.remove()
      map.current = null
      styleReady.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Identify tool: attribute table of the topmost feature ────────────────
  function identify(e: MapMouseEvent) {
    const m = map.current, ml = lib.current
    if (!m || !ml) return
    const layerIds = [...latest.current.layers].reverse()
      .flatMap((l) => (['circle', 'line', 'fill'] as const).map((k) => sub(l.id, k)))
      .filter((id) => m.getLayer(id))
    if (!layerIds.length) return
    const hits = m.queryRenderedFeatures([[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]], { layers: layerIds })
    popup.current?.remove()
    if (!hits.length) return

    const f = hits[0]
    const layerId = f.layer.id.replace(/^ws-(fill|line|circle)-/, '')
    const layer = latest.current.layers.find((l) => l.id === layerId)
    if (typeof f.id === 'number') {
      const ev = e.originalEvent as MouseEvent
      latest.current.onFeaturePick?.(layerId, f.id, ev.ctrlKey || ev.metaKey || ev.shiftKey)
    }

    const root = document.createElement('div')
    root.className = 'ws-identify'
    const ttl = document.createElement('div')
    ttl.className = 'ttl'
    ttl.textContent = layer?.label ?? 'Feature'
    root.appendChild(ttl)
    const scroll = document.createElement('div')
    scroll.className = 'scroll'
    const table = document.createElement('table')
    const entries = Object.entries(f.properties ?? {})
    if (!entries.length) {
      const tr = table.insertRow(); const td = tr.insertCell(); td.colSpan = 2; td.textContent = 'No attributes'
    }
    for (const [k, v] of entries.slice(0, 80)) {
      const tr = table.insertRow()
      tr.insertCell().textContent = k
      tr.insertCell().textContent = formatValue(v)
    }
    scroll.appendChild(table)
    root.appendChild(scroll)
    if (hits.length > 1) {
      const more = document.createElement('div')
      more.className = 'muted small'
      more.style.padding = '3px 7px'
      more.textContent = `${hits.length - 1} more feature${hits.length > 2 ? 's' : ''} under the cursor`
      root.appendChild(more)
    }
    popup.current = new ml.Popup({ closeButton: true, maxWidth: '340px', offset: 6 })
      .setLngLat(e.lngLat).setDOMContent(root).addTo(m)
  }

  // ── Reactions to prop changes ────────────────────────────────────────────
  useEffect(() => { sync() }, [props.layers, props.hidden, sync])

  const lastBasemap = useRef(props.basemap)
  useEffect(() => {
    const m = map.current
    if (!m || lastBasemap.current === props.basemap) return
    lastBasemap.current = props.basemap
    styleReady.current = false
    armFallback()
    m.setStyle(basemapStyle(props.basemap), { diff: false })
  // armFallback only touches refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.basemap])

  // Comment pins
  useEffect(() => {
    const m = map.current, ml = lib.current
    markers.current.forEach((mk) => mk.remove())
    markers.current = []
    if (!m || !ml) return
    props.pins.forEach((msg, i) => {
      if (msg.lng === null || msg.lat === null) return
      const el = document.createElement('div')
      el.className = 'ws-pin'
      el.title = `${msg.author_name}: ${msg.body.slice(0, 80)}`
      const n = document.createElement('span'); n.textContent = String(i + 1); el.appendChild(n)
      el.addEventListener('click', (ev) => { ev.stopPropagation(); latest.current.onPinClick(msg.id) })
      markers.current.push(new ml.Marker({ element: el, anchor: 'bottom-left' }).setLngLat([msg.lng, msg.lat]).addTo(m))
    })
  }, [props.pins, ready])

  useEffect(() => {
    const m = map.current, ml = lib.current
    draftMarker.current?.remove()
    draftMarker.current = null
    if (!m || !ml || !props.draftPin) return
    const el = document.createElement('div')
    el.className = 'ws-pin draft'
    const n = document.createElement('span'); n.textContent = '+'; el.appendChild(n)
    draftMarker.current = new ml.Marker({ element: el, anchor: 'bottom-left' })
      .setLngLat([props.draftPin.lng, props.draftPin.lat]).addTo(m)
  }, [props.draftPin, ready])

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, zoom) => map.current?.flyTo({ center: [lng, lat], zoom, essential: true, speed: 1.6 }),
    zoomToLayer: (id) => {
      const d = loaded.current.get(id)?.data
      const bbox = d ? (d.kind === 'raster' ? d.raster.bbox : d.bbox) : null
      if (bbox && map.current) map.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 30, maxZoom: 12, duration: 700 })
    },
    getView: () => {
      const m = map.current
      if (!m) return null
      const c = m.getCenter()
      return { lng: c.lng, lat: c.lat, zoom: m.getZoom() }
    },
    getBounds: () => {
      const b = map.current?.getBounds()
      return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null
    },
    highlight: (layerId, ids) => { selection.current = { layerId, ids }; drawHighlight() },
    zoomToFeatures: (layerId, ids) => {
      const d = loaded.current.get(layerId)?.data
      if (!d || d.kind !== 'vector' || !map.current || !ids.length) return
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      const visit = (c: unknown): void => {
        if (typeof (c as number[])[0] === 'number') {
          const [x, y] = c as number[]
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
        } else (c as unknown[]).forEach(visit)
      }
      for (const i of ids) {
        const g = d.fc.features[i]?.geometry
        if (g && 'coordinates' in g) visit(g.coordinates)
      }
      if (!Number.isFinite(x0)) return
      const pad = x0 === x1 && y0 === y1 ? 0.01 : 0
      map.current.fitBounds([[x0 - pad, y0 - pad], [x1 + pad, y1 + pad]], { padding: 40, maxZoom: 14, duration: 600 })
    },
    filterFeatures: (layerId, ids) => {
      if (ids) featureFilter.current.set(layerId, ids); else featureFilter.current.delete(layerId)
      const layer = latest.current.layers.find((l) => l.id === layerId)
      const d = loaded.current.get(layerId)?.data
      if (layer && d) drawLayer(layer, d)
    },
    resize: () => map.current?.resize(),
  }), [drawHighlight, drawLayer])

  return <div ref={box} className="ws-map" />
})

export default MapView
