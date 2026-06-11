/**
 * POST /api/account/init-profile
 *
 * Run once right after signup (and again after email confirmation).
 * Reads user_metadata and writes plan + trial_started_at + full_name
 * into the profiles row.
 *
 * Safety:
 *   - Never touches plan_status or plan_expires_at — only admin verify does that.
 *   - Setting plan here is safe: download gate still requires plan_status='active'.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { sendEmail, welcomeEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const VALID_PLANS = new Set(['starter', 'pro', 'max', 'enterprise'])

export async function POST() {
  const cookieClient = await createServerSupabase()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const metaPlan           = String(user.user_metadata?.plan ?? '').trim()
  const metaTrialStartedAt = user.user_metadata?.trial_started_at as string | undefined
  const metaFullName       = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim().slice(0, 200)
    : null

  // Only accept valid new plan slugs — no account_type, no old slugs
  const plan = VALID_PLANS.has(metaPlan) ? metaPlan : null

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: existing } = await admin
    .from('profiles')
    .select('id, plan_status, plan_expires_at, trial_started_at, welcome_email_sent_at')
    .eq('id', user.id)
    .maybeSingle()

  const updateRow: Record<string, unknown> = {
    id: user.id,
    // account_type removed entirely
  }

  if (plan) updateRow.plan = plan
  if (metaFullName) updateRow.full_name = metaFullName

  // Set trial_started_at — use existing value if already set, otherwise
  // use what came from metadata, otherwise set to now for new signups
  if (!existing?.trial_started_at) {
    updateRow.trial_started_at = metaTrialStartedAt ?? new Date().toISOString()
  }

  // Brand-new row — seed defaults
  if (!existing) {
    updateRow.plan_status     = 'free'
    updateRow.plan_expires_at = null
    if (!plan) updateRow.plan = null
  }

  const { error } = await admin
    .from('profiles')
    .upsert(updateRow, { onConflict: 'id' })

  if (error) {
    console.error('[init-profile] upsert failed:', error)
    return NextResponse.json({ error: 'profile_init_failed' }, { status: 500 })
  }

  // Welcome email — fire exactly once per BRAND-NEW account.
  //
  // SAFETY: gated on TWO conditions so it can never blast existing users:
  //   1. welcome_email_sent_at is null (not already welcomed), and
  //   2. the auth account was created in the last hour (genuinely new).
  // The created_at check is the hard guard: init-profile can be reached by
  // paths other than fresh signup (e.g. the dashboard self-heal), and an
  // old account must never receive a "welcome". A missing/!fresh created_at
  // fails safe (no send). No backfill migration required.
  const accountAgeMs  = Date.now() - new Date(user.created_at ?? 0).getTime()
  const isFreshAccount = accountAgeMs >= 0 && accountAgeMs < 60 * 60 * 1000
  if (!existing?.welcome_email_sent_at && user.email && isFreshAccount) {
    const sent = await sendEmail(
      welcomeEmail(user.email, (updateRow.full_name as string) ?? metaFullName),
    )
    console.log('[init-profile] welcome email', { to: user.email, sent })
    if (sent) {
      await admin
        .from('profiles')
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq('id', user.id)
    }
  }

  return NextResponse.json({
    ok:          true,
    plan,
    plan_status: existing?.plan_status ?? 'free',
  })
}