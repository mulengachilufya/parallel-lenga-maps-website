/**
 * Lenco (https://lenco-api.readme.io) - server-side helpers.
 *
 * SERVER ONLY. This file reads the secret key. Never import it from a
 * component that has 'use client' at the top.
 *
 * Environment variables (set in Vercel > Settings > Environment Variables,
 * and in your git-ignored .env.local):
 *   LENCO_SECRET_KEY      API secret key (sandbox or live)
 *   LENCO_PUBLIC_KEY      public key (safe for the browser, sent to the widget)
 *   LENCO_ZMW_PER_USD     how many kwacha one dollar is, e.g. 27.5. Required:
 *                         mobile money is always charged in ZMW.
 *   LENCO_CARD_CURRENCY   'ZMW' (default) or 'USD' if Lenco enabled USD cards
 *   LENCO_API_BASE        default https://api.lenco.co/access/v2
 *                         sandbox:  https://sandbox.lenco.co/access/v2
 *   LENCO_WIDGET_URL      default https://pay.lenco.co/js/v1/inline.js
 *                         sandbox:  https://pay.sandbox.lenco.co/js/v1/inline.js
 */
import { createHash, createHmac, timingSafeEqual, randomUUID } from 'crypto'

export type LencoChannel = 'card' | 'mobile-money'
export type LencoCurrency = 'ZMW' | 'USD'

export interface LencoConfig {
  secretKey:    string
  publicKey:    string
  apiBase:      string
  widgetUrl:    string
  zmwPerUsd:    number
  cardCurrency: LencoCurrency
}

/** Returns null when Lenco is not (fully) configured, so callers can say so. */
export function lencoConfig(): LencoConfig | null {
  if (process.env.LENCO_ENABLED !== 'true') return null
  const secretKey = process.env.LENCO_SECRET_KEY?.trim()
  const publicKey = process.env.LENCO_PUBLIC_KEY?.trim()
  const zmwPerUsd = Number(process.env.LENCO_ZMW_PER_USD)
  if (!secretKey || !publicKey || !Number.isFinite(zmwPerUsd) || zmwPerUsd <= 0) return null
  return {
    secretKey, publicKey, zmwPerUsd,
    apiBase:      (process.env.LENCO_API_BASE?.trim() || 'https://api.lenco.co/access/v2').replace(/\/+$/, ''),
    widgetUrl:    process.env.LENCO_WIDGET_URL?.trim() || 'https://pay.lenco.co/js/v1/inline.js',
    cardCurrency: process.env.LENCO_CARD_CURRENCY?.trim().toUpperCase() === 'USD' ? 'USD' : 'ZMW',
  }
}

export function isLencoChannel(v: unknown): v is LencoChannel {
  return v === 'card' || v === 'mobile-money'
}

/** What to charge, decided on the server from the USD price. Rounds UP to the
 *  nearest ngwee/cent so we never under-charge. Mobile money is ZMW only. */
export function amountFor(channel: LencoChannel, usd: number, cfg: Pick<LencoConfig, 'zmwPerUsd' | 'cardCurrency'>)
  : { amount: number; currency: LencoCurrency } {
  const currency: LencoCurrency = channel === 'card' ? cfg.cardCurrency : 'ZMW'
  const raw = currency === 'USD' ? usd : usd * cfg.zmwPerUsd
  return { amount: Math.ceil(raw * 100 - 1e-9) / 100, currency }
}

/** A unique reference. Lenco allows only letters, digits and - . _ */
export function newLencoReference(): string {
  return `lm-${randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export interface LencoCollection {
  id:               string
  amount:           string
  fee:              string | null
  currency:         string
  reference:        string | null
  lencoReference:   string
  type:             'card' | 'mobile-money' | 'bank-account' | null
  status:           'pending' | 'successful' | 'failed' | 'pay-offline'
  reasonForFailure: string | null
}

export type FetchCollectionResult =
  | { ok: true;  data: LencoCollection }
  | { ok: false; notFound: boolean; error: string }

/** Ask Lenco directly what happened to a reference. This is the source of
 *  truth: we never grant access because the browser (or a webhook body) SAYS
 *  a payment worked, only because Lenco's own API says so. */
export async function fetchCollection(reference: string, cfg: LencoConfig): Promise<FetchCollectionResult> {
  try {
    const res = await fetch(`${cfg.apiBase}/collections/status/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${cfg.secretKey}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
      redirect: 'error',
    })
    if (res.status === 404) return { ok: false, notFound: true, error: 'not found' }
    const json = await res.json().catch(() => null) as { status?: boolean; message?: string; data?: LencoCollection } | null
    if (!res.ok || !json?.status || !json.data) {
      return { ok: false, notFound: false, error: json?.message || `Lenco returned ${res.status}` }
    }
    return { ok: true, data: json.data }
  } catch (err) {
    return { ok: false, notFound: false, error: err instanceof Error ? err.message : 'network error' }
  }
}

/** Webhook check. Lenco signs the body with HMAC SHA512, keyed by the SHA256
 *  hash of your API secret key, and sends it in X-Lenco-Signature. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secretKey: string): boolean {
  if (!signature) return false
  const key = createHash('sha256').update(secretKey).digest('hex')
  const candidates = [rawBody]
  try { candidates.push(JSON.stringify(JSON.parse(rawBody))) } catch { /* not JSON, only the raw check applies */ }
  const given = Buffer.from(signature.trim().toLowerCase(), 'utf8')
  return candidates.some((body) => {
    const expected = Buffer.from(createHmac('sha512', key).update(body).digest('hex'), 'utf8')
    return expected.length === given.length && timingSafeEqual(expected, given)
  })
}
