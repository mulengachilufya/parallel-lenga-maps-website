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
 * Tier model (single source of truth: hasFullDatasetAccess in lib/supabase):
 *   - basic-tier datasets: any active plan unlocks them (incl. Business basic)
 *   - pro-tier datasets:
 *       · Student / Professional: only plan='pro' or plan='max'
 *       · Business: ANY plan unlocks them (basic + pro both = "Everything in Max")
 *
 * Returning `false` means "give them metadata only, no presigned URL". The
 * client UI already handles missing download_url gracefully (the Download
 * button disables itself).
 */
import { createServerSupabase } from './supabase-server'
import { hasFullDatasetAccess, type AccountType, type PlanTier } from './supabase'

export type Tier = 'basic' | 'pro'

/**
 * Check whether the caller has an active plan that unlocks this tier.
 *
 * Returns false for:
 *   - anonymous callers (no session)
 *   - signed-in users with no profile row
 *   - plan_status != 'active'
 *   - plan_expires_at in the past
 *   - active non-business user on plan='basic' trying to access a pro-tier dataset
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

  // Basic-tier datasets: any active plan unlocks them. Pro-tier: depends on
  // plan AND account_type — Business gets full access at every plan level.
  if (tier === 'basic') return true
  return hasFullDatasetAccess(
    (profile.plan ?? 'basic') as PlanTier,
    (profile.account_type ?? 'student') as AccountType,
  )
}
