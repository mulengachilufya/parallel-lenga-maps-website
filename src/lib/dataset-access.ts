/**
 * Server-side access check for dataset list endpoints.
 *
 * Background:
 *   Every dataset-list route under /api/* used to bake presigned R2 URLs
 *   into its JSON response REGARDLESS of who was calling. An anonymous
 *   `curl /api/aquifer` would happily return links that downloaded the
 *   actual files for free. This helper fixes that: routes call it once,
 *   and only return `download_url` if it returns true.
 *
 * Tier model (single source of truth: canAccessDatasetTier in lib/supabase):
 *   basic: 4 datasets — Admin Boundaries, Rivers, Rainfall, Temperature
 *   pro:   +4 = 8     — Lakes, LULC, Drought Index, Watersheds
 *   max:   +rest = 12+ — Aquifers, Population, Protected Areas, …
 *
 * Plan / tier matrix:
 *   plan basic       → tier=basic only
 *   plan pro         → tier=basic + pro
 *   plan max         → all tiers
 *   account=business → all tiers regardless of plan (basic & pro both grant
 *                      max-equivalent data access)
 *
 * Returning `false` means "give them metadata only, no presigned URL". The
 * client UI handles a missing download_url by routing the click through
 * DownloadGate, which pops up the appropriate signup/pay/upgrade modal.
 */
import { createServerSupabase } from './supabase-server'
import { canAccessDatasetTier, type AccountType, type DatasetTier, type PlanTier } from './supabase'

// Re-export for the route handlers' local use.
export type Tier = DatasetTier

/**
 * Check whether the caller has an active plan that unlocks `tier`.
 *
 * Returns false for:
 *   - anonymous callers (no session)
 *   - signed-in users with no profile row
 *   - plan_status != 'active'
 *   - plan_expires_at in the past
 *   - plan column NULL (defense-in-depth — a paid user should always have a plan)
 *   - non-business user whose plan rank is below the dataset tier
 */
export async function callerCanDownloadTier(tier: Tier): Promise<boolean> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, account_type, plan_status, plan_expires_at')
    .eq('id', user.id)
    .single()

  if (!profile) return false
  if (profile.plan_status !== 'active') return false
  if (profile.plan_expires_at &&
      new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return false
  }
  // Defense-in-depth: plan_status='active' is supposed to imply a real plan,
  // but if the row is somehow active with a NULL plan column, deny rather
  // than silently treating it as basic.
  if (!profile.plan) return false

  // Single canonical helper handles the three-tier ladder + business override.
  return canAccessDatasetTier(
    profile.plan as PlanTier,
    (profile.account_type ?? 'student') as AccountType,
    tier,
  )
}
