import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadDataset } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export interface RainfallClimateLayer {
  id: number
  country: string
  layer_type: 'rainfall' | 'temperature' | 'drought_index'
  variable_name: string
  year_start: number
  year_end: number
  r2_key: string
  file_size_mb: number
  file_format: string
  source: string
  resolution: string
  units: string
  epsg: number
  nodata_value: number
  created_at: string
  download_url?: string
}

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const params     = request.nextUrl.searchParams
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
      return NextResponse.json({ error: 'Failed to fetch rainfall/climate layers', details: error.message }, { status: 500 })
    }

    let layers: RainfallClimateLayer[] = data || []

    // Tier gate per new model:
    //   rainfall    → starter tier
    //   temperature → max tier
    //   drought_index → starter tier
    if (includeUrl && layers.length > 0) {
      const [rainfallAllowed, tempAllowed, droughtAllowed] = await Promise.all([
        callerCanDownloadDataset('rainfall'),
        callerCanDownloadDataset('temperature'),
        callerCanDownloadDataset('drought-index'),
      ])

      layers = await Promise.all(
        layers.map(async (layer) => {
          const ok =
            layer.layer_type === 'rainfall'     ? rainfallAllowed :
            layer.layer_type === 'temperature'  ? tempAllowed :
            layer.layer_type === 'drought_index'? droughtAllowed :
            false
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
