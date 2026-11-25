import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FetchCollectionResult } from '@/lib/lenco'

const API_BASE = 'https://api.lipila.dev/api/v1/collections'

export function lipilaConfig() {
  if (process.env.LIPILA_ENABLED !== 'true') return null
  const apiKey = process.env.LIPILA_API_KEY?.trim()
  const zmwPerUsd = Number(process.env.LIPILA_ZMW_PER_USD || process.env.LENCO_ZMW_PER_USD)
  if (!apiKey || !Number.isFinite(zmwPerUsd) || zmwPerUsd <= 0) return null
  return { apiKey, zmwPerUsd }
}

export function isLipilaReference(reference: string) {
  return /^lipila-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(reference)
}

export function normalizeMobileNumber(value: unknown) {
  if (typeof value !== 'string') return null
  const match = value.trim().replace(/[\s()-]/g, '').match(/^(?:\+?260|0)?([79]\d{8})$/)
  return match ? `260${match[1]}` : null
}

function callbackToken(reference: string, apiKey: string) {
  return createHmac('sha256', apiKey).update(`lipila-callback:${reference}`).digest('hex')
}

export function validLipilaCallback(reference: string, token: string, apiKey: string) {
  return /^[a-f0-9]{64}$/.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(callbackToken(reference, apiKey)))
}

export async function startLipilaCollection(
  apiKey: string, referenceId: string, amount: number, accountNumber: string, email: string,
) {
  const callback = new URL('/api/payments/lipila/callback', process.env.NEXT_PUBLIC_APP_URL || 'https://www.lengamaps.com')
  callback.searchParams.set('reference', referenceId)
  callback.searchParams.set('token', callbackToken(referenceId, apiKey))
  const res = await fetch(`${API_BASE}/mobile-money`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, Accept: 'application/json', 'Content-Type': 'application/json', callbackUrl: callback.toString() },
    body: JSON.stringify({ referenceId, amount, accountNumber, email, currency: 'ZMW', narration: 'Lenga Maps pass' }),
    signal: AbortSignal.timeout(12_000),
    redirect: 'error',
  })
  return res.status
}

export async function fetchLipilaCollection(reference: string, apiKey: string): Promise<FetchCollectionResult> {
  try {
    const res = await fetch(`${API_BASE}/check-status?${new URLSearchParams({ referenceId: reference })}`, {
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
      redirect: 'error',
    })
    if (!res.ok) return { ok: false, notFound: res.status === 404, error: `Lipila returned ${res.status}` }
    const data = await res.json()
    if (data?.referenceId !== reference || data.type !== 'Collection') {
      return { ok: false, notFound: false, error: 'Unexpected Lipila collection' }
    }
    const status = String(data.status).toLowerCase()
    const isMobileMoney = /^(airtelmoney|mtnmoney|mtnmomo|zamtelmoney|zamtelkwacha)$/i.test(data.paymentType)
    const validAmount = typeof data.amount === 'number' || (typeof data.amount === 'string' && /^\d+(\.\d+)?$/.test(data.amount))
    return {
      ok: true,
      data: {
        reference, id: typeof data.identifier === 'string' && data.identifier ? `lipila:${data.identifier}` : '',
        lencoReference: typeof data.externalId === 'string' ? data.externalId : reference,
        amount: validAmount ? String(data.amount) : '',
        currency: typeof data.currency === 'string' ? data.currency : '',
        type: isMobileMoney ? 'mobile-money' : null,
        status: status === 'successful' || status === 'failed' ? status : 'pending',
        fee: null, reasonForFailure: null,
      },
    }
  } catch {
    return { ok: false, notFound: false, error: 'Could not check Lipila collection' }
  }
}
