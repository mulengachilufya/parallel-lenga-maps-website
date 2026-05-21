import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadTier } from '@/lib/dataset-access'

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
 * Tier gate: Max-tier dataset (in the 4/8/12+ model). List metadata is
 * public so anyone can browse the catalogue, but `download_url` is only
 * included when the caller has an active plan that unlocks max-tier
 * datasets (plan='max', or any active Business plan).
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

    // Max-tier dataset — plan='max' or any active Business plan only.
    const allowed = includeUrl ? await callerCanDownloadTier('max') : false
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
