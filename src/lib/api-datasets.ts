/**
 * Dataset registry for the public REST API.
 *
 * Each dataset on the platform sits in its own Postgres table with its own
 * column shape (rivers / aquifer / population each evolved separately). The
 * dashboard knows about that — but API consumers shouldn't have to. This
 * registry projects every table into a single `ApiFile` shape so a caller
 * can do `GET /v1/datasets/<slug>` and get a uniform response.
 *
 * Adding a new dataset:
 *   1. Add an entry to DATASETS below pointing at the source table
 *   2. Map its country and r2_key columns
 *   3. (optional) override the layer_type filter if the table is shared
 *      between multiple slugs (rivers/lakes share `hydrology_layers`)
 *
 * Country filtering:
 *   We accept ?country=ZM (ISO-3) OR ?country=Zambia and try both. Most
 *   tables key on full country name; population_settlements_layers also
 *   has an iso3 column we try first.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getDownloadUrl } from './r2'

export interface ApiFile {
  /** ISO-3 country code where derivable, else uppercase first 3 letters. */
  country_iso3:  string
  /** Full country name as stored in the DB. */
  country_name:  string
  /** R2 object key — the source of truth for the underlying file. */
  r2_key:        string
  /** Approx file size in megabytes. */
  file_size_mb:  number
  /** Free-form format label, e.g. "Shapefile (ZIP)", "GeoTIFF (ZIP)". */
  file_format:   string
  /** Original data source / attribution. */
  source:        string
  /** Optional dataset-specific metadata (year, admin_level, units, …). */
  meta?:         Record<string, unknown>
}

export interface ApiDatasetSummary {
  id:            string
  name:          string
  description:   string
  category:      string
  source:        string
  file_count:    number
}

interface DatasetSpec {
  id:           string
  name:         string
  description:  string
  category:     string
  table:        string
  /** Some tables are shared (hydrology_layers has rivers + lakes). */
  layer_type?:  string
  /** Default attribution shown if the row's `source` is missing. */
  source:       string
  /** Convert one DB row to an ApiFile. */
  toFile:       (row: Record<string, unknown>) => ApiFile
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Best-effort country-name → ISO-3. We only have a handful of African
 *  countries with known mappings; for the rest we just return the first 3
 *  letters uppercased so the field is always present. */
const COUNTRY_TO_ISO3: Record<string, string> = {
  'Algeria': 'DZA', 'Angola': 'AGO', 'Benin': 'BEN', 'Botswana': 'BWA',
  'Burkina Faso': 'BFA', 'Burundi': 'BDI', 'Cabo Verde': 'CPV',
  'Cameroon': 'CMR', 'Central African Republic': 'CAF', 'Chad': 'TCD',
  'Comoros': 'COM', 'Congo': 'COG', 'Democratic Republic of the Congo': 'COD',
  'Djibouti': 'DJI', 'Egypt': 'EGY', 'Equatorial Guinea': 'GNQ',
  'Eritrea': 'ERI', 'Eswatini': 'SWZ', 'Ethiopia': 'ETH', 'Gabon': 'GAB',
  'Gambia': 'GMB', 'Ghana': 'GHA', 'Guinea': 'GIN', 'Guinea-Bissau': 'GNB',
  'Ivory Coast': 'CIV', "Cote d'Ivoire": 'CIV', 'Kenya': 'KEN',
  'Lesotho': 'LSO', 'Liberia': 'LBR', 'Libya': 'LBY', 'Madagascar': 'MDG',
  'Malawi': 'MWI', 'Mali': 'MLI', 'Mauritania': 'MRT', 'Mauritius': 'MUS',
  'Morocco': 'MAR', 'Mozambique': 'MOZ', 'Namibia': 'NAM', 'Niger': 'NER',
  'Nigeria': 'NGA', 'Rwanda': 'RWA', 'Sao Tome and Principe': 'STP',
  'Senegal': 'SEN', 'Seychelles': 'SYC', 'Sierra Leone': 'SLE',
  'Somalia': 'SOM', 'South Africa': 'ZAF', 'South Sudan': 'SSD',
  'Sudan': 'SDN', 'Tanzania': 'TZA', 'Togo': 'TGO', 'Tunisia': 'TUN',
  'Uganda': 'UGA', 'Zambia': 'ZMB', 'Zimbabwe': 'ZWE',
}

function iso3For(country: string): string {
  const m = COUNTRY_TO_ISO3[country]
  if (m) return m
  // Some tables already store ISO-3; if it's already 3 chars uppercase, pass through.
  if (country.length === 3 && country.toUpperCase() === country) return country
  return country.slice(0, 3).toUpperCase()
}

// ── Dataset registry ──────────────────────────────────────────────────────

export const DATASETS: DatasetSpec[] = [
  {
    id:          'rivers',
    name:        'River networks',
    description: 'HydroSHEDS / FAO river networks per African country.',
    category:    'hydrology',
    table:       'hydrology_layers',
    layer_type:  'rivers',
    source:      'HydroSHEDS / FAO',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: iso3For(String(r.country)),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.file_format ?? 'ZIP (Shapefile)'),
      source:       String(r.source ?? 'HydroSHEDS / FAO'),
    }),
  },
  {
    id:          'lakes',
    name:        'Lakes',
    description: 'HydroLAKES per African country.',
    category:    'hydrology',
    table:       'hydrology_layers',
    layer_type:  'lakes',
    source:      'HydroLAKES',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: iso3For(String(r.country)),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.file_format ?? 'ZIP (Shapefile)'),
      source:       String(r.source ?? 'HydroLAKES'),
    }),
  },
  {
    id:          'aquifer',
    name:        'Groundwater aquifers',
    description: 'IGRAC GGIS groundwater aquifers per African country.',
    category:    'hydrology',
    table:       'aquifer_layers',
    source:      'IGRAC GGIS',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: iso3For(String(r.country)),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.file_format ?? 'GeoPackage'),
      source:       String(r.source ?? 'IGRAC GGIS'),
      meta:         { feature_count: r.feature_count },
    }),
  },
  {
    id:          'lulc',
    name:        'Land use / land cover',
    description: 'ESA WorldCover 2021 v200 land-use raster per African country (10 m resolution).',
    category:    'environment',
    table:       'lulc_layers',
    source:      'ESA WorldCover 2021 v200',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: iso3For(String(r.country)),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.file_format ?? 'GeoTIFF'),
      source:       String(r.source ?? 'ESA WorldCover 2021 v200'),
      meta:         { resolution: r.resolution, epsg: r.epsg },
    }),
  },
  {
    id:          'rainfall',
    name:        'Rainfall',
    description: 'CHIRPS v2.0 monthly / annual rainfall rasters per African country.',
    category:    'climate',
    table:       'rainfall_climate_layers',
    layer_type:  'rainfall',
    source:      'CHIRPS v2.0',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: iso3For(String(r.country)),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.file_format ?? 'GeoTIFF (ZIP)'),
      source:       String(r.source ?? 'CHIRPS v2.0'),
      meta: {
        variable_name: r.variable_name,
        year_start:    r.year_start,
        year_end:      r.year_end,
        units:         r.units,
        resolution:    r.resolution,
      },
    }),
  },
  {
    id:          'temperature',
    name:        'Temperature',
    description: 'WorldClim v2.1 monthly / annual temperature rasters per African country.',
    category:    'climate',
    table:       'rainfall_climate_layers',
    layer_type:  'temperature',
    source:      'WorldClim v2.1',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: iso3For(String(r.country)),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.file_format ?? 'GeoTIFF (ZIP)'),
      source:       String(r.source ?? 'WorldClim v2.1'),
      meta: {
        variable_name: r.variable_name,
        year_start:    r.year_start,
        year_end:      r.year_end,
        units:         r.units,
        resolution:    r.resolution,
      },
    }),
  },
  {
    id:          'drought-index',
    name:        'Drought index (SPI-12)',
    description: 'CHIRPS-derived 12-month Standardised Precipitation Index per African country.',
    category:    'climate',
    table:       'rainfall_climate_layers',
    layer_type:  'drought_index',
    source:      'CHIRPS-derived SPI',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: iso3For(String(r.country)),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.file_format ?? 'GeoTIFF (ZIP)'),
      source:       String(r.source ?? 'CHIRPS-derived SPI'),
      meta: {
        year_start:    r.year_start,
        year_end:      r.year_end,
        units:         r.units,
        resolution:    r.resolution,
      },
    }),
  },
  {
    id:          'population',
    name:        'Population & settlements',
    description: 'HDX COD-PS gridded population + admin geometries per African country.',
    category:    'demographics',
    table:       'population_settlements_layers',
    source:      'HDX COD-PS (UN OCHA + national census offices)',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: String(r.iso3 ?? iso3For(String(r.country))),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.file_format ?? 'Shapefile (ZIP)'),
      source:       String(r.source ?? 'HDX COD-PS'),
      meta: {
        admin_level:      r.admin_level,
        ref_year:         r.ref_year,
        total_population: r.total_population,
        feature_count:    r.feature_count,
        epsg:             r.epsg,
      },
    }),
  },
  {
    id:          'admin-boundaries',
    name:        'Administrative boundaries',
    description: 'GADM v4.1 administrative boundaries (admin levels 0–3) per African country.',
    category:    'demographics',
    table:       'admin_boundaries',
    source:      'GADM v4.1',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: String(r.country_code ?? iso3For(String(r.country))),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.geom_type ?? 'Shapefile (ZIP)'),
      source:       String(r.source ?? 'GADM v4.1'),
      meta:         { admin_level: r.admin_level },
    }),
  },
  {
    id:          'protected-areas',
    name:        'Protected areas & wildlife',
    description: 'WDPA-derived national parks, game reserves, Ramsar sites, marine protected areas, and other designated conservation areas per African country.',
    category:    'environment',
    table:       'protected_areas_layers',
    source:      'WDPA · UNEP-WCMC + IUCN · CC-BY 4.0',
    toFile: (r) => ({
      country_name: String(r.country),
      country_iso3: String(r.iso3 ?? iso3For(String(r.country))),
      r2_key:       String(r.r2_key),
      file_size_mb: Number(r.file_size_mb ?? 0),
      file_format:  String(r.file_format ?? 'Shapefile (ZIP)'),
      source:       String(r.source ?? 'WDPA · UNEP-WCMC + IUCN'),
      meta: {
        feature_count:       r.feature_count,
        total_area_km2:      r.total_area_km2,
        marine_area_km2:     r.marine_area_km2,
        designation_summary: r.designation_summary,
        source_version:      r.source_version,
        epsg:                r.epsg,
      },
    }),
  },
]

export function findDataset(id: string): DatasetSpec | undefined {
  return DATASETS.find((d) => d.id === id.toLowerCase())
}

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * List all files for a dataset, optionally filtered by country (name OR ISO-3).
 */
export async function listFilesForDataset(
  spec:        DatasetSpec,
  country?:    string | null,
): Promise<ApiFile[]> {
  const supabase = adminClient()
  let q = supabase.from(spec.table).select('*')
  if (spec.layer_type) q = q.eq('layer_type', spec.layer_type)

  if (country) {
    const trimmed = country.trim()
    // ISO-3 path: tables that have an `iso3` column (population) or
    // `country_code` (admin_boundaries) get exact-match. Everything else
    // we substring-match on country name as a fallback.
    if (/^[A-Za-z]{3}$/.test(trimmed)) {
      const upper = trimmed.toUpperCase()
      if (spec.table === 'population_settlements_layers') q = q.eq('iso3', upper)
      else if (spec.table === 'admin_boundaries')         q = q.eq('country_code', upper)
      else                                                q = q.ilike('country', `%${trimmed}%`)
    } else {
      q = q.ilike('country', `%${trimmed}%`)
    }
  }

  q = q.order('country', { ascending: true })

  const { data, error } = await q
  if (error) throw new Error(`Failed to list ${spec.id}: ${error.message}`)
  return (data ?? []).map(spec.toFile)
}

/** Sign every file in a list. Used by the bundle endpoint. */
export async function signAll(files: ApiFile[], expiresIn = 3600): Promise<Array<ApiFile & { download_url: string }>> {
  return Promise.all(
    files.map(async (f) => ({
      ...f,
      download_url: await getDownloadUrl(f.r2_key, expiresIn),
    })),
  )
}

/** Total file_size_mb across a list — used to bump egress quotas. */
export function totalBytes(files: ApiFile[]): number {
  return files.reduce((acc, f) => acc + Math.round(f.file_size_mb * 1024 * 1024), 0)
}

/** Public-shape summary list (no row leak). */
export async function summariseDatasets(): Promise<ApiDatasetSummary[]> {
  return Promise.all(DATASETS.map(async (spec) => {
    let count = 0
    try {
      const supabase = adminClient()
      let q = supabase.from(spec.table).select('id', { count: 'exact', head: true })
      if (spec.layer_type) q = q.eq('layer_type', spec.layer_type)
      const { count: c } = await q
      count = c ?? 0
    } catch {
      // table may not exist yet in some envs; fall back to 0.
    }
    return {
      id:          spec.id,
      name:        spec.name,
      description: spec.description,
      category:    spec.category,
      source:      spec.source,
      file_count:  count,
    }
  }))
}
