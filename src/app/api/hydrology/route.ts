import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadDataset } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export interface HydrologyLayer {
  id: number
  country: string
  layer_type: 'rivers' | 'lakes' | 'watersheds'
  r2_key: string
  file_size_mb: number
  file_format: string
  source: string
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

    let query = supabase.from('hydrology_layers').select('*')
    if (country)   query = query.ilike('country', `%${country}%`)
    if (layerType) query = query.eq('layer_type', layerType)
    query = query
      .order('country',    { ascending: true })
      .order('layer_type', { ascending: true })

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch hydrology layers', details: error.message }, { status: 500 })
    }

    let layers: HydrologyLayer[] = data || []

    // Tier gate per new model:
    //   rivers     → pro tier
    //   lakes      → max tier
    //   watersheds → pro tier (Watersheds & Catchments)
    if (includeUrl && layers.length > 0) {
      const [riversAllowed, maxAllowed] = await Promise.all([
        callerCanDownloadDataset('rivers'),
        callerCanDownloadDataset('lakes'),
      ])
      const watershedsAllowed = await callerCanDownloadDataset('watersheds')

      layers = await Promise.all(
        layers.map(async (layer) => {
          const ok =
            layer.layer_type === 'rivers'     ? riversAllowed :
            layer.layer_type === 'lakes'      ? maxAllowed :
            layer.layer_type === 'watersheds' ? watershedsAllowed :
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