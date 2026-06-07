import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

// IMPORTANT: this MUST be createBrowserClient (cookie-backed), not the raw
// createClient from `@supabase/supabase-js` (localStorage-backed). The plain
// client puts the session in localStorage where server route handlers cannot
// see it — every authenticated POST (manual payment, admin, etc.) returns
// 401 even when the user is signed in. createBrowserClient writes the
// session into the same cookies that `await createServerSupabase()` reads.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

export type PlanTier = 'starter' | 'pro' | 'max' | 'enterprise'

// plan_status is independent of plan:
//   - 'free'    : user has an account but has not paid for any plan yet (default)
//   - 'pending' : user submitted manual payment, awaiting admin verification
//   - 'active'  : admin verified payment — their `plan` field grants download access
// Only 'active' lets a user actually download. 'plan' alone means nothing without 'active'.
export type PlanStatus = 'free' | 'pending' | 'active'

export type UserProfile = {
  id:               string
  email:            string
  plan:             PlanTier | null
  plan_status:      PlanStatus
  plan_expires_at:  string | null
  trial_started_at: string | null
  created_at:       string
}
// Shared helper: is this plan still within its paid window?
// null expiry means "no expiry set" — treat as valid (e.g. lifetime/comped accounts).
export function isPlanActive(planStatus: PlanStatus, expiresAt: string | null | undefined): boolean {
  if (planStatus !== 'active') return false
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() > Date.now()
}

/**
 * Datasets are split into THREE tiers and the user's plan unlocks a
 * specific level:
 *
 *   Tier "basic"  (4 datasets):  Admin Boundaries, Rivers, Rainfall, Temperature
 *   Tier "pro"    (+4 = 8):      + Lakes, LULC, Drought Index, Watersheds
 *   Tier "max"    (+rest = 12+): + Aquifers, Population, Protected Areas, …
 *
 *   Plan starter → starter datasets only
 *   Plan pro     → starter + pro datasets
 *   Plan max     → all datasets
 *   Plan enterprise → all datasets + custom sub-country
 */
export type DatasetTier = 'starter' | 'pro' | 'max' | 'enterprise'

// Access helpers moved to src/lib/pricing.ts — import from there.
// These shims keep old call sites compiling during migration.
import { canAccessDataset, PLAN_ORDER, type TierSlug } from './pricing'

export function planLevel(plan: PlanTier | null | undefined): number {
  if (!plan) return 0
  return PLAN_ORDER.indexOf(plan as TierSlug) + 1
}

export function canAccessDatasetTier(
  plan: PlanTier | null | undefined,
  _accountType: unknown,
  datasetTier: DatasetTier,
): boolean {
  if (!plan) return false
  const tierToSlug: Record<string, import('./pricing').DatasetSlug> = {
    starter: 'admin-boundaries',
    pro:     'watersheds',
    max:     'lulc',
    enterprise: 'lulc',
  }
  return canAccessDataset(plan as TierSlug, tierToSlug[datasetTier] ?? 'admin-boundaries')
}

export function hasFullDatasetAccess(plan: PlanTier | null | undefined): boolean {
  return canAccessDatasetTier(plan, null, 'pro')
}



// Map of dataset id → dashboard section URL. A dataset appearing here means
// it has live data the user can actually browse (even without signing in).
// Keep this in sync with the SECTIONS map in src/app/dashboard/page.tsx.
export const LIVE_DATASET_ROUTES: Record<number, string> = {
  1:  '/dashboard?section=admin-boundaries',
  3:  '/dashboard?section=rivers',
  4:  '/dashboard?section=lulc',
  5:  '/dashboard?section=drought-index',
  6:  '/dashboard?section=aquifer',
  8:  '/dashboard?section=population',
  9:  '/dashboard?section=roads',
  11: '/dashboard?section=soil',
  12: '/dashboard?section=protected-areas',
  13: '/dashboard?section=rivers',
  14: '/dashboard?section=watersheds',
  15: '/dashboard?section=rainfall',
  16: '/dashboard?section=temperature',
  17: '/dashboard?section=lakes',
}

export type DatasetSource = {
  name: string
  institution: string
  url: string
  contribution: string
}

export type Dataset = {
  id: number
  name: string
  category: string
  description: string
  source: string
  format: string
  resolution: string
  icon: string
  // Three-tier model. See canAccessDatasetTier() for the access rule.
  // basic = unlocked at any active plan
  // pro   = unlocked at plan='pro', plan='max', or any business plan
  // max   = unlocked at plan='max' or any business plan only
  tier: DatasetTier
  color: string
  sources?: DatasetSource[]
  // Optional GIS-grade metadata — when present, surfaced as badges on the
  // dataset card. Keeps the card compact while answering the questions a
  // GIS pro asks before downloading.
  epsg?:        string  // e.g. 'EPSG:4326'
  licence?:     string  // e.g. 'CC-BY 4.0', 'ODbL', 'Public domain'
  last_update?: string  // e.g. '2024', '2025-Q1'
  size_label?:  string  // e.g. '~3 MB / country'
}

export const DATASETS: Dataset[] = [
  {
    id: 1,
    name: 'Administrative Boundaries',
    category: 'Boundary Mapping',
    description: 'Country, provincial, and district boundaries for all 54 African nations',
    source: 'GADM / OpenStreetMap',
    format: 'Shapefile, GeoJSON, KML',
    resolution: '1:50,000 – 1:250,000',
    icon: '🗺️',
    tier: 'starter',
    color: '#1E5F8E',
    epsg: 'EPSG:4326',
    licence: 'GADM (non-commercial) / ODbL',
    last_update: 'GADM v4.1 · 2022',
    size_label: '~2–8 MB / country',
  },

  {
    id: 3,
    name: 'River Networks',
    category: 'Water & Hydrology',
    description: 'Major river systems and tributaries clipped per country across all 54 African nations',
    source: 'HydroSHEDS / FAO',
    format: 'ZIP (Shapefile)',
    resolution: '90 m hydrological',
    icon: '🌊',
    tier: 'pro',
    color: '#0ea5e9',
    epsg: 'EPSG:4326',
    licence: 'HydroSHEDS (free with attribution)',
    last_update: '2023',
    size_label: '~5–40 MB / country',
  },
  {
    id: 4,
    name: 'Land Use / Land Cover',
    category: 'Environment & Climate',
    description: 'Multi-class land cover classification: forest, cropland, urban, water, grassland',
    source: 'ESA WorldCover',
    format: 'GeoTIFF',
    resolution: '10 m',
    icon: '🌿',
    tier: 'max',
    color: '#16a34a',
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0',
    last_update: 'WorldCover v200 · 2021',
    size_label: '~200 MB – 4 GB / country',
  },
  {
    id: 5,
    name: 'Drought Index (SPI-12)',
    category: 'Environment & Climate',
    description: 'Standardized Precipitation Index (SPI-12) for long-term drought monitoring across Africa',
    source: 'CHIRPS-derived SPI',
    format: 'GeoTIFF (ZIP)',
    resolution: '0.05° (~5 km)',
    icon: '🔥',
    tier: 'starter',
    color: '#ea580c',
    epsg: 'EPSG:4326',
    licence: 'Public domain (USGS/UCSB)',
    last_update: 'CHIRPS v2.0',
    size_label: '~5–20 MB / country',
  },
  {
    id: 15,
    name: 'Rainfall Data',
    category: 'Environment & Climate',
    description: 'Mean annual rainfall totals derived from CHIRPS v2.0 for all 54 African nations',
    source: 'CHIRPS v2.0',
    format: 'GeoTIFF (ZIP)',
    resolution: '0.05° (~5 km)',
    icon: '🌧️',
    tier: 'starter',
    color: '#2563eb',
    epsg: 'EPSG:4326',
    licence: 'Public domain (USGS/UCSB)',
    last_update: 'CHIRPS v2.0',
    size_label: '~5–25 MB / country',
  },
  {
    id: 16,
    name: 'Temperature Data',
    category: 'Environment & Climate',
    description: 'Monthly mean temperature climatology (1970–2000) from WorldClim v2.1',
    source: 'WorldClim v2.1',
    format: 'GeoTIFF (ZIP)',
    resolution: '2.5 arc-min (~5 km)',
    icon: '🌡️',
    tier: 'max',
    color: '#dc2626',
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0',
    last_update: 'WorldClim v2.1 · 2020',
    size_label: '~10–50 MB / country',
  },
  {
    id: 6,
    name: 'Groundwater Aquifers',
    category: 'Groundwater & Hydrogeology',
    description: 'Transboundary aquifer polygons — names, country codes, and geometries for aquifers crossing international borders.',
    source: 'WHYMAP / BGR-UNESCO + IGRAC GGIS',
    format: 'GeoPackage',
    resolution: '1:1M – 1:5M',
    icon: '💧',
    tier: 'starter',
    color: '#0369a1',
    epsg: 'EPSG:4326',
    licence: 'IGRAC open data',
    last_update: 'WHYMAP 2015 · GGIS rolling',
    size_label: '~1–5 MB / country',
  },
 
  {
    id: 8,
    name: 'Population & Settlements',
    category: 'Socioeconomic',
    description: 'Subnational population counts at ADM1/ADM2 — from each country\'s latest census or projection, joined to authoritative boundaries.',
    source: 'HDX COD-PS (UN OCHA)',
    format: 'Shapefile (ZIP)',
    resolution: 'ADM1 / ADM2',
    icon: '🏘️',
    tier: 'pro',
    color: '#dc2626',
    epsg: 'EPSG:4326',
    licence: 'CC BY 3.0 IGO (varies)',
    last_update: 'COD-PS rolling',
    size_label: '~3–15 MB / country',
    sources: [
      {
        name: 'Common Operational Dataset - Population Statistics (COD-PS)',
        institution: 'UN OCHA · HDX',
        url: 'https://data.humdata.org/dashboards/cod',
        contribution: 'Subnational population figures sourced from each country\'s National Statistical Office — latest census or official projection. Reference year varies per country and is preserved in the ref_year attribute.',
      },
      {
        name: 'Common Operational Dataset - Administrative Boundaries (COD-AB)',
        institution: 'UN OCHA · HDX',
        url: 'https://data.humdata.org/dashboards/cod',
        contribution: 'Authoritative administrative boundary geometries (ADM1 / ADM2) aligned with national mapping agencies. Joined to COD-PS on PCODE to attach population to each polygon.',
      },
    ],
  },
  {
    id: 9,
    name: 'Roads & Infrastructure',
    category: 'Transport',
    description: 'Primary, secondary, and tertiary road networks across Africa',
    source: 'OpenStreetMap / GRIP',
    format: 'Shapefile, GeoJSON',
    resolution: 'Vector',
    icon: '🛣️',
    tier: 'pro',
    color: '#ea580c',
    epsg: 'EPSG:4326',
    licence: 'ODbL (OSM)',
    last_update: 'OSM rolling',
    size_label: '~10–80 MB / country',
  },
  {
    id: 10,
    name: 'Wetlands & Floodplains',
    category: 'Water & Hydrology',
    description: 'Wetland extent, flood-prone zones, and seasonal inundation mapping',
    source: 'GlobWetland / JRC',
    format: 'GeoTIFF, Shapefile',
    resolution: '30–100 m',
    icon: '🦆',
    tier: 'max',
    color: '#0891b2',
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0',
    last_update: '2023',
    size_label: '~20–100 MB / country',
  },
  {
    id: 11,
    name: 'Soil Classification',
    category: 'Agriculture',
    description: 'Soil type, texture, organic carbon, pH, and nutrient content layers',
    source: 'ISRIC SoilGrids v2.0',
    format: 'GeoTIFF',
    resolution: '250 m',
    icon: '🌾',
    tier: 'max',
    color: '#a16207',
    epsg: 'EPSG:4326 (reprojected from Homolosine)',
    licence: 'CC BY 4.0',
    last_update: 'SoilGrids v2.0 · 2020',
    size_label: '~30–120 MB / country',
  },
  {
    id: 12,
    name: 'Protected Areas & Wildlife',
    category: 'Conservation',
    description: 'National parks, reserves, conservancies, forest reserves, and marine protected areas — clipped per country.',
    source: 'OpenStreetMap contributors',
    format: 'Shapefile (ZIP)',
    resolution: 'Vector',
    icon: '🐘',
    tier: 'starter',
    color: '#166534',
    epsg: 'EPSG:4326',
    licence: 'ODbL (OSM)',
    last_update: 'OSM rolling',
    size_label: '~2–25 MB / country',
    sources: [
      {
        name: 'OpenStreetMap',
        institution: 'OpenStreetMap Foundation',
        url: 'https://www.openstreetmap.org/copyright',
        contribution: 'Crowdsourced global geodata, queried via the Overpass API for boundary=protected_area and leisure=nature_reserve features. Licensed under the Open Database License (ODbL) — share-alike, attribution required.',
      },
    ],
  },
  {
    id: 13,
    name: 'HydroRIVERS — River Networks',
    category: 'Water & Hydrology',
    description: 'Full African river network with Strahler order, discharge, and length. Per-country GeoPackage from HydroRIVERS v10.',
    source: 'WWF / HydroSHEDS',
    format: 'GeoPackage, GeoJSON',
    resolution: '15 arc-second (~500 m)',
    icon: '🌊',
    tier: 'max',
    color: '#0ea5e9',
    epsg: 'EPSG:4326',
    licence: 'HydroSHEDS (free with attribution)',
    last_update: 'HydroRIVERS v10',
    size_label: '~30–250 MB / country',
  },
  {
    id: 14,
    name: 'Watersheds & Catchments',
    category: 'Water & Hydrology',
    description: 'Level 6 watershed polygons (basins averaging 2,000–10,000 km²). Per-country GeoPackage from HydroBASINS v1c.',
    source: 'WWF / HydroSHEDS',
    format: 'GeoPackage, GeoJSON',
    resolution: 'Level 6 (~2k–10k km²)',
    icon: '🗺️',
    tier: 'pro',
    color: '#0d9488',
    epsg: 'EPSG:4326',
    licence: 'HydroSHEDS (free with attribution)',
    last_update: 'HydroBASINS v1c',
    size_label: '~5–40 MB / country',
  },
  {
    id: 17,
    name: 'Lakes',
    category: 'Water & Hydrology',
    description: 'Per-country lake polygons from HydroLAKES. Includes natural lakes and major reservoirs.',
    source: 'HydroLAKES',
    format: 'ZIP (Shapefile)',
    resolution: 'Vector polygons',
    icon: '🏞️',
    tier: 'max',
    color: '#0ea5e9',
    epsg: 'EPSG:4326',
    licence: 'HydroSHEDS (free with attribution)',
    last_update: 'HydroLAKES v1.0',
    size_label: '~1–8 MB / country',
  },
]
