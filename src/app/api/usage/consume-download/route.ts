/**
 * POST /api/usage/consume-download
 *
 * Once-off model: no trial, no download cap. This route now only does two
 * things - (1) confirm the caller has an active plan, (2) log a
 * download_events row (still powers the shared team dashboard: who pulled
 * what, where, CRS/format). The old trial-counter/cap-email logic is gone.
 *
 * Behaviour by user state:
 *   paid (individual / team)  -> records event, returns ok=true
 *   free / anonymous          -> ok=false, reason="no_access"
 *
 * Body (optional, for analytics):
 *   { dataset: string, country: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getUserState } from '@/lib/pricing'
import { datasetMeta } from '@/lib/teams'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: 'no_access', message: 'You must be signed in.' },
      { status: 401 },
    )
  }

  // Best-effort body parse - used only for logs/analytics, never trusted.
  let dataset = ''
  let country = ''
  try {
    const body = await req.json()
    if (typeof body?.dataset === 'string') dataset = body.dataset.slice(0, 60)
    if (typeof body?.country === 'string') country = body.country.slice(0, 60)
  } catch { /* empty body is fine */ }

  const { data: profile } = await service
    .from('profiles')
    .select('plan, plan_status, downloads_used, email, full_name, org_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ ok: false, reason: 'no_access' }, { status: 403 })
  }

  const state = getUserState(profile.plan, profile.plan_status)

  if (state === 'free') {
    return NextResponse.json(
      { ok: false, reason: 'no_access' },
      { status: 403 },
    )
  }

  // Every successful download leaves a download_events row - it powers the
  // shared team dashboard (who pulled what, where, CRS/format) and the
  // duplicate-download warning. Awaited but never allowed to block or fail
  // the actual download.
  const recordEvent = async () => {
    if (!dataset) return
    const meta = datasetMeta(dataset)
    try {
      const { error } = await service.from('download_events').insert({
        user_id:      user.id,
        org_id:       profile.org_id ?? null,
        user_name:    profile.full_name,
        user_email:   profile.email,
        dataset_slug: dataset,
        dataset_name: meta?.name ?? null,
        country:      country || null,
        epsg:         meta?.epsg ?? null,
        file_format:  meta?.formats ?? null,
      })
      if (error) console.error('[consume-download] event insert failed:', error)
    } catch (err) {
      console.error('[consume-download] event insert threw:', err)
    }
  }

  // No cap - we still bump the all-time downloads_used counter so the
  // dormant-subscriber nudge can tell who has actually used their plan.
  // Best-effort - a failed increment must not block the download.
  const total = (profile.downloads_used ?? 0) + 1
  service
    .from('profiles')
    .update({ downloads_used: total })
    .eq('id', user.id)
    .then(({ error }) => { if (error) console.error('[consume-download] counter failed:', error) })

  await recordEvent()

  return NextResponse.json({ ok: true, paid: true })
}