import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'

export interface AquiferLayer {
  id: number
  country: string
  layer_type: 'aquifer'
  r2_key: string
  file_size_mb: number
  file_format: string
  source: string
  feature_count: number
  conflict_count: number
  created_at: string
  download_url?: string
}

/**
 * GET /api/aquifer
 * List aquifer dataset layers with optional country filter.
 * Query params:
 *   - country:    filter by country name (case-insensitive substring)
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
    const includeUrl = params.get('includeUrl') !== 'false'

    let query = supabase.from('aquifer_layers').select('*')

    if (country) query = query.ilike('country', `%${country}%`)

    query = query.order('country', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch aquifer layers', details: error.message },
        { status: 500 }
      )
    }

    let layers: AquiferLayer[] = data || []

    if (includeUrl && layers.length > 0) {
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
