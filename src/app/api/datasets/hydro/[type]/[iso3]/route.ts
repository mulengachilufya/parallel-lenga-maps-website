import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadDataset } from '@/lib/dataset-access'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; iso3: string }> }
) {
  const { type, iso3 } = await params

  if (!['rivers', 'watersheds'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type. Use rivers or watersheds.' }, { status: 400 })
  }

  // Auth via Bearer token or cookie session
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const { data: { user } } = token
    ? await authClient.auth.getUser(token)
    : { data: { user: null } }

  let resolvedUser = user
  if (!resolvedUser) {
    const { createServerSupabase } = await import('@/lib/supabase-server')
    const cookieClient = await createServerSupabase()
    const { data: { user: cookieUser } } = await cookieClient.auth.getUser()
    resolvedUser = cookieUser
  }

  if (!resolvedUser) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_status, plan_expires_at, trial_started_at')
    .eq('id', resolvedUser.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.', upgrade_url: '/pricing' }, { status: 403 })
  }

  if (profile.plan_expires_at &&
      new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Your plan has expired.', upgrade_url: '/dashboard/payment' }, { status: 403 })
  }

  // Check tier access for this specific dataset
  // rivers → pro, watersheds → pro
  const slug = type === 'watersheds' ? 'watersheds' : 'rivers'
  const allowed = await callerCanDownloadDataset(slug as 'rivers' | 'watersheds')
  if (!allowed) {
    return NextResponse.json({ error: 'Plan upgrade required.', upgrade_url: '/pricing' }, { status: 403 })
  }

  const { data: fileRow, error } = await supabase
    .from('hydro_files')
    .select('*, hydro_products!inner(type)')
    .eq('hydro_products.type', type)
    .eq('country_iso3', iso3.toUpperCase())
    .single()

  if (error || !fileRow) {
    return NextResponse.json({ error: `No ${type} file found for ${iso3.toUpperCase()}` }, { status: 404 })
  }

  let download_url: string
  try {
    download_url = await getDownloadUrl(fileRow.file_key, 3600)
  } catch (err) {
    console.error('R2 presign error:', err)
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }

  await supabase.from('hydro_downloads').insert({
    user_id: resolvedUser.id,
    file_id: fileRow.id,
    tier:    profile.plan,
  })

  return NextResponse.json({
    file: {
      id:            fileRow.id,
      country_name:  fileRow.country_name,
      file_size_mb:  fileRow.file_size_mb,
      feature_count: fileRow.feature_count,
      bbox:          fileRow.bbox,
    },
    download_url,
  })
}
