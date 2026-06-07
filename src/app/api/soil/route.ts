import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadDataset } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export interface SoilLayer {
  id:             number
  country:        string
  iso3:           string
  source:         string
  source_version: string | null
  resolution_m:   number
  r2_key:         string
  file_size_mb:   number
  file_format:    string
  epsg:           number
  created_at:     string
  download_url?:  string
}

/**
 * GET /api/soil
 * WRB soil classification layers (SoilGrids 250m). Max tier.
 *
 * Query params:
 *   - country, iso3, includeUrl
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

    let query = supabase.from('soil_layers').select('*')
    if (country) query = query.ilike('country', `%${country}%`)
    if (iso3)    query = query.eq('iso3', iso3.toUpperCase())
    query = query.order('country', { ascending: true })

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let layers: SoilLayer[] = data || []

    // Max-tier dataset per DATASET_MIN_TIER.
    const allowed = includeUrl ? await callerCanDownloadDataset('soil') : false
    if (allowed && layers.length > 0) {
      layers = await Promise.all(
        layers.map(async (l) => {
          try { return { ...l, download_url: await getDownloadUrl(l.r2_key, 3600) } }
          catch { return l }
        }),
      )
    }

    return NextResponse.json({ count: layers.length, layers })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
