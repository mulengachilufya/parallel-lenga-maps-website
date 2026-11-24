import type { SupabaseClient } from '@supabase/supabase-js'
import { objectMetadata } from '@/lib/r2'
import { logEvent } from '@/lib/ops/log'

export async function reconcileWorkspaceUploads(db: SupabaseClient): Promise<number> {
  const now = new Date().toISOString()
  const { data, error } = await db.from('workspace_upload_reservations').select('object_key, project_id')
    .lte('expires_at', now).is('attached_at', null).is('released_at', null).is('orphaned_at', null)
    .order('expires_at').limit(100)
  if (error) throw error
  const results = await Promise.allSettled((data ?? []).map(async (row) => {
    const stored = await objectMetadata(row.object_key)
    const { data: updated, error: updateError } = await db.from('workspace_upload_reservations')
      .update(stored ? { orphaned_at: now } : { released_at: now })
      .eq('object_key', row.object_key).is('attached_at', null).is('released_at', null).is('orphaned_at', null)
      .select('object_key').maybeSingle()
    if (updateError) throw updateError
    if (stored && updated) {
      await logEvent('warn', 'workspace', 'unattached_upload', 'A workspace upload was retained without a layer.', {
        projectId: row.project_id, key: row.object_key,
      }, `workspace:unattached_upload:${row.project_id}`)
    }
    return !!updated
  }))
  const failed = results.filter((result) => result.status === 'rejected').length
  if (failed) console.error('[workspace uploads] reconciliation will retry', { failed })
  return results.filter((result) => result.status === 'fulfilled' && result.value).length
}
