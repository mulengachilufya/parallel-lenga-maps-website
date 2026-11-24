import { PASSES, UPDATE_MONTHS, accessExpiry, isPassProduct } from '@/lib/pricing'

export const GRANT_PROFILE_FIELDS = 'plan, plan_status, plan_expires_at, updates_until, standalone_team_access'

interface Profile {
  plan: string | null
  plan_status: string | null
  plan_expires_at: string | null
  updates_until: string | null
  standalone_team_access: boolean
}

export function computeGrant(payment: { plan: string; product: string | null; account_type?: string | null }, current: Profile | null) {
  const purchased = current?.plan === 'individual' || current?.standalone_team_access
  const currentExpiry = purchased ? current?.plan_expires_at : null
  const permanent = purchased && current?.plan_status === 'active' && !current.plan_expires_at
  const product = payment.product
  let changes: Record<string, unknown>
  let expiresAt: string | null
  if (isPassProduct(product)) {
    const months = PASSES[product].months
    if (permanent && current?.plan === 'individual') {
      // Holds access for good (old licence). Never put an end date on it.
      // A pass buys more months of new datasets; with no limit already,
      // there is nothing to extend.
      expiresAt = null
      changes = current?.updates_until
        ? { updates_until: accessExpiry(current.updates_until, months), pending_plan: null }
        : { pending_plan: null }
    } else {
      expiresAt = accessExpiry(currentExpiry, months)
      changes = {
        plan: 'individual', standalone_team_access: false, ...(payment.account_type ? { account_type: payment.account_type } : {}), plan_status: 'active',
        plan_expires_at: expiresAt, expiry_reminder_sent_at: null, pending_plan: null,
        updates_until: null,
      }
    }
  } else if (product === 'updates') {
    expiresAt = null
    changes = { updates_until: accessExpiry(current?.updates_until, UPDATE_MONTHS), pending_plan: null }
  } else if (product === 'licence') {
    // Someone with permanent access from an earlier plan already has
    // everything with no limit; buying again leaves that alone.
    const unlimited = permanent && !current?.updates_until && current?.plan === 'individual'
    expiresAt = null
    changes = {
      plan: 'individual', standalone_team_access: false, ...(payment.account_type ? { account_type: payment.account_type } : {}), plan_status: 'active',
      plan_expires_at: null, expiry_reminder_sent_at: null, pending_plan: null,
      updates_until: unlimited ? null : accessExpiry(current?.updates_until, UPDATE_MONTHS),
    }
  } else {
    expiresAt = permanent ? null : accessExpiry(currentExpiry)
    changes = {
      plan: payment.plan, standalone_team_access: payment.plan === 'team', ...(payment.account_type ? { account_type: payment.account_type } : {}), plan_status: 'active',
      plan_expires_at: expiresAt, expiry_reminder_sent_at: null, pending_plan: null,
    }
  }
  return { changes, expiresAt }
}
