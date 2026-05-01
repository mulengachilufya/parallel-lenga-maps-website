import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadTier } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export interface LulcLayer {
  id: number
  country: string
  layer_type: 'lulc'
  r2_key: string
  file_size_mb: number
  file_format: string
  source: string
  resolution: string
  epsg: number
  created_at: string
  download_url?: string
  // PAM sidecar (.aux.xml) — holds the Raster Attribute Table (pixel value
  // → class name + colour). The .tif is meaningless without it: QGIS opens
  // it as opaque numeric pixels. Convention is `r2_key + ".aux.xml"`.
  sidecar_url?: string
}

/**
 * GET /api/lulc
 * List LULC layers with optional country filter.
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

    let query = supabase.from('lulc_layers').select('*')

    if (country) query = query.ilike('country', `%${country}%`)

    query = query.order('country', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch LULC layers', details: error.message },
        { status: 500 }
      )
    }

    let layers: LulcLayer[] = data || []

    // LULC is a Basic-tier dataset; gate the URLs behind any active plan.
    const allowed = includeUrl ? await callerCanDownloadTier('basic') : false
    if (allowed && layers.length > 0) {
      layers = await Promise.all(
        layers.map(async (layer) => {
          try {
            const [download_url, sidecar_url] = await Promise.all([
              getDownloadUrl(layer.r2_key, 3600),
              // Sidecar is non-fatal if absent — fall through to undefined.
              getDownloadUrl(`${layer.r2_key}.aux.xml`, 3600).catch(() => undefined),
            ])
            return { ...layer, download_url, sidecar_url }
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
