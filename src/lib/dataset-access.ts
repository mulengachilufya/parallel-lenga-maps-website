// src/lib/dataset-access.ts
// Server-side gate for all dataset download API routes.
//
// Once-off model: no trial, no per-dataset tier. A caller can either
// download everything (active individual or team plan) or nothing.

import { createServerSupabase } from './supabase-server'
import { getUserState, canAccessFiles, type DatasetSlug } from './pricing'

export type { DatasetSlug }

/**
 * Can the current caller access any files at all?
 * true  = active individual or team plan
 * false = anonymous, no profile, or free/unpaid
 */
export async function callerCanAccessFiles(): Promise<boolean> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_status')
    .eq('id', user.id)
    .single()

  if (!profile) return false

  const state = getUserState(profile.plan, profile.plan_status)
  return canAccessFiles(state)
}

/**
 * Can the current caller download from a specific dataset?
 * There's no more per-dataset tier — a paid account (either plan) can
 * download any dataset. The `slug` param is kept so existing call sites
 * don't need to change, but it no longer affects the result.
 */
export async function callerCanDownloadDataset(_slug: DatasetSlug): Promise<boolean> {
  return callerCanAccessFiles()
}

/**
 * Back-compat shim — old API routes call callerCanDownloadTier('basic'|'pro'|'max').
 * Tier-based gating is gone; this now just checks for any paid plan.
 * New routes should call callerCanAccessFiles() directly.
 */
export async function callerCanDownloadTier(_tier: string): Promise<boolean> {
  return callerCanAccessFiles()
}