/**
 * POST /api/account/init-profile
 *
 * Run once right after signup (and again after email confirmation, in case
 * the auth flow split across two sessions). Reads the new user's
 * `user_metadata` (set by /signup) and writes `plan` + `account_type` +
 * `full_name` into the `profiles` row.
 *
 * Why this exists:
 *   Without this call, Supabase's `handle_new_user` trigger creates a
 *   profiles row using the column defaults (plan='basic', account_type=
 *   'student'). That meant a customer who clicked "Pro Student" on pricing
 *   would land in the dashboard labelled as Basic Student — visually wrong,
 *   and confusing when they later wanted to pay for the plan they actually
 *   chose.
 *
 * Safety:
 *   - We NEVER touch `plan_status` or `plan_expires_at`. Those are written
 *     ONLY by the admin verify endpoint after a real payment lands. An
 *     attacker who calls this endpoint repeatedly with manipulated metadata
 *     can flip their *displayed* plan label, but cannot grant themselves
 *     download access — that gate stays on `plan_status='active'`.
 *   - We treat `plan` and `account_type` as the user's *stated intent*, not
 *     proof of payment. Setting `plan='max'` here is fine: they still see
 *     the Pay gate the moment they try to download anything.
 *   - Service role is required because the freshly-signed-up user may not
 *     yet have a profiles row visible under their RLS view.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const VALID_PLANS = new Set(['basic', 'pro', 'max'])
const VALID_TYPES = new Set(['student', 'professional', 'business'])

export async function POST() {
  // Identify the caller via their session cookie.
  const cookieClient = createServerSupabase()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Pull intent off user_metadata, fall back to safe defaults if anything is
  // missing or junked. NOTE: we no longer pre-fill `plan` for fresh signups —
  // a brand-new account should have NO plan until it pays + gets approved.
  // Only an explicit, valid plan value in user_metadata gets propagated to
  // the row (and even that only happens via the verify endpoint these days,
  // since signup itself stopped writing plan to metadata).
  const metaPlan        = String(user.user_metadata?.plan        ?? '').trim()
  const metaAccountType = String(user.user_metadata?.account_type ?? '').trim()
  const metaFullName    = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim().slice(0, 200)
    : null

  const plan        = VALID_PLANS.has(metaPlan)        ? metaPlan        : null
  const accountType = VALID_TYPES.has(metaAccountType) ? metaAccountType : 'student'

  // Service-role client: bypasses RLS so we can upsert into profiles regardless
  // of whether the handle_new_user trigger ran.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Read existing row first so we don't clobber a paid user's plan_status if
  // they happen to call this endpoint after already paying.
  const { data: existing } = await admin
    .from('profiles')
    .select('id, plan_status, plan_expires_at')
    .eq('id', user.id)
    .maybeSingle()

  const updateRow: Record<string, unknown> = {
    id:           user.id,
    account_type: accountType,
  }
  // Only write `plan` if user_metadata had a real value. For fresh signups
  // metaPlan is empty — leave the column unset / NULL so the user is NOT
  // displayed as being on any plan until they actually pay for one.
  if (plan) updateRow.plan = plan
  if (metaFullName) updateRow.full_name = metaFullName

  // Brand-new row → seed plan_status='free' (no auto-grant) and ensure the
  // plan column is explicitly NULL so the dashboard "Current Plan" card
  // shows "No active plan" instead of stale defaults.
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

  return NextResponse.json({
    ok:           true,
    plan,
    account_type: accountType,
    plan_status:  existing?.plan_status ?? 'free',
  })
}
