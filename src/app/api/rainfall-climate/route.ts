import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withDatasetDownloads } from '@/lib/dataset-access'

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

    // Retired rows (e.g. temperature_worldclim_retired) stay in the table for rollback only.
    let query = supabase.from('rainfall_climate_layers').select('*').not('layer_type', 'like', '%_retired')
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

    const layers = await withDatasetDownloads<RainfallClimateLayer>(data ?? [], includeUrl, (layer) => {
      if (layer.layer_type === 'drought_index') return 'drought-index'
      if (layer.layer_type === 'rainfall' || layer.layer_type === 'temperature') return layer.layer_type
      return undefined
    })

    return NextResponse.json({ count: layers.length, layers })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
