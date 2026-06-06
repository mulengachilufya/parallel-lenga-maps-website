/**
 * USD → ZMW conversion.
 *
 * The site prices everything in USD, but Zambian mobile money rails are
 * ZMW-only — MTN/Airtel wallets hold Kwacha, so a MoMo collection MUST be
 * charged in ZMW. (Cards are charged in USD directly and need no conversion.)
 *
 * We pull a live mid-market rate from open.er-api.com — free, no API key,
 * and it includes ZMW. The rate is cached in-memory for an hour so we don't
 * hit the API on every checkout. If the API is ever unreachable we fall back
 * to the last cached rate, then to USD_TO_ZMW_FALLBACK, so a checkout never
 * hard-fails on an FX outage.
 *
 * Optional knobs (env):
 *   USD_TO_ZMW_FALLBACK   fixed rate used only if the live API is down (default 28)
 *   FX_MARKUP_PCT         % buffer added over mid-market to cover FX drift
 *                         between charge and settlement (default 0)
 */

const CACHE_TTL_MS  = 60 * 60 * 1000 // 1 hour
// Last-ditch rate, used ONLY if the live API is unreachable AND we have no
// cached rate. Keep it near the real market rate so an API blip can't badly
// over/undercharge. Override per-environment with USD_TO_ZMW_FALLBACK.
const FALLBACK_RATE = Number(process.env.USD_TO_ZMW_FALLBACK ?? 18)
const MARKUP_PCT    = Number(process.env.FX_MARKUP_PCT ?? 0)

// Module-level cache. Persists across warm serverless invocations on the same
// instance; a cold instance simply refetches. Good enough for low volume.
let cached: { rate: number; at: number } | null = null

async function fetchUsdZmwRate(): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rate

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      // Belt-and-braces: also let the platform cache for an hour.
      next: { revalidate: 3600 },
    } as RequestInit)
    if (!res.ok) throw new Error(`FX API HTTP ${res.status}`)

    const data = await res.json() as { result?: string; rates?: Record<string, number> }
    const rate = data?.rates?.ZMW

    if (data.result === 'success' && typeof rate === 'number' && rate > 0) {
      cached = { rate, at: Date.now() }
      return rate
    }
    throw new Error('FX API returned no usable ZMW rate')
  } catch (err) {
    console.error('[fx] live rate fetch failed:', err)
    if (cached) return cached.rate          // stale-but-good beats failing
    return FALLBACK_RATE                     // last resort
  }
}

export interface UsdToZmwResult {
  /** Amount to charge, in ZMW, rounded to 2 dp. */
  zmw:      number
  /** Effective rate applied (mid-market × markup). */
  rate:     number
  /** Mid-market rate before any markup — handy for records/audit. */
  baseRate: number
}

/** Convert a USD amount to ZMW using the live (cached) rate. */
export async function usdToZmw(usd: number): Promise<UsdToZmwResult> {
  const baseRate = await fetchUsdZmwRate()
  const rate     = baseRate * (1 + MARKUP_PCT / 100)
  const zmw      = Math.round(usd * rate * 100) / 100
  return { zmw, rate, baseRate }
}
