import type { SupabaseClient } from '@supabase/supabase-js'
import { deletePrefix } from '@/lib/r2'
import { logEvent } from '@/lib/ops/log'

export async function processAccountDeletions(db: SupabaseClient, userId?: string) {
  const now = new Date().toISOString()
  let query = db.from('account_deletion_jobs').select('*').is('completed_at', null)
    .lte('next_attempt_at', now).order('next_attempt_at').limit(3)
  if (userId) query = query.eq('user_id', userId)
  const { data: jobs, error } = await query
  if (error) throw error

  let completed = 0
  for (const job of jobs ?? []) {
    const write = async (changes: Record<string, unknown>) => {
      const { error: writeError } = await db.from('account_deletion_jobs').update(changes).eq('user_id', job.user_id)
      if (writeError) throw writeError
    }
    const { data: claim, error: claimError } = await db.from('account_deletion_jobs')
      .update({ next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() })
      .eq('user_id', job.user_id).eq('next_attempt_at', job.next_attempt_at).is('completed_at', null).select('user_id').maybeSingle()
    if (claimError || !claim) continue

    let step = 'unlink_records'
    try {
      if (!job.auth_deleted_at) {
        const payment = await db.from('manual_payments').update({ verified_by: null }).eq('verified_by', job.user_id)
        if (payment.error) throw payment.error
        const downloads = await db.from('download_events')
          .update({ user_name: 'Former member', user_email: null }).eq('user_id', job.user_id)
        if (downloads.error) throw downloads.error
        step = 'delete_auth_user'
        const auth = await db.auth.admin.deleteUser(job.user_id)
        if (auth.error && auth.error.code !== 'user_not_found' && auth.error.status !== 404) throw auth.error
        await write({ auth_deleted_at: new Date().toISOString(), last_error: null })
      }

      const closed: string[] = [...job.closed_org_ids]
      const cleaned: string[] = [...job.cleaned_org_ids]
      for (const orgId of job.org_ids as string[]) {
        if (!closed.includes(orgId)) {
          step = 'close_empty_team'
          const { data: ok, error: closeError } = await db.rpc('close_deleted_account_team', { p_user: job.user_id, p_org: orgId })
          if (closeError || !ok) throw closeError ?? new Error('Team now has members or active paid access')
          closed.push(orgId)
          await write({ closed_org_ids: closed })
        }
        if (!cleaned.includes(orgId)) {
          step = 'remove_team_uploads'
          await deletePrefix(`workspace-uploads/${orgId}/`)
          cleaned.push(orgId)
          await write({ cleaned_org_ids: cleaned })
        }
      }
      step = 'mark_complete'
      await write({ completed_at: new Date().toISOString(), last_error: null })
      completed++
    } catch (err) {
      console.error('[account-deletion] step failed', { userId: job.user_id, step, err })
      await write({ last_error: step })
      await logEvent('error', 'account', 'deletion_incomplete', 'A confirmed account deletion needs another attempt.', { userId: job.user_id, step })
    }
  }
  return completed
}
