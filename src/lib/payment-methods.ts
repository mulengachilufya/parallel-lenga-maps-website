/**
 * The ways to pay for an Individual pass. Safe to import from the browser:
 * nothing secret lives here (secrets are read from env in src/lib/lenco.ts).
 *
 *   Instant: card (Lenco), mobile money (Lipila)
 *   Manual (admin verifies):  bank, airtel, mtn
 */
export type PayMethod = 'card' | 'mobile-money' | 'bank' | 'airtel' | 'mtn'

export const INSTANT_METHODS: PayMethod[] = ['card', 'mobile-money']
export const MANUAL_METHODS:  PayMethod[] = ['bank', 'airtel', 'mtn']

export function mobileMoneyAvailableIn(country: string | null | undefined): boolean {
  const value = country?.trim().toLowerCase()
  return !value || ['zambia', 'zm', 'zmb'].includes(value)
}

export const METHOD_LABEL: Record<PayMethod, { title: string; sub: string; instant: boolean }> = {
  'card':         { title: 'Card',            sub: 'Mastercard or Visa',            instant: true },
  'mobile-money': { title: 'Mobile money',    sub: 'Zambian Airtel, MTN or Zamtel', instant: true },
  'bank':         { title: 'Bank transfer',   sub: 'We verify within 24 hours',     instant: false },
  'airtel':       { title: 'Airtel Money',    sub: 'Send it, upload a screenshot',  instant: false },
  'mtn':          { title: 'MTN MoMo',        sub: 'Send it, upload a screenshot',  instant: false },
}
