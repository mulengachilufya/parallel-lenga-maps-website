import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadTier } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export interface RainfallClimateLayer {
  id: number
  country: string
  layer_type: 'rainfall' | 'temperature' | 'drought_index'
  variable_name: string   // e.g. 'Annual Total', 'Monthly Means', 'SPI-12'
  year_start: number
  year_end: number
  r2_key: string
  file_size_mb: number
  file_format: string     // 'GeoTIFF (ZIP)'
  source: string          // 'CHIRPS v2.0', 'WorldClim v2.1', 'TerraClimate'
  resolution: string      // '0.05° (~5km)'
  units: string           // 'mm/year', '°C', 'dimensionless (SPI)'
  epsg: number            // 4326
  nodata_value: number    // -9999
  created_at: string
  download_url?: string
}

/**
 * GET /api/rainfall-climate
 * List rainfall / temperature / drought layers with optional filtering.
 * Query params:
 *   - country:    filter by country name (case-insensitive substring)
 *   - layerType:  'rainfall' | 'temperature' | 'drought_index'
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
    const layerType  = params.get('layerType')
    const includeUrl = params.get('includeUrl') !== 'false'

    let query = supabase.from('rainfall_climate_layers').select('*')

    if (country)   query = query.ilike('country', `%${country}%`)
    if (layerType) query = query.eq('layer_type', layerType)

    query = query
      .order('country',    { ascending: true })
      .order('layer_type', { ascending: true })
      .order('year_start', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch rainfall/climate layers', details: error.message },
        { status: 500 }
      )
    }

    let layers: RainfallClimateLayer[] = data || []

    // PER-LAYER-TYPE TIER GATE (4/8/12+ model):
    //   rainfall, temperature → BASIC tier (any active plan)
    //   drought_index         → PRO tier (pro / max / business)
    let basicAllowed: boolean | null = null
    let proAllowed:   boolean | null = null
    if (includeUrl && layers.length > 0) {
      const hasBasic = layers.some((l) => l.layer_type === 'rainfall' || l.layer_type === 'temperature')
      const hasPro   = layers.some((l) => l.layer_type === 'drought_index')
      if (hasBasic) basicAllowed = await callerCanDownloadTier('basic')
      if (hasPro)   proAllowed   = await callerCanDownloadTier('pro')

      layers = await Promise.all(
        layers.map(async (layer) => {
          const ok =
            layer.layer_type === 'drought_index' ? proAllowed   === true :
                                                   basicAllowed === true
          if (!ok) return layer
          try {
            return { ...layer, download_url: await getDownloadUrl(layer.r2_key, 3600) }
          } catch {
            return layer
          }
        })
      )
    }

    return NextResponse.json({ count: layers.length, layers })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
