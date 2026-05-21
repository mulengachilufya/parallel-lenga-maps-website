import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'

export const dynamic = 'force-dynamic'

// Note: this route only returns simplified GeoJSON *preview* URLs (used to
// render the catalogue map). Actual downloads happen via
// /api/datasets/hydro/[type]/[iso3], which has its own auth + tier check.
// Previews are intentionally public so anonymous browsers can see what the
// data looks like before signing up.

export interface HydroProduct {
  id: string
  name: string
  short_name: string
  type: 'rivers' | 'watersheds'
  source_org: string
  version: string
  description: string
  license: string
  attribution_text: string
  created_at: string
}

export interface HydroFile {
  id: string
  product_id: string
  country_iso3: string
  country_name: string
  file_key: string
  preview_key: string | null
  file_size_mb: number
  feature_count: number
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number } | null
  created_at: string
  preview_url?: string
}

export interface HydroProductWithFiles extends HydroProduct {
  files: HydroFile[]
}

/**
 * GET /api/datasets/hydro
 * Returns all hydro products with their per-country file metadata.
 * Public - no auth required.
 *
 * Query params:
 *   type         filter by 'rivers' or 'watersheds'
 *   iso3         filter by country ISO3 code
 *   includePreview  include presigned preview URL (default: true)
 */
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const params         = request.nextUrl.searchParams
    const typeFilter     = params.get('type')
    const iso3Filter     = params.get('iso3')
    const includePreview = params.get('includePreview') !== 'false'

    // Fetch products
    let productQuery = supabase.from('hydro_products').select('*')
    if (typeFilter) productQuery = productQuery.eq('type', typeFilter)

    const { data: products, error: productErr } = await productQuery.order('type')
    if (productErr) {
      return NextResponse.json(
        { error: 'Failed to fetch hydro products', details: productErr.message },
        { status: 500 }
      )
    }

    // Fetch files for those products
    const productIds = (products ?? []).map((p) => p.id)
    if (productIds.length === 0) {
      return NextResponse.json({ products: [] })
    }

    let fileQuery = supabase
      .from('hydro_files')
      .select('*')
      .in('product_id', productIds)

    if (iso3Filter) fileQuery = fileQuery.eq('country_iso3', iso3Filter.toUpperCase())

    const { data: files, error: fileErr } = await fileQuery
      .order('country_name', { ascending: true })

    if (fileErr) {
      return NextResponse.json(
        { error: 'Failed to fetch hydro files', details: fileErr.message },
        { status: 500 }
      )
    }

    let hydrFiles: HydroFile[] = files ?? []

    // Generate presigned preview URLs (public GeoJSON previews)
    if (includePreview && hydrFiles.length > 0) {
      hydrFiles = await Promise.all(
        hydrFiles.map(async (f) => {
          if (!f.preview_key) return f
          try {
            return { ...f, preview_url: await getDownloadUrl(f.preview_key, 3600) }
          } catch {
            return f
          }
        })
      )
    }

    // Group files under their product
    const filesByProduct = hydrFiles.reduce<Record<string, HydroFile[]>>((acc, f) => {
      if (!acc[f.product_id]) acc[f.product_id] = []
      acc[f.product_id].push(f)
      return acc
    }, {})

    const result: HydroProductWithFiles[] = (products ?? []).map((p) => ({
      ...p,
      files: filesByProduct[p.id] ?? [],
    }))

    return NextResponse.json({ products: result })
  } catch (err) {
    console.error('GET /api/datasets/hydro error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
