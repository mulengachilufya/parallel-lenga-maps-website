/**
 * POST /api/usage/consume-download
 *
 * Called by every dataset download click in the UI. Owns the trial
 * download counter — without this endpoint a trial user could open a
 * dataset section, grab all 54 presigned URLs from the network panel,
 * and download the whole catalogue without ever paying.
 *
 * Behaviour by user state:
 *   paid (starter / pro / max / enterprise)  → no-op, returns ok=true
 *   trial under cap                          → increments counter, returns ok=true + remaining
 *   trial at/over cap                        → ok=false, reason="trial_cap_reached"
 *   free / expired / anonymous               → ok=false, reason="no_access"
 *
 * Body (optional, for analytics):
 *   { dataset: string, country: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getUserState, TRIAL_DOWNLOAD_CAP } from '@/lib/pricing'

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

  // Best-effort body parse — used only for logs/analytics, never trusted.
  let dataset = ''
  let country = ''
  try {
    const body = await req.json()
    if (typeof body?.dataset === 'string') dataset = body.dataset.slice(0, 60)
    if (typeof body?.country === 'string') country = body.country.slice(0, 60)
  } catch { /* empty body is fine */ }

  const { data: profile } = await service
    .from('profiles')
    .select('plan, plan_status, plan_expires_at, trial_started_at, trial_downloads_used, downloads_used')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ ok: false, reason: 'no_access' }, { status: 403 })
  }

  // Expired-plan check first so an expired paid user falls through to
  // 'free', not back into 'trial' even if trial_started_at lingers.
  if (profile.plan_expires_at &&
      new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { ok: false, reason: 'plan_expired' },
      { status: 403 },
    )
  }

  const state = getUserState(
    profile.plan,
    profile.trial_started_at,
    profile.plan_status,
  )

  if (state === 'starter' || state === 'pro' ||
      state === 'max' || state === 'enterprise') {
    // Paid: no cap. We still bump the all-time downloads_used counter so the
    // dormant-subscriber nudge can tell who has actually used their plan.
    // Best-effort — a failed increment must not block the download.
    const total = (profile.downloads_used ?? 0) + 1
    service
      .from('profiles')
      .update({ downloads_used: total })
      .eq('id', user.id)
      .then(({ error }) => { if (error) console.error('[consume-download] paid counter failed:', error) })
    return NextResponse.json({ ok: true, paid: true })
  }

  if (state === 'free') {
    return NextResponse.json(
      { ok: false, reason: 'no_access' },
      { status: 403 },
    )
  }

  // state === 'free_trial'
  const used = profile.trial_downloads_used ?? 0
  if (used >= TRIAL_DOWNLOAD_CAP) {
    return NextResponse.json(
      {
        ok:         false,
        reason:     'trial_cap_reached',
        used,
        cap:        TRIAL_DOWNLOAD_CAP,
        message:    `Your trial includes ${TRIAL_DOWNLOAD_CAP} downloads. Subscribe to continue.`,
      },
      { status: 403 },
    )
  }

  const next = used + 1
  const { error: incErr } = await service
    .from('profiles')
    .update({
      trial_downloads_used: next,
      downloads_used: (profile.downloads_used ?? 0) + 1,
    })
    .eq('id', user.id)

  if (incErr) {
    console.error('[consume-download] increment failed:', incErr, { user: user.id, dataset, country })
    // Fail open: don't penalise the user for a transient DB error. The cap
    // still holds on the next click because the row hasn't moved.
    return NextResponse.json({ ok: true, used, remaining: TRIAL_DOWNLOAD_CAP - used })
  }

  return NextResponse.json({
    ok:        true,
    used:      next,
    remaining: TRIAL_DOWNLOAD_CAP - next,
    cap:       TRIAL_DOWNLOAD_CAP,
  })
}
