import type { SupabaseClient } from '@supabase/supabase-js'
import { paymentRejectedEmail, paymentVerifiedEmail, sendEmail } from '@/lib/email'

export async function deliverPaymentNotifications(db: SupabaseClient, paymentId?: string): Promise<number> {
  const now = new Date().toISOString()
  let query = db.from('payment_notifications').select('*').is('sent_at', null)
    .lte('next_attempt_at', now).order('next_attempt_at').limit(10)
  if (paymentId) query = query.eq('payment_id', paymentId)
  const { data, error } = await query
  if (error) {
    console.error('[payment-notifications] load failed', error)
    return 0
  }

  let sent = 0
  for (const notice of data ?? []) {
    const nextAttempt = new Date(Date.now() + 10 * 60_000).toISOString()
    const { data: claim, error: claimError } = await db.from('payment_notifications')
      .update({ next_attempt_at: nextAttempt }).eq('payment_id', notice.payment_id)
      .eq('next_attempt_at', notice.next_attempt_at).is('sent_at', null).select('payment_id').maybeSingle()
    if (claimError || !claim) continue
    const message = notice.status === 'verified'
      ? paymentVerifiedEmail(notice.user_email, notice.user_name, notice.plan, notice.expires_at)
      : paymentRejectedEmail(notice.user_email, notice.user_name, notice.note ?? '')
    if (await sendEmail(message, 'payments', `payment-decision/${notice.payment_id}`)) {
      const { error: markError } = await db.from('payment_notifications')
        .update({ sent_at: new Date().toISOString() }).eq('payment_id', notice.payment_id)
      if (markError) console.error('[payment-notifications] mark sent failed', markError)
      else sent++
    }
  }
  return sent
}
