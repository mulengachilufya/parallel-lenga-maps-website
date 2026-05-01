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
 * Tier model (matches DownloadGateContext):
 *   - basic: any active plan (basic / pro / max) can download
 *   - pro:   only pro / max can download
 *
 * Returning `false` means "give them metadata only, no presigned URL". The
 * client UI already handles missing download_url gracefully (the Download
 * button disables itself).
 */
import { createServerSupabase } from './supabase-server'

export type Tier = 'basic' | 'pro'

const PLAN_RANK: Record<string, number> = { basic: 0, pro: 1, max: 2 }

/**
 * Check whether the caller has an active plan that unlocks this tier.
 *
 * Returns false for:
 *   - anonymous callers (no session)
 *   - signed-in users with no profile row
 *   - plan_status != 'active'
 *   - plan_expires_at in the past
 *   - active user whose plan rank is below the required tier
 */
export async function callerCanDownloadTier(tier: Tier): Promise<boolean> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_status, plan_expires_at')
    .eq('id', user.id)
    .single()

  if (!profile) return false
  if (profile.plan_status !== 'active') return false
  if (profile.plan_expires_at &&
      new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return false
  }

  const userRank   = PLAN_RANK[profile.plan ?? 'basic'] ?? 0
  const requiredRank = tier === 'pro' ? 1 : 0
  return userRank >= requiredRank
}
