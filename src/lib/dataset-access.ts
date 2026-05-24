// src/lib/dataset-access.ts
// Server-side gate for all dataset download API routes.

import { createServerSupabase } from './supabase-server'
import {
  getUserState,
  canAccessFiles,
  DATASET_MIN_TIER,
  PLAN_ORDER,
  type DatasetSlug,
  type TierSlug,
} from './pricing'

export type { DatasetSlug }

/**
 * Can the current caller access any files at all?
 * true  = active paid plan OR active free trial
 * false = anonymous, no profile, expired trial, free user
 */
export async function callerCanAccessFiles(): Promise<boolean> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_status, plan_expires_at, trial_started_at')
    .eq('id', user.id)
    .single()

  if (!profile) return false

  if (profile.plan_expires_at &&
      new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return false
  }

  const state = getUserState(
    profile.plan,
    profile.trial_started_at,
    profile.plan_status,
  )

  return canAccessFiles(state)
}

/**
 * Can the current caller download from a specific dataset?
 * Free trial = access to everything.
 * Paid plan = checked against DATASET_MIN_TIER.
 * Free user = nothing.
 */
export async function callerCanDownloadDataset(slug: DatasetSlug): Promise<boolean> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_status, plan_expires_at, trial_started_at')
    .eq('id', user.id)
    .single()

  if (!profile) return false

  if (profile.plan_expires_at &&
      new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return false
  }

  const state = getUserState(
    profile.plan,
    profile.trial_started_at,
    profile.plan_status,
  )

  if (state === 'free_trial') return true
  if (state === 'free') return false

  return PLAN_ORDER.indexOf(state as TierSlug) >=
         PLAN_ORDER.indexOf(DATASET_MIN_TIER[slug])
}

/**
 * Back-compat shim — old API routes call callerCanDownloadTier('basic'|'pro'|'max').
 * Maps to the closest dataset slug and delegates to callerCanDownloadDataset.
 * New routes should call callerCanDownloadDataset(slug) directly.
 */
export async function callerCanDownloadTier(
  tier: string
): Promise<boolean> {
  const map: Record<string, DatasetSlug> = {
    basic: 'admin-boundaries',
    pro:   'watersheds',
    max:   'lulc',
  }
  return callerCanDownloadDataset(map[tier] ?? 'admin-boundaries')
}
