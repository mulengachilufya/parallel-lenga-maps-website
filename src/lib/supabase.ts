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

export type PlanTier = 'individual' | 'team'

// plan_status is independent of plan:
//   - 'free'    : user has an account but has not paid yet (default)
//   - 'pending' : user submitted manual payment, awaiting admin verification
//   - 'active'  : admin verified payment — their `plan` field grants download access
// Only 'active' lets a user actually download. 'plan' alone means nothing without 'active'.
// Once-off model: there is no renewal state. 'active' stays active forever
// once granted — see isPlanActive() below.
export type PlanStatus = 'free' | 'pending' | 'active'

export type UserProfile = {
  id:               string
  email:            string
  plan:             PlanTier | null
  plan_status:      PlanStatus
  created_at:       string
}

// Shared helper: is this account entitled to download?
// Once-off plans never expire — this is just an alias for plan_status
// being 'active'. Kept as a named helper (rather than inlining
// `status === 'active'` everywhere) so the "no expiry" decision lives in
// one place if that ever changes again.
export function isPlanActive(planStatus: PlanStatus): boolean {
  return planStatus === 'active'
}

/**
 * Datasets carry a `tier` field purely for CATALOGUE DISPLAY ORDER now —
 * it no longer gates access. Every paid account (individual or team) can
 * download every dataset; see canAccessDataset() in pricing.ts. This just
 * keeps the grid on /datasets and /dashboard showing "core" datasets
 * before "advanced" ones, same visual order as before the pricing change.
 */
export type DatasetTier = 'starter' | 'pro' | 'max' | 'enterprise'

const TIER_RANK: Record<DatasetTier, number> = {
  starter:    0,
  pro:        1,
  max:        2,
  enterprise: 3,
}

/** Sort by display tier (starter → pro → max → enterprise), then by
 *  dataset id within each tier to keep the order deterministic. */
export function sortDatasetsByTier<T extends { tier: DatasetTier; id: number }>(
  list: readonly T[],
): T[] {
  return [...list].sort((a, b) => {
    const ta = TIER_RANK[a.tier] ?? 99
    const tb = TIER_RANK[b.tier] ?? 99
    if (ta !== tb) return ta - tb
    return a.id - b.id
  })
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
  12: '/dashboard?section=protected-areas',
  13: '/dashboard?section=rivers',
  14: '/dashboard?section=watersheds',
  15: '/dashboard?section=rainfall',
  16: '/dashboard?section=temperature',
  17: '/dashboard?section=lakes',
  11: '/dashboard?section=soil',
  18: '/dashboard?section=crop-production',
  19: '/dashboard?section=tree-cover-loss',
  20: '/dashboard?section=soil-nutrients',
  21: '/dashboard?section=mining-geology',
  22: '/dashboard?section=solar-wind',
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
  // Display order only now, not an access gate — see DatasetTier above.
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
    source: 'geoBoundaries',
    format: 'Shapefile, GeoJSON, KML',
    resolution: '1:50,000 – 1:250,000',
    icon: '🗺️',
    tier: 'starter',
    color: '#1E3A5C', // deep oceanic navy — admin / boundary
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0 (geoBoundaries)',
    last_update: 'geoBoundaries gbOpen',
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
    color: '#0E7C8C', // deep teal — water bodies
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
    color: '#1F6B3A', // pine / forest green
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0',
    last_update: 'WorldCover v200 · 2021',
    size_label: '~200 MB – 4 GB / country',
  },
  {
    id: 5,
    name: 'Drought Index (SPI-12)',
    category: 'Environment & Climate',
    description: 'SPI-12: rainfall over 12 months compared with normal, in standard deviations. Below 0 is drier than normal, -1.5 or lower is severe drought. From CHIRPS v2.0, baseline 2014 to 2023.',
    source: 'CHIRPS-derived SPI',
    format: 'GeoTIFF (ZIP)',
    resolution: '0.05° (~5 km)',
    icon: '🔥',
    tier: 'starter',
    color: '#9A4E2D', // burnt sienna — drought / drylands
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
    color: '#1F3A8A', // storm / rain indigo
    epsg: 'EPSG:4326',
    licence: 'Public domain (USGS/UCSB)',
    last_update: 'CHIRPS v2.0',
    size_label: '~5–25 MB / country',
  },
  {
    id: 16,
    name: 'Temperature Data',
    category: 'Environment & Climate',
    description: 'Annual and monthly mean temperature, 1981–2010 averages, at about 1 km: 13 bands in one GeoTIFF per country.',
    source: 'CHELSA v2.1',
    format: 'GeoTIFF (ZIP)',
    resolution: '30 arc-sec (~1 km)',
    icon: '🌡️',
    tier: 'max',
    color: '#9F1239', // deep crimson — temperature / heat
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0',
    last_update: 'CHELSA v2.1 · 1981–2010',
    size_label: '~0.1–30 MB / country',
  },
  {
    id: 6,
    name: 'Transboundary Aquifers',
    category: 'Groundwater & Hydrogeology',
    description: 'Transboundary aquifer polygons — names, country codes, and geometries for aquifers crossing international borders.',
    source: 'WHYMAP / BGR-UNESCO + IGRAC GGIS',
    format: 'GeoPackage',
    resolution: '1:1M – 1:5M',
    icon: '💧',
    tier: 'starter',
    color: '#155E75', // deep cyan — groundwater
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
    color: '#7C2D12', // rich rust — settlements
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
    color: '#A16207', // dark amber / bronze — infrastructure
    epsg: 'EPSG:4326',
    licence: 'ODbL (OSM)',
    last_update: 'OSM rolling',
    size_label: '~10–80 MB / country',
  },
  {
    id: 11,
    name: 'Soil Classification',
    category: 'Agriculture',
    description: 'Most probable WRB Reference Soil Group per 250 m cell, with class names built into the GeoTIFF. For nutrients and pH, see Soil Nutrients & pH by District.',
    source: 'ISRIC SoilGrids v2.0',
    format: 'GeoTIFF',
    resolution: '250 m',
    icon: '🌾',
    tier: 'max',
    color: '#92400E', // warm earth — soil / agriculture
    epsg: 'EPSG:4326 (reprojected from Homolosine)',
    licence: 'CC BY 4.0',
    last_update: 'SoilGrids v2.0 · 2020',
    size_label: '~0.1–6 MB / country',
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
    color: '#14532D', // deep emerald — conservation / wildlife
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
    color: '#075985', // ocean blue — large-river network
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
    color: '#115E59', // dark teal — watershed basins
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
    format: 'GeoPackage',
    resolution: 'Vector polygons',
    icon: '🏞️',
    tier: 'max',
    color: '#1E40AF', // royal lake blue
    epsg: 'EPSG:4326',
    licence: 'HydroSHEDS (free with attribution)',
    last_update: 'HydroLAKES v1.0',
    size_label: '~1–8 MB / country',
  },
  {
    id: 18,
    name: 'Crop Production by District',
    category: 'Agriculture',
    description: 'Physical area, harvested area, production and yield for 46 crops in every district: modelled 2020 estimates that add up to national totals.',
    source: 'IFPRI MapSPAM (SPAM 2020 v2r2)',
    format: 'GeoPackage',
    resolution: 'District (ADM2)',
    icon: '🌽',
    tier: 'pro',
    color: '#4D7C0F',
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0',
    last_update: 'SPAM 2020 v2r2 · 2024',
    size_label: '~0.3–9 MB / country',
  },
  {
    id: 19,
    name: 'Tree Cover Loss by District',
    category: 'Environment & Climate',
    description: 'Tree cover in 2000 and hectares lost every year 2001–2025, per district. Tree cover counts plantations as well as natural forest.',
    source: 'UMD / Google Global Forest Change v1.13',
    format: 'GeoPackage',
    resolution: 'District (ADM2), from 30 m',
    icon: '🌳',
    tier: 'pro',
    color: '#166534',
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0',
    last_update: 'GFC v1.13 · loss to 2025',
    size_label: '~0.3–9 MB / country',
  },
  {
    id: 20,
    name: 'Soil Nutrients & pH by District',
    category: 'Agriculture',
    description: 'Topsoil (0–20 cm) nitrogen, phosphorus, potassium, pH, organic carbon, eCEC and bulk density, averaged per district from 30 m modelled maps.',
    source: 'iSDAsoil',
    format: 'GeoPackage',
    resolution: 'District (ADM2), from 30 m',
    icon: '🧪',
    tier: 'pro',
    color: '#92400E',
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0',
    last_update: 'iSDAsoil v1 · 2021',
    size_label: '~0.3–9 MB / country',
  },
  {
    id: 21,
    name: 'Mines, Minerals & Geology',
    category: 'Mining & Geology',
    description: 'Mines, deposits, exploration sites, power stations, pipelines, ports and railways, plus surface geology with full legend text.',
    source: 'U.S. Geological Survey',
    format: 'GeoPackage',
    resolution: 'Points & lines; geology 1:5M',
    icon: '⛏️',
    tier: 'pro',
    color: '#7C2D12',
    epsg: 'EPSG:4326',
    licence: 'Public domain (USGS)',
    last_update: 'Minerals 2018 reference · geology 1997',
    size_label: '~0.1–5 MB / country',
  },
  {
    id: 22,
    name: 'Solar & Wind Resource',
    category: 'Energy',
    description: 'Solar irradiation, PV potential, wind speed and power density at 100 m, plus a district screening table with population and distance to the grid.',
    source: 'Global Solar Atlas · Global Wind Atlas 4.0',
    format: 'GeoTIFF + GeoPackage',
    resolution: '250 m (solar PV 1 km) + district',
    icon: '☀️',
    tier: 'pro',
    color: '#B45309',
    epsg: 'EPSG:4326',
    licence: 'CC BY 4.0',
    last_update: 'Solar Atlas 2026 · Wind Atlas 4.0 (2025)',
    size_label: '~1–150 MB / country',
  },
]