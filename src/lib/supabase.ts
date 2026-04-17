import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type AccountType = 'student' | 'professional'
export type PlanTier = 'basic' | 'pro'

export type UserProfile = {
  id: string
  email: string
  account_type: AccountType
  plan: PlanTier
  created_at: string
}

/**
 * Pricing matrix in Zambian Kwacha (ZMW) per month.
 * Students get subsidised rates; professionals pay full commercial rates.
 */
export const PLAN_PRICING: Record<AccountType, Record<PlanTier, number>> = {
  student: { basic: 25, pro: 75 },
  professional: { basic: 50, pro: 100 },
}

export function formatPrice(accountType: AccountType, plan: PlanTier): string {
  return `K${PLAN_PRICING[accountType][plan]}`
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
  tier: 'basic' | 'pro'
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
    id: 2,
    name: 'Digital Elevation Model',
    category: 'Terrain & Topography',
    description: 'High-resolution DEM data covering African terrain with contours and hillshade',
    source: 'SRTM / ALOS PALSAR',
    format: 'GeoTIFF, ASCII Grid',
    resolution: '30m / 12.5m',
    icon: '⛰️',
    tier: 'basic',
    color: '#2a7ab5',
  },
  {
    id: 3,
    name: 'River Networks & Watersheds',
    category: 'Water & Hydrology',
    description: 'Major river systems, tributaries, lake boundaries and watershed delineations',
    source: 'HydroSHEDS / FAO',
    format: 'Shapefile, GeoJSON',
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
    tier: 'basic',
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
    tier: 'basic',
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
    tier: 'pro',
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
    tier: 'pro',
    color: '#15803d',
  },
  {
    id: 8,
    name: 'Population & Settlements',
    category: 'Socioeconomic',
    description: 'Gridded population density, urban extents, and informal settlement mapping',
    source: 'WorldPop / GPW',
    format: 'GeoTIFF, Shapefile',
    resolution: '100m – 1km',
    icon: '🏘️',
    tier: 'pro',
    color: '#dc2626',
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
    tier: 'pro',
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
    tier: 'pro',
    color: '#a16207',
  },
  {
    id: 12,
    name: 'Protected Areas & Wildlife',
    category: 'Conservation',
    description: 'National parks, game reserves, Ramsar sites, and wildlife corridors',
    source: 'WDPA / IUCN',
    format: 'Shapefile, GeoJSON',
    resolution: 'Vector',
    icon: '🐘',
    tier: 'pro',
    color: '#166534',
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
    tier: 'basic',
    color: '#0d9488',
  },
]
