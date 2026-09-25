/**
 * Bank-transfer details for card / bank (manual, admin-verified) payments.
 *
 * Hardcoded here on purpose:
 *   - They're NOT secret — every paying customer sees them.
 *   - One obvious place to edit them; no Vercel env, no Resend template.
 *   - Changing them is your normal edit → commit → push.
 *
 * Used by the email (src/lib/email/manual-payment.ts) AND shown on the payment
 * page (returned by /api/payments/bank-details) so the details are on-screen
 * even if the email is slow or lands in spam.
 *
 * NB: the account-holder's personal home address is intentionally NOT here —
 * it would be shown to every customer. The bank's own address (below) is what
 * international SWIFT transfers actually require.
 */
export interface BankDetails {
  accountName:   string
  bankName:      string
  accountNumber: string
  branchCode:    string
  swift:         string
  bankAddress:   string
}

export const BANK_DETAILS: BankDetails = {
  accountName:   'Mulenga Chilufya',
  bankName:      'Standard Chartered Bank Zambia PLC',
  accountNumber: '0104317136400',
  branchCode:    '060017',
  swift:         'SCBLZMLX',
  bankAddress:   'Standard Chartered House, Cairo Road, P.O. Box 32238, Lusaka, Zambia',
}

/**
 * Short, stable bank-transfer reference for a user, e.g. "LM-3F9A2C1B".
 *
 * Banks truncate or reject long references and many strip "@", so an email
 * address doesn't reliably survive the trip onto the bank statement. This is
 * 11 plain characters and is derived from the user id, so the same
 * customer always gets the same reference, whether they re-open the panel or
 * submit proof later. The founder alert and the customer email both carry it,
 * so a line on the statement can be matched to a person at a glance.
 */
export function bankReferenceFor(userId: string): string {
  return `LM-${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}
