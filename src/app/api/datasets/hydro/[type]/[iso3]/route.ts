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
  // Two acceptable session sources: a Bearer token (Authorization header)
  // OR a Supabase cookie session. The dashboard sends cookies; older clients
  // may still send tokens.
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  const { data: { user } } = token
    ? await authClient.auth.getUser(token)
    : { data: { user: null } }

  // Fallback to cookie-based session for browser callers (the dashboard).
  let resolvedUser = user
  if (!resolvedUser) {
    const { createServerSupabase } = await import('@/lib/supabase-server')
    const cookieClient = createServerSupabase()
    const { data: { user: cookieUser } } = await cookieClient.auth.getUser()
    resolvedUser = cookieUser
  }

  if (!resolvedUser) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  // ── Fetch file metadata ───────────────────────────────────────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Read plan from PROFILES (not user_metadata). user_metadata is set
  // client-side at signup and could lie about the user's actual paid tier.
  // profiles.plan is what the admin verify endpoint writes after a real
  // payment lands — that's the only number we can trust.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, account_type, plan_status, plan_expires_at')
    .eq('id', resolvedUser.id)
    .single()

  if (!profile || profile.plan_status !== 'active') {
    return NextResponse.json(
      { error: 'Active plan required.', upgrade_url: '/pricing' },
      { status: 403 }
    )
  }
  if (profile.plan_expires_at &&
      new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Your plan has expired.', upgrade_url: '/dashboard/payment' },
      { status: 403 }
    )
  }
  const userPlan = profile.plan as string
  const userAccountType = profile.account_type as string

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
  // Rivers + watersheds are Basic-tier datasets, so any active plan unlocks
  // them. The 100 MB per-file cap is a soft limit on Student/Professional
  // basic plans only — Business basic ($75) is sold as "Everything in Max"
  // so it gets uncapped downloads at the Basic plan level.
  const sizeMb: number = fileRow.file_size_mb ?? 0
  const isCappedBasic =
    userPlan === 'basic' && userAccountType !== 'business'
  if (isCappedBasic && sizeMb >= 100) {
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
    user_id: resolvedUser.id,
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
