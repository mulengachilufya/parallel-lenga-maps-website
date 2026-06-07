import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadDataset } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export interface ProtectedAreasLayer {
  id:                   number
  country:              string
  iso3:                 string
  feature_count:        number
  total_area_km2:       number
  marine_area_km2:      number | null
  designation_summary:  string | null
  source:               string
  source_version:       string
  r2_key:               string
  file_size_mb:         number
  file_format:          string
  epsg:                 number
  created_at:           string
  download_url?:        string
}

/**
 * GET /api/protected-areas
 * List protected-areas layers (one per country) with optional filtering.
 *
 * Query params:
 *   - country:    case-insensitive substring filter on country name
 *   - iso3:       exact ISO-3 match (e.g. ZMB)
 *   - includeUrl: include presigned download URL (default: true)
 *
 * Tier gate: Starter-tier dataset per DATASET_MIN_TIER. List metadata is
 * public so anyone can browse the catalogue; `download_url` is included
 * for any active plan (starter and above) or active free trial.
 *
 * History note: this route used to call callerCanDownloadTier('max'), which
 * silently broke every paying Starter user — they could see protected-areas
 * but never download. Now uses callerCanDownloadDataset('protected-areas')
 * so the gate matches the pricing page.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const params     = request.nextUrl.searchParams
    const country    = params.get('country')
    const iso3       = params.get('iso3')
    const includeUrl = params.get('includeUrl') !== 'false'

    let query = supabase.from('protected_areas_layers').select('*')
    if (country) query = query.ilike('country', `%${country}%`)
    if (iso3)    query = query.eq('iso3', iso3.toUpperCase())
    query = query.order('country', { ascending: true })

    const { data, error } = await query
    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch protected-areas layers', details: error.message },
        { status: 500 },
      )
    }

    let layers: ProtectedAreasLayer[] = data || []

    // Starter-tier dataset — any active paid plan or trial.
    const allowed = includeUrl ? await callerCanDownloadDataset('protected-areas') : false
    if (allowed && layers.length > 0) {
      layers = await Promise.all(
        layers.map(async (layer) => {
          try {
            return { ...layer, download_url: await getDownloadUrl(layer.r2_key, 3600) }
          } catch {
            return layer
          }
        }),
      )
    }

    return NextResponse.json({ count: layers.length, layers })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
