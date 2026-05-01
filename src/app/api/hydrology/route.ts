import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadTier } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export interface HydrologyLayer {
  id: number
  country: string
  layer_type: 'rivers' | 'lakes'
  r2_key: string
  file_size_mb: number
  file_format: string
  source: string
  created_at: string
  download_url?: string
}

/**
 * GET /api/hydrology
 * List hydrology layers with optional filtering
 * Query params:
 *   - country:   filter by country name (case-insensitive substring)
 *   - layerType: filter by layer type ("rivers" | "lakes")
 *   - includeUrl: include presigned download URL (default: true)
 */
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const params = request.nextUrl.searchParams
    const country   = params.get('country')
    const layerType = params.get('layerType')
    const includeUrl = params.get('includeUrl') !== 'false'

    let query = supabase.from('hydrology_layers').select('*')

    if (country)   query = query.ilike('country', `%${country}%`)
    if (layerType) query = query.eq('layer_type', layerType)

    query = query
      .order('country',    { ascending: true })
      .order('layer_type', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch hydrology layers', details: error.message },
        { status: 500 }
      )
    }

    let layers: HydrologyLayer[] = data || []

    // Gate the presigned URLs behind an active basic-or-better plan. Anyone
    // can browse the catalogue (country names, sizes, sources) but only
    // paying users get the download link.
    const allowed = includeUrl ? await callerCanDownloadTier('basic') : false
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
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
