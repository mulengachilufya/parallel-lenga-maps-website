/**
 * The ways to pay for an Individual pass. Safe to import from the browser:
 * nothing secret lives here (secrets are read from env in src/lib/lenco.ts).
 *
 *   Instant (through Lenco):  card, mobile-money
 *   Manual (admin verifies):  bank, airtel, mtn
 */
export type PayMethod = 'card' | 'mobile-money' | 'bank' | 'airtel' | 'mtn'

export const INSTANT_METHODS: PayMethod[] = ['card', 'mobile-money']
export const MANUAL_METHODS:  PayMethod[] = ['bank', 'airtel', 'mtn']

/**
 * Countries where Lenco can collect Airtel / MTN mobile money. This list is
 * only used to decide whether to SHOW the option to a signed-in person whose
 * profile country is known; Lenco itself decides what actually works.
 * Edit it when Lenco opens a new country.
 */
export const LENCO_MOBILE_MONEY_COUNTRIES = ['Zambia', 'Malawi'] as const

export function mobileMoneyAvailableIn(country: string | null | undefined): boolean {
  if (!country) return true // unknown country: show it, Lenco will refuse if unsupported
  return LENCO_MOBILE_MONEY_COUNTRIES.some((c) => c.toLowerCase() === country.trim().toLowerCase())
}

export const METHOD_LABEL: Record<PayMethod, { title: string; sub: string; instant: boolean }> = {
  'card':         { title: 'Card',            sub: 'Mastercard or Visa',            instant: true },
  'mobile-money': { title: 'Mobile money',    sub: 'Airtel or MTN, paid instantly', instant: true },
  'bank':         { title: 'Bank transfer',   sub: 'We verify within 24 hours',     instant: false },
  'airtel':       { title: 'Airtel Money',    sub: 'Send it, upload a screenshot',  instant: false },
  'mtn':          { title: 'MTN MoMo',        sub: 'Send it, upload a screenshot',  instant: false },
}
