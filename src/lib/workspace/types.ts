// src/lib/workspace/types.ts
//
// Shapes shared by the workspace API routes and the workstation UI.
// Kept free of server imports so client components can use it.

export type Basemap = 'light' | 'topo' | 'imagery' | 'none'

export interface MapState {
  center:  [number, number]   // [lng, lat]
  zoom:    number
  basemap: Basemap
}

export type RasterRamp = 'terrain' | 'rainfall' | 'heat' | 'categorical'

export interface LayerStyle {
  color:   string    // #rrggbb, stroke / point / fill colour
  opacity: number    // 0..1
  width:   number    // line width in px
  fill:    boolean   // polygons: fill as well as outline
  ramp:    RasterRamp
}

export interface WsLayer {
  id:            string
  project_id:    string
  dataset_slug:  string
  country:       string
  r2_key:        string
  file_format:   string
  label:         string
  style:         LayerStyle
  sort_order:    number
  added_by:      string | null
  added_by_name: string | null
  created_at:    string
}

export interface WsBookmark {
  id:              string
  project_id:      string
  name:            string
  lng:             number
  lat:             number
  zoom:            number
  created_by:      string | null
  created_by_name: string | null
  created_at:      string
}

export interface WsProject {
  id:          string
  org_id:      string
  name:        string
  description: string
  map_state:   MapState
  created_by:  string | null
  created_at:  string
  updated_at:  string
}

export interface WsProjectSummary extends WsProject {
  layer_count:  number
  last_rev:     { seq: number; author_name: string; summary: string; created_at: string } | null
}

export interface WsMember {
  user_id: string
  name:    string
  email:   string
  role:    'owner' | 'member'
}

export interface WsMessage {
  id:          string
  project_id:  string
  parent_id:   string | null
  author_id:   string | null
  author_name: string
  body:        string
  lng:         number | null
  lat:         number | null
  mentions:    string[]
  created_at:  string
  edited_at:   string | null
  deleted_at:  string | null
}

export interface WsSnapshot {
  name:        string
  description: string
  map_state:   MapState
  layers:      Omit<WsLayer, 'project_id'>[]
  bookmarks:   Omit<WsBookmark, 'project_id'>[]
}

export interface WsRevision {
  id:          string
  project_id:  string
  seq:         number
  author_id:   string | null
  author_name: string
  action:      string
  summary:     string
  created_at:  string
}

export interface WsProjectBundle {
  project:   WsProject
  layers:    WsLayer[]
  bookmarks: WsBookmark[]
  members:   WsMember[]
  me:        { user_id: string; name: string; role: 'owner' | 'member' }
  org:       { id: string; name: string }
  head:      number   // latest revision seq, 0 if none
}

export interface CatalogDataset {
  id:       string
  name:     string
  category: string
  raster:   boolean
}

export interface CatalogFile {
  country:      string
  country_iso3: string
  r2_key:       string
  file_size_mb: number
  file_format:  string
  variant:      string
}

// ── Defaults ────────────────────────────────────────────────────────────────

// Cartographic defaults per dataset: the colours a map-maker would reach for,
// not a UI palette. Water is blue, boundaries are grey, protected land green.
const DATASET_STYLE: Record<string, Partial<LayerStyle>> = {
  'admin-boundaries': { color: '#4d4d4d', width: 1,   fill: false },
  'rivers':           { color: '#2f6fae', width: 1,   fill: false },
  'hydrorivers':      { color: '#2f6fae', width: 1,   fill: false },
  'lakes':            { color: '#3f7fb8', width: 0.8, fill: true  },
  'watersheds':       { color: '#6d7f3a', width: 1,   fill: false },
  'aquifer':          { color: '#7a5c99', width: 1.2, fill: true  },
  'protected-areas':  { color: '#2e7d4f', width: 1,   fill: true  },
  'roads':            { color: '#9a5b2c', width: 1.2, fill: false },
  'population':       { color: '#b03a2e', width: 1,   fill: true  },
  'rainfall':         { ramp: 'rainfall' },
  'drought-index':    { ramp: 'heat' },
  'temperature':      { ramp: 'heat' },
  'lulc':             { ramp: 'categorical' },
  'soil':             { ramp: 'categorical' },
  'wetlands':         { ramp: 'categorical' },
}

export function defaultStyle(datasetSlug: string): LayerStyle {
  return {
    color: '#4d4d4d', opacity: 0.85, width: 1, fill: false, ramp: 'terrain',
    ...DATASET_STYLE[datasetSlug],
  }
}

export const DEFAULT_MAP_STATE: MapState = { center: [25, -4], zoom: 3, basemap: 'light' }

// ── Sanitisers (used server-side on every write) ────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i
const RAMPS: RasterRamp[] = ['terrain', 'rainfall', 'heat', 'categorical']
const BASEMAPS: Basemap[] = ['light', 'topo', 'imagery', 'none']

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.min(hi, Math.max(lo, v))
}

export function sanitizeStyle(input: unknown, base: LayerStyle): LayerStyle {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    color:   typeof s.color === 'string' && HEX.test(s.color) ? s.color.toLowerCase() : base.color,
    opacity: clamp(s.opacity, 0, 1, base.opacity),
    width:   clamp(s.width, 0.25, 8, base.width),
    fill:    typeof s.fill === 'boolean' ? s.fill : base.fill,
    ramp:    RAMPS.includes(s.ramp as RasterRamp) ? (s.ramp as RasterRamp) : base.ramp,
  }
}

export function sanitizeMapState(input: unknown, base: MapState = DEFAULT_MAP_STATE): MapState {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const c = Array.isArray(s.center) ? s.center : base.center
  return {
    center:  [clamp(c[0], -180, 180, base.center[0]), clamp(c[1], -85, 85, base.center[1])],
    zoom:    clamp(s.zoom, 0, 22, base.zoom),
    basemap: BASEMAPS.includes(s.basemap as Basemap) ? (s.basemap as Basemap) : base.basemap,
  }
}

/** Short, stable id for a revision, shown like a git abbreviated hash. */
export function shortRev(id: string): string {
  return id.replace(/-/g, '').slice(0, 7)
}
