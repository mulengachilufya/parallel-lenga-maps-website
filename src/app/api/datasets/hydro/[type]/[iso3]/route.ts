import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { getDownloadUrl } from '@/lib/r2'

/**
 * GET /api/datasets/hydro/[type]/[iso3]
 * Returns file metadata + presigned R2 download URL (1-hour expiry).
 * Requires auth. Checks tier vs file size (basic: < 100 MB, pro: unlimited).
 * Logs successful downloads to hydro_downloads.
 *
 * Params:
 *   type  - 'rivers' | 'watersheds'
 *   iso3  - ISO 3166-1 alpha-3 country code (e.g. ZMB)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { type: string; iso3: string } }
) {
  const { type, iso3 } = params

  if (!['rivers', 'watersheds'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type. Use rivers or watersheds.' }, { status: 400 })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  const { data: { user } } = token
    ? await authClient.auth.getUser(token)
    : { data: { user: null } }
  const session = user ? { user } : null

  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const userPlan: string = user?.user_metadata?.plan ?? 'basic'

  // ── Fetch file metadata ───────────────────────────────────────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: fileRow, error } = await supabase
    .from('hydro_files')
    .select('*, hydro_products!inner(type)')
    .eq('hydro_products.type', type)
    .eq('country_iso3', iso3.toUpperCase())
    .single()

  if (error || !fileRow) {
    return NextResponse.json(
      { error: `No ${type} file found for ${iso3.toUpperCase()}` },
      { status: 404 }
    )
  }

  // ── Tier check ────────────────────────────────────────────────────────────
  // Basic users capped at 100 MB per file; Pro and Max have no size cap.
  const sizeMb: number = fileRow.file_size_mb ?? 0
  if (userPlan === 'basic' && sizeMb >= 100) {
    return NextResponse.json(
      {
        error: 'File size exceeds Basic plan limit (100 MB). Upgrade to Pro for unlimited downloads.',
        file_size_mb: sizeMb,
        upgrade_url: '/pricing',
      },
      { status: 403 }
    )
  }

  // ── Generate presigned download URL ───────────────────────────────────────
  let download_url: string
  try {
    download_url = await getDownloadUrl(fileRow.file_key, 3600)
  } catch (err) {
    console.error('R2 presign error:', err)
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }

  // ── Log download ──────────────────────────────────────────────────────────
  await supabase.from('hydro_downloads').insert({
    user_id: user?.id,
    file_id: fileRow.id,
    tier:    userPlan,
  })

  return NextResponse.json({
    file: {
      id:            fileRow.id,
      country_iso3:  fileRow.country_iso3,
      country_name:  fileRow.country_name,
      file_size_mb:  fileRow.file_size_mb,
      feature_count: fileRow.feature_count,
      bbox:          fileRow.bbox,
    },
    download_url,
  })
}
