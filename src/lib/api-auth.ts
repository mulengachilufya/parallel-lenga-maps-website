/**
 * Bearer-token authentication for the public REST API (`/api/v1/*`).
 *
 * The API is a TEAM-TIER feature ("For Project Teams and Businesses",
 * plan='team'). Individual plans, including Max, do not carry API access —
 * delisted 2026-06 when the team tier replaced the legacy Enterprise tier.
 *
 * Flow:
 *   1. Pull `Authorization: Bearer lm_live_…` off the request.
 *   2. Hash it and look up the row in `api_keys` (service-role client — the
 *      caller has no Supabase session).
 *   3. Reject if revoked.
 *   4. Gate: the key's owner must belong to an ACTIVE organization. Checked
 *      on every request so suspending an org kills its keys immediately.
 *   5. Rate limit: fixed one-minute window per key, limit configured
 *      per-org (organizations.api_rate_per_min, default 60). Atomic via the
 *      bump_rate_counter() Postgres function — correct across serverless
 *      instances because the counter lives in the database.
 *   6. Monthly quotas (requests + egress) as a backstop.
 *
 * We do NOT meter overage — blow a limit and you get a 429 with Retry-After,
 * and we expect you to email us. No surprise bills.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isPaidOrgActive, listMemberships } from './teams'
import { extractKeyFromHeader, hashKey } from './api-keys'

export const MAX_REQUESTS_PER_MONTH    = 5_000
export const MAX_EGRESS_BYTES_PER_MONTH = 50 * 1024 * 1024 * 1024  // 50 GB
export const DEFAULT_RATE_PER_MIN       = 60

/** Resolved API caller after successful auth. */
export interface ApiCaller {
  keyId:                 string
  userId:                string
  orgId:                 string
  orgName:               string
  scopes:                string[]
  requestsThisMonth:     number
  egressBytesThisMonth:  number
  rateLimitPerMin:       number
  rateUsedThisWindow:    number
}

/** Fail reasons surface to the caller as HTTP responses. */
export type AuthFailure =
  | { type: 'missing-key' }
  | { type: 'invalid-key' }
  | { type: 'revoked' }
  | { type: 'plan-inactive' }      // owner has no active team plan
  | { type: 'rate-limited'; limit: number; retryAfterSec: number }
  | { type: 'quota-exceeded'; field: 'requests' | 'egress' }
  | { type: 'unavailable' }

export type AuthResult =
  | { ok: true;  caller: ApiCaller }
  | { ok: false; failure: AuthFailure }

/**
 * Service-role Supabase client — required because the API caller has no
 * cookie session. RLS would block them from reading their own api_keys row
 * via the anon key, even though the row belongs to them.
 */
function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Authenticate an inbound API request. Does NOT bump usage counters — call
 * `recordUsage()` after the route handler succeeds so we don't charge users
 * for failed requests.
 */
export async function authenticateApiRequest(req: NextRequest): Promise<AuthResult> {
  const raw = extractKeyFromHeader(req.headers.get('authorization'))
  if (!raw) return { ok: false, failure: { type: 'missing-key' } }

  const supabase = adminClient()

  // Lookup by hash — collisions are astronomically unlikely with 192 bits of
  // entropy, and unique-on-key_hash means at most one row anyway.
  const { data: key, error } = await supabase
    .from('api_keys')
    .select('id, user_id, scopes, revoked_at')
    .eq('key_hash', hashKey(raw))
    .maybeSingle()

  if (error || !key) return { ok: false, failure: { type: 'invalid-key' } }
  if (key.revoked_at) return { ok: false, failure: { type: 'revoked' } }

  const org = (await listMemberships(supabase, key.user_id)).find(isPaidOrgActive)?.org
  if (!org) return { ok: false, failure: { type: 'plan-inactive' } }

  const { data: usage, error: usageError } = await supabase.from('api_key_monthly_usage')
    .select('requests, egress_bytes').eq('key_id', key.id).eq('period', currentUsagePeriod()).maybeSingle()
  if (usageError) return { ok: false, failure: { type: 'unavailable' } }
  const requests = usage?.requests ?? 0
  const egress = Number(usage?.egress_bytes ?? 0)
  if (requests >= MAX_REQUESTS_PER_MONTH) return { ok: false, failure: { type: 'quota-exceeded', field: 'requests' } }
  if (egress >= MAX_EGRESS_BYTES_PER_MONTH) return { ok: false, failure: { type: 'quota-exceeded', field: 'egress' } }

  // Per-minute rate limit, fixed window, atomic in Postgres. Fail OPEN on
  // RPC errors: a transient DB hiccup on the counter must not take the whole
  // API down — the monthly quota still backstops abuse.
  const limit = org.api_rate_per_min || DEFAULT_RATE_PER_MIN
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
  let usedThisWindow = 1
  const { data: bumped, error: rateErr } = await supabase.rpc('bump_rate_counter', {
    p_key_id: key.id,
    p_window: windowStart,
  })
  if (!rateErr && typeof bumped === 'number') {
    usedThisWindow = bumped
    if (bumped > limit) {
      const retryAfterSec = 60 - Math.floor((Date.now() % 60_000) / 1000)
      return { ok: false, failure: { type: 'rate-limited', limit, retryAfterSec } }
    }
  } else if (rateErr) {
    console.error('[api-auth] rate counter failed (failing open):', rateErr)
  }

  return {
    ok: true,
    caller: {
      keyId:                 key.id,
      userId:                key.user_id,
      orgId:                 org.id,
      orgName:               org.name,
      scopes:                key.scopes ?? [],
      requestsThisMonth:     requests,
      egressBytesThisMonth:  egress,
      rateLimitPerMin:       limit,
      rateUsedThisWindow:    usedThisWindow,
    },
  }
}

export function currentUsagePeriod(now = new Date()): string {
  return `${now.toISOString().slice(0, 7)}-01`
}

type UsageResult =
  | { ok: true; requests: number; egressBytes: number }
  | { ok: false; failure: AuthFailure }

/** Books a successful response before its signed URLs or metadata are returned. */
export async function recordUsage(caller: ApiCaller, bytes = 0): Promise<UsageResult> {
  const { data, error } = await adminClient().rpc('consume_api_quota', {
    p_key: caller.keyId,
    p_org: caller.orgId,
    p_bytes: Math.max(0, Math.ceil(bytes)),
    p_request_limit: MAX_REQUESTS_PER_MONTH,
    p_egress_limit: MAX_EGRESS_BYTES_PER_MONTH,
  })
  if (error || !data) {
    console.error('[api-auth] failed to record quota', error)
    return { ok: false, failure: { type: 'unavailable' } }
  }
  if (data.result === 'requests' || data.result === 'egress') {
    return { ok: false, failure: { type: 'quota-exceeded', field: data.result } }
  }
  if (data.result === 'revoked' || data.result === 'plan-inactive') {
    return { ok: false, failure: { type: data.result } }
  }
  if (data.result !== 'ok') return { ok: false, failure: { type: 'unavailable' } }
  return { ok: true, requests: Number(data.requests), egressBytes: Number(data.egress_bytes) }
}

/** Convert an AuthFailure into the JSON 4xx response we return to the caller. */
export function failureResponse(failure: AuthFailure): NextResponse {
  const body = failureBody(failure)
  const headers: Record<string, string> = {}
  if (failure.type === 'rate-limited') {
    headers['Retry-After']           = String(failure.retryAfterSec)
    headers['X-RateLimit-Limit']     = String(failure.limit)
    headers['X-RateLimit-Remaining'] = '0'
  }
  return NextResponse.json(body, { status: body.status, headers })
}

function failureBody(failure: AuthFailure) {
  switch (failure.type) {
    case 'unavailable':
      return { status: 503, error: 'usage_unavailable', message: 'API usage is temporarily unavailable. Try again shortly.' }
    case 'missing-key':
      return {
        status: 401,
        error:  'missing_api_key',
        message: 'Provide your key as `Authorization: Bearer lm_live_…`. Generate one at https://lenga-maps.com/dashboard/api-keys.',
      }
    case 'invalid-key':
      return {
        status: 401,
        error:  'invalid_api_key',
        message: 'This key is not recognised. It may have been revoked or never existed.',
      }
    case 'revoked':
      return {
        status: 401,
        error:  'revoked_api_key',
        message: 'This key was revoked. Generate a new one at https://lenga-maps.com/dashboard/api-keys.',
      }
    case 'plan-inactive':
      return {
        status: 403,
        error:  'plan_inactive',
        message: 'API access is part of "For Project Teams and Businesses". Request a quote at https://www.lengamaps.com/projects.',
      }
    case 'rate-limited':
      return {
        status:  429,
        error:   'rate_limited',
        message: `You've exceeded ${failure.limit} requests/minute. Slow down and retry in ${failure.retryAfterSec}s, or email lengamaps@gmail.com for a higher limit.`,
      }
    case 'quota-exceeded':
      return {
        status:  429,
        error:   'quota_exceeded',
        message: failure.field === 'requests'
          ? `You've hit the ${MAX_REQUESTS_PER_MONTH.toLocaleString()} requests/month cap. Email lengamaps@gmail.com to discuss higher limits.`
          : `You've hit the ${MAX_EGRESS_BYTES_PER_MONTH / (1024 ** 3)} GB egress/month cap. Email lengamaps@gmail.com to discuss higher limits.`,
        field:   failure.field,
      }
  }
}
