// src/lib/free-picks.ts — server-only: record free-plan dataset picks.

import type { SupabaseClient } from '@supabase/supabase-js'
import { FREE_DATASET_LIMIT, cleanPicks, type DatasetSlug } from './pricing'

/**
 * Add picks through free_pick() (migration 042), which locks the row so
 * picks can only ever be added, never swapped, and never go past 3.
 */
export async function savePicks(
  db: SupabaseClient, kind: 'profile' | 'org', id: string, wanted: unknown,
): Promise<{ picks: DatasetSlug[] } | { error: string; status: number }> {
  const add = cleanPicks(wanted)
  if (!add.length) return { error: 'Choose at least one dataset.', status: 400 }
  const { data, error } = await db.rpc('free_pick', { p_kind: kind, p_id: id, p_add: add })
  if (error) {
    if (error.message.includes('free_limit')) {
      return { error: `The free plan includes ${FREE_DATASET_LIMIT} datasets, and these would take you past that. Your choices so far are kept.`, status: 409 }
    }
    if (error.message.includes('not_free_team')) return { error: 'This team is on a paid plan: it already has every dataset.', status: 409 }
    console.error('[free-picks] save failed', error)
    return { error: 'Could not save your choice. Please try again.', status: 500 }
  }
  return { picks: cleanPicks(data) }
}
