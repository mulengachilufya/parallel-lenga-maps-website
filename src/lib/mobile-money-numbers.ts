/**
 * Where customers send money for the MANUAL Airtel Money / MTN MoMo options.
 * Read from environment variables so the numbers are never hardcoded and a
 * method with no number set simply does not appear on the pay page.
 *
 * Set in Vercel (Environment Variables) and .env.local:
 *   NEXT_PUBLIC_AIRTEL_MONEY_NUMBER        e.g. 0977123456
 *   NEXT_PUBLIC_MTN_MOMO_NUMBER            e.g. 0966123456
 *   NEXT_PUBLIC_MOBILE_MONEY_ACCOUNT_NAME  the name the number is registered to
 *   NEXT_PUBLIC_ZMW_PER_USD                optional, only used to show roughly
 *                                          how many kwacha a dollar price is
 *
 * NEXT_PUBLIC_ variables are readable by anyone visiting the site, which is
 * right here: customers need to see these numbers anyway.
 */
export const MOBILE_MONEY_NUMBERS = {
  airtel:      (process.env.NEXT_PUBLIC_AIRTEL_MONEY_NUMBER ?? '').trim(),
  mtn:         (process.env.NEXT_PUBLIC_MTN_MOMO_NUMBER ?? '').trim(),
  accountName: (process.env.NEXT_PUBLIC_MOBILE_MONEY_ACCOUNT_NAME ?? '').trim(),
  zmwPerUsd:   Number(process.env.NEXT_PUBLIC_ZMW_PER_USD) || 0,
}
