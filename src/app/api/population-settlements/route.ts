import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadTier } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export interface PopulationSettlementsLayer {
  id: number
  country: string
  iso3: string
  admin_level: 'ADM1' | 'ADM2'
  ref_year: number
  total_population: number
  feature_count: number
  r2_key: string
  file_size_mb: number
  file_format: string
  source: string
  hdx_url: string | null
  epsg: number
  created_at: string
  download_url?: string
}

/**
 * GET /api/population-settlements
 * Query params:
 *   - country:    case-insensitive substring filter on country name
 *   - iso3:       exact match on ISO-3 country code
 *   - includeUrl: include presigned download URL (default: true)
 */
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const params = request.nextUrl.searchParams
    const country    = params.get('country')
    const iso3       = params.get('iso3')
    const includeUrl = params.get('includeUrl') !== 'false'

    let query = supabase.from('population_settlements_layers').select('*')
    if (country) query = query.ilike('country', `%${country}%`)
    if (iso3)    query = query.eq('iso3', iso3.toUpperCase())
    query = query.order('country', { ascending: true })

    const { data, error } = await query
    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch population layers', details: error.message },
        { status: 500 }
      )
    }

    let layers: PopulationSettlementsLayer[] = data || []

    // Population & Settlements is a Pro-tier dataset — only Pro and Max
    // plans get download URLs.
    const allowed = includeUrl ? await callerCanDownloadTier('pro') : false
    if (allowed && layers.length > 0) {
      layers = await Promise.all(
        layers.map(async (layer) => {
          try {
            return { ...layer, download_url: await getDownloadUrl(layer.r2_key, 3600) }
          } catch {
            return layer
          }
        })
      )
    }

    return NextResponse.json({ count: layers.length, layers })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
