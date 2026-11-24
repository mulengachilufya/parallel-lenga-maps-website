import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchCollection, lencoConfig, type LencoConfig } from '@/lib/lenco'
import { computeGrant, GRANT_PROFILE_FIELDS } from '@/lib/payments/grant'
import { deliverPaymentNotifications } from '@/lib/jobs/payment-notifications'
import { logEvent } from '@/lib/ops/log'

interface FinalizeResult {
  state: 'granted' | 'already' | 'pending' | 'failed' | 'unknown' | 'error'
  message: string
  expiresAt?: string | null
}

export async function finalizeLencoPayment(db: SupabaseClient, config: LencoConfig, reference: string): Promise<FinalizeResult> {
  const unavailable: FinalizeResult = { state: 'error', message: 'Could not confirm the payment yet. Check your dashboard shortly.' }
  const { data: payment, error } = await db.from('lenco_payments').select('id, user_id, granted_at, plan, product')
    .eq('reference', reference).maybeSingle()
  if (error) return unavailable
  if (!payment) return { state: 'unknown', message: 'Payment not found.' }
  if (payment.granted_at) return { state: 'already', message: 'Your payment has already been applied.' }

  const collection = await fetchCollection(reference, config)
  const pending: FinalizeResult = { state: 'pending', message: 'Waiting for the payment to be confirmed.' }
  if (!collection.ok) return collection.notFound ? pending : unavailable
  const info = collection.data
  if (info.reference !== reference) return unavailable
  if (info.status === 'failed') {
    const failed = await db.from('lenco_payments').update({ status: 'failed', failure_reason: info.reasonForFailure })
      .eq('id', payment.id).is('granted_at', null)
    return failed.error ? unavailable : { state: 'failed', message: 'The payment did not go through.' }
  }
  if (info.status !== 'successful') return pending

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: profile, error: profileError } = await db.from('profiles')
      .select(GRANT_PROFILE_FIELDS).eq('id', payment.user_id).maybeSingle()
    if (profileError || !profile) return unavailable
    const { changes, expiresAt } = computeGrant(payment, profile)
    const { data: result, error: grantError } = await db.rpc('complete_lenco_payment', {
      p_reference: reference, p_collection: info.id, p_lenco_reference: info.lencoReference,
      p_type: info.type, p_currency: info.currency,
      p_amount: typeof info.amount === 'string' || typeof info.amount === 'number' ? String(info.amount) : null,
      p_expected: profile, p_changes: changes, p_expires_at: expiresAt,
    })
    if (grantError) {
      await logEvent('critical', 'payments', 'lenco_grant_failed', 'A confirmed Lenco payment could not be applied.', { reference, error: grantError.message })
      return unavailable
    }
    if (result === 'retry') continue
    if (result === 'already') return { state: 'already', message: 'Your payment has already been applied.' }
    if (result === 'mismatch') {
      await logEvent('critical', 'payments', 'lenco_mismatch', 'A Lenco payment did not match its order.', { reference })
      return { state: 'failed', message: 'Payment details did not match the order. Contact support with your reference.' }
    }
    if (result !== 'granted') return unavailable
    after(async () => { await deliverPaymentNotifications(db, `lenco:${payment.id}`) })
    return { state: 'granted', message: 'Payment confirmed. Your pass is active.', expiresAt }
  }
  return unavailable
}

export async function reconcileLencoPayments(db: SupabaseClient): Promise<number> {
  const config = lencoConfig()
  if (!config) return 0
  const now = new Date().toISOString()
  const { data, error } = await db.from('lenco_payments').select('id, reference, next_check_at')
    .in('status', ['pending', 'paid_unapplied']).is('granted_at', null)
    .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
    .lte('next_check_at', now).order('next_check_at').limit(15)
  if (error) throw error
  const results = await Promise.all((data ?? []).map(async (payment) => {
    const { data: claim } = await db.from('lenco_payments')
      .update({ next_check_at: new Date(Date.now() + 30 * 60_000).toISOString() })
      .eq('id', payment.id).eq('next_check_at', payment.next_check_at).is('granted_at', null).select('id').maybeSingle()
    if (!claim) return false
    return (await finalizeLencoPayment(db, config, payment.reference)).state === 'granted'
  }))
  return results.filter(Boolean).length
}
