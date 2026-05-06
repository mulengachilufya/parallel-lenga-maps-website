import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

// IMPORTANT: this MUST be createBrowserClient (cookie-backed), not the raw
// createClient from `@supabase/supabase-js` (localStorage-backed). The plain
// client puts the session in localStorage where server route handlers cannot
// see it — every authenticated POST (manual payment, admin, etc.) returns
// 401 even when the user is signed in. createBrowserClient writes the
// session into the same cookies that `createServerSupabase()` reads.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

export type AccountType = 'student' | 'professional' | 'business'
export type PlanTier = 'basic' | 'pro' | 'max'

// plan_status is independent of plan:
//   - 'free'    : user has an account but has not paid for any plan yet (default)
//   - 'pending' : user submitted manual payment, awaiting admin verification
//   - 'active'  : admin verified payment — their `plan` field grants download access
// Only 'active' lets a user actually download. 'plan' alone means nothing without 'active'.
export type PlanStatus = 'free' | 'pending' | 'active'

export type UserProfile = {
  id: string
  email: string
  account_type: AccountType
  // null = user has not picked / paid for any plan yet. Brand-new signups
  // start in this state. Only set to a tier value once admin verifies
  // payment via /api/admin/payments/verify.
  plan: PlanTier | null
  plan_status: PlanStatus
  // When the current paid period ends. null = never set (pre-migration row
  // or comped/lifetime account). In the future (> now) = active.
  // In the past (<= now) = expired — gate treats them as if they never paid.
  plan_expires_at: string | null
  created_at: string
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
 *   Plan basic → can access tier=basic only
 *   Plan pro   → can access tier=basic and tier=pro
 *   Plan max   → can access everything
 *   Business (any sub-plan) → full access (= max-equivalent), regardless of
 *     whether they're on Business basic ($75) or Business On-site ($225).
 *
 * Use these helpers EVERYWHERE access is decided. Never inline `plan ===
 * 'basic'`-style checks: those silently break Business basic users (who
 * should have full data access despite their plan column being 'basic').
 */
export type DatasetTier = 'basic' | 'pro' | 'max'

const _planRanks: Record<PlanTier, number> = { basic: 1, pro: 2, max: 3 }
const _tierRanks: Record<DatasetTier, number> = { basic: 1, pro: 2, max: 3 }

/** Numeric "level" the user has unlocked. 0 = none, 1 = basic, 2 = pro, 3 = max/all. */
export function planLevel(
  plan: PlanTier | null | undefined,
  accountType: AccountType,
): number {
  if (!plan) return 0
  if (accountType === 'business') return 3 // business at any plan = full access
  return _planRanks[plan] ?? 0
}

/** Can a user with this (plan, account_type) download a file of `datasetTier`? */
export function canAccessDatasetTier(
  plan: PlanTier | null | undefined,
  accountType: AccountType,
  datasetTier: DatasetTier,
): boolean {
  return planLevel(plan, accountType) >= _tierRanks[datasetTier]
}

/**
 * Back-compat shim. The old "hasFullDatasetAccess" answered the question
 * "does this user unlock pro+ datasets?". Some call sites still want that
 * boolean. We keep the function signature so existing components compile.
 * For new code prefer canAccessDatasetTier(plan, accountType, 'max').
 */
export function hasFullDatasetAccess(
  plan: PlanTier | null | undefined,
  accountType: AccountType,
): boolean {
  return canAccessDatasetTier(plan, accountType, 'pro')
}

export interface PlanPrice {
  zmw?: number
  usd: number
}

export const PLAN_PRICING: Record<AccountType, Partial<Record<PlanTier, PlanPrice>>> = {
  student: {
    basic: { zmw: 25,  usd: 1  },
    pro:   { zmw: 75,  usd: 4  },
    max:   { zmw: 200, usd: 10 },
  },
  professional: {
    basic: { zmw: 50,  usd: 3  },
    pro:   { zmw: 100, usd: 7  },
    max:   { zmw: 300, usd: 15 },
  },
  business: {
    // Two business sub-tiers (each includes 3 team seats):
    //   basic ($75) — manual dashboard access, no API
    //   pro   ($225) — adds REST API + up to 2 on-site visits/year (client
    //                  covers travel + expenses). Up from the prior $60
    //                  business price now that the API is real.
    basic: { usd: 75  },
    pro:   { usd: 225 },
  },
}

export function formatPrice(accountType: AccountType, plan: PlanTier): string {
  const price = PLAN_PRICING[accountType]?.[plan]
  if (!price) return '—'
  if (price.zmw) return `K${price.zmw}`
  return `$${price.usd}`
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
    tier: 'basic',
    color: '#1E5F8E',
  },

  {
    id: 3,
    name: 'River Networks',
    category: 'Water & Hydrology',
    description: 'Major river systems and tributaries clipped per country across all 54 African nations',
    source: 'HydroSHEDS / FAO',
    format: 'ZIP (Shapefile)',
    resolution: '90m hydrological',
    icon: '🌊',
    tier: 'basic',
    color: '#0ea5e9',
  },
  {
    id: 4,
    name: 'Land Use / Land Cover',
    category: 'Environment & Climate',
    description: 'Multi-class land cover classification: forest, cropland, urban, water, grassland',
    source: 'ESA WorldCover / GlobeLand30',
    format: 'GeoTIFF',
    resolution: '10m – 30m',
    icon: '🌿',
    tier: 'pro',
    color: '#16a34a',
  },
  {
    id: 5,
    name: 'Drought Index (SPI-12)',
    category: 'Environment & Climate',
    description: 'Standardized Precipitation Index (SPI-12) for long-term drought monitoring across Africa',
    source: 'CHIRPS-derived SPI',
    format: 'GeoTIFF (ZIP)',
    resolution: '0.05° (~5km)',
    icon: '🔥',
    tier: 'pro',
    color: '#ea580c',
  },
  {
    id: 15,
    name: 'Rainfall Data',
    category: 'Environment & Climate',
    description: 'Mean annual rainfall totals derived from CHIRPS v2.0 for all 54 African nations',
    source: 'CHIRPS v2.0',
    format: 'GeoTIFF (ZIP)',
    resolution: '0.05° (~5km)',
    icon: '🌧️',
    tier: 'basic',
    color: '#2563eb',
  },
  {
    id: 16,
    name: 'Temperature Data',
    category: 'Environment & Climate',
    description: 'Monthly mean temperature climatology (1970–2000) from WorldClim v2.1',
    source: 'WorldClim v2.1',
    format: 'GeoTIFF (ZIP)',
    resolution: '2.5 arc-min (~5km)',
    icon: '🌡️',
    tier: 'basic',
    color: '#dc2626',
  },
  {
    id: 6,
    name: 'Groundwater Aquifers',
    category: 'Groundwater & Hydrogeology',
    description: 'Transboundary aquifer system polygons across Africa - authoritative names, country codes, and boundary geometries for aquifers crossing international borders. Sourced from IGRAC GGIS.',
    source: 'WHYMAP/BGR-UNESCO + IGRAC GGIS',
    format: 'GeoPackage',
    resolution: '1:1,000,000 – 1:5,000,000',
    icon: '💧',
    tier: 'max',
    color: '#0369a1',
  },
  {
    id: 7,
    name: 'Vegetation & NDVI',
    category: 'Environment & Climate',
    description: 'NDVI time series, vegetation health indices, and biomass estimation layers',
    source: 'MODIS / Landsat',
    format: 'GeoTIFF, HDF',
    resolution: '250m – 30m',
    icon: '🌱',
    tier: 'max',
    color: '#15803d',
  },
  {
    id: 8,
    name: 'Population & Settlements',
    category: 'Socioeconomic',
    description: 'Subnational population counts at ADM1/ADM2 level for all 54 African countries — figures from each country\'s latest official census or national projection, paired with authoritative boundaries.',
    source: 'HDX COD-PS (UN OCHA)',
    format: 'Shapefile (ZIP)',
    resolution: 'ADM1 / ADM2',
    icon: '🏘️',
    tier: 'max',
    color: '#dc2626',
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
    tier: 'max',
    color: '#ea580c',
  },
  {
    id: 10,
    name: 'Wetlands & Floodplains',
    category: 'Water & Hydrology',
    description: 'Wetland extent, flood-prone zones, and seasonal inundation mapping',
    source: 'GlobWetland / JRC',
    format: 'GeoTIFF, Shapefile',
    resolution: '30m – 100m',
    icon: '🦆',
    tier: 'max',
    color: '#0891b2',
  },
  {
    id: 11,
    name: 'Soil Classification',
    category: 'Agriculture',
    description: 'Soil type, texture, organic carbon, pH, and nutrient content layers',
    source: 'ISRIC SoilGrids / FAO',
    format: 'GeoTIFF, NetCDF',
    resolution: '250m',
    icon: '🌾',
    tier: 'max',
    color: '#a16207',
  },
  {
    id: 12,
    name: 'Protected Areas & Wildlife',
    category: 'Conservation',
    description: 'National parks, game reserves, conservancies, forest reserves, marine protected areas, and other designated conservation zones — extracted from OpenStreetMap (boundary=protected_area, leisure=nature_reserve) and clipped per country across all 54 African nations.',
    source: 'OpenStreetMap contributors',
    format: 'Shapefile (ZIP)',
    resolution: 'Vector',
    icon: '🐘',
    tier: 'max',
    color: '#166534',
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
    name: 'HydroRIVERS - River Networks',
    category: 'Water & Hydrology',
    description: 'Full African river network at 15 arc-second resolution with Strahler order, discharge, and length. Per-country GeoPackage files clipped from HydroRIVERS v10.',
    source: 'WWF / HydroSHEDS',
    format: 'GeoPackage, GeoJSON',
    resolution: '15 arc-second (~500 m)',
    icon: '🌊',
    tier: 'basic',
    color: '#0ea5e9',
  },
  {
    id: 14,
    name: 'HydroBASINS - Watershed Boundaries',
    category: 'Water & Hydrology',
    description: 'Level 6 watershed polygon delineations for all African countries averaging 2,000–10,000 km² per basin. Per-country GeoPackage files from HydroBASINS v1c.',
    source: 'WWF / HydroSHEDS',
    format: 'GeoPackage, GeoJSON',
    resolution: 'Level 6 (~2,000–10,000 km²)',
    icon: '🗺️',
    tier: 'pro',
    color: '#0d9488',
  },
  {
    id: 17,
    name: 'Lakes',
    category: 'Water & Hydrology',
    description: 'Per-country lake polygons across Africa, derived from the HydroLAKES global database. Includes natural lakes and major reservoirs.',
    source: 'HydroLAKES',
    format: 'ZIP (Shapefile)',
    resolution: 'Vector polygons',
    icon: '🏞️',
    tier: 'pro',
    color: '#0ea5e9',
  },
]
