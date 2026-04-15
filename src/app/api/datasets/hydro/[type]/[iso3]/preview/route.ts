import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'

/**
 * GET /api/datasets/hydro/[type]/[iso3]/preview
 * Returns a presigned URL for the lightweight GeoJSON preview file.
 * Public - no auth required. Used for map previews on the dataset page.
 *
 * Params:
 *   type  - 'rivers' | 'watersheds'
 *   iso3  - ISO 3166-1 alpha-3 country code (e.g. ZMB)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { type: string; iso3: string } }
) {
  const { type, iso3 } = params

  if (!['rivers', 'watersheds'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type. Use rivers or watersheds.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: fileRow, error } = await supabase
    .from('hydro_files')
    .select('preview_key, hydro_products!inner(type)')
    .eq('hydro_products.type', type)
    .eq('country_iso3', iso3.toUpperCase())
    .single()

  if (error || !fileRow || !fileRow.preview_key) {
    return NextResponse.json(
      { error: `No preview file found for ${type} / ${iso3.toUpperCase()}` },
      { status: 404 }
    )
  }

  try {
    const preview_url = await getDownloadUrl(fileRow.preview_key, 3600)
    return NextResponse.json({ preview_url })
  } catch (err) {
    console.error('R2 presign error:', err)
    return NextResponse.json({ error: 'Failed to generate preview URL' }, { status: 500 })
  }
}
