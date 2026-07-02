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
