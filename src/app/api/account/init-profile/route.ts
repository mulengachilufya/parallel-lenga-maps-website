/**
 * POST /api/account/init-profile
 *
 * Run once right after signup (and again after email confirmation).
 * Reads user_metadata and writes name / country / sector into the
 * profiles row.
 *
 * Safety:
 *   - Never touches plan or plan_status — only admin verify does that.
 *     user_metadata is editable by the user, so nothing access-related is
 *     read from it.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { sendEmail, welcomeEmail } from '@/lib/email'
import { isValidCountry } from '@/lib/countries'
import { isValidSector } from '@/lib/sectors'

export const dynamic = 'force-dynamic'

function metaString(v: unknown, max = 120): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

export async function POST() {
  const cookieClient = await createServerSupabase()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const metaFullName       = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim().slice(0, 200)
    : null
  const metaFirstName      = metaString(user.user_metadata?.first_name)
  const metaLastName       = metaString(user.user_metadata?.last_name)
  const metaCountry        = isValidCountry(user.user_metadata?.country) ? user.user_metadata.country : null
  const metaSector         = isValidSector(user.user_metadata?.sector) ? user.user_metadata.sector : null

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: existing } = await admin
    .from('profiles')
    .select('id, welcome_email_sent_at')
    .eq('id', user.id)
    .maybeSingle()

  const updateRow: Record<string, unknown> = {
    id: user.id,
    // account_type removed entirely
  }

  if (metaFullName)  updateRow.full_name  = metaFullName
  if (metaFirstName) updateRow.first_name = metaFirstName
  if (metaLastName)  updateRow.last_name  = metaLastName
  if (metaCountry)   updateRow.country    = metaCountry
  if (metaSector)    updateRow.sector     = metaSector

  // Brand-new row — seed defaults
  if (!existing) {
    updateRow.plan_status = 'free'
    updateRow.plan        = null
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

  return NextResponse.json({ ok: true })
}