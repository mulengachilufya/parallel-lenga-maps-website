import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadDataset } from '@/lib/dataset-access'

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
  sidecar_url?: string
}

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const params     = request.nextUrl.searchParams
    const country    = params.get('country')
    const includeUrl = params.get('includeUrl') !== 'false'

    let query = supabase.from('lulc_layers').select('*')
    if (country) query = query.ilike('country', `%${country}%`)
    query = query.order('country', { ascending: true })

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch LULC layers', details: error.message }, { status: 500 })
    }

    let layers: LulcLayer[] = data || []

    // LULC is a Max-tier dataset in the new model
    const allowed = includeUrl ? await callerCanDownloadDataset('lulc') : false
    if (allowed && layers.length > 0) {
      layers = await Promise.all(
        layers.map(async (layer) => {
          try {
            const [download_url, sidecar_url] = await Promise.all([
              getDownloadUrl(layer.r2_key, 3600),
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
