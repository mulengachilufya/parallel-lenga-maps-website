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
    .select('id, user_id, scopes, revoked_at, requests_this_month, egress_bytes_this_month')
    .eq('key_hash', hashKey(raw))
    .maybeSingle()

  if (error || !key) return { ok: false, failure: { type: 'invalid-key' } }
  if (key.revoked_at) return { ok: false, failure: { type: 'revoked' } }

  // Quota gates — generous limits, hard 429 on overage.
  if (key.requests_this_month >= MAX_REQUESTS_PER_MONTH) {
    return { ok: false, failure: { type: 'quota-exceeded', field: 'requests' } }
  }
  if (key.egress_bytes_this_month >= MAX_EGRESS_BYTES_PER_MONTH) {
    return { ok: false, failure: { type: 'quota-exceeded', field: 'egress' } }
  }

  // Gate: the key's owner must belong to an ACTIVE organization. Re-checked
  // on every request so suspending an org (missed renewal, cancellation)
  // kills its keys immediately — no need to revoke each key by hand.
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id, organizations!inner(id, name, status, api_rate_per_min)')
    .eq('user_id', key.user_id)
    .maybeSingle()

  const orgRaw = membership
    ? (membership as { organizations: unknown }).organizations
    : null
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as
    { id: string; name: string; status: string; api_rate_per_min: number } | null

  if (!org || org.status !== 'active') {
    return { ok: false, failure: { type: 'plan-inactive' } }
  }

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
      requestsThisMonth:     key.requests_this_month,
      egressBytesThisMonth:  key.egress_bytes_this_month,
      rateLimitPerMin:       limit,
      rateUsedThisWindow:    usedThisWindow,
    },
  }
}

/**
 * Record a successful API call against a key. Bumps requests by 1 and adds
 * `bytesEgressed` to the egress counter (passed in by the route — for
 * download endpoints this is the file size we just signed a URL for, since
 * the actual download happens out-of-band on R2).
 *
 * This is fire-and-forget — we don't block the API response on it. A failure
 * here costs us a row of accuracy on quota tracking but never an API call.
 */
export async function recordUsage(
  keyId: string,
  bytesEgressed: number = 0
): Promise<void> {
  const supabase = adminClient()
  // Atomic-enough: read-modify-write would race, but at 5000/month per key
  // the chance of two concurrent requests on the same key is tiny. If it
  // ever matters we can move to a Postgres function with FOR UPDATE.
  const { data: row } = await supabase
    .from('api_keys')
    .select('requests_this_month, egress_bytes_this_month')
    .eq('id', keyId)
    .single()

  if (!row) return

  await supabase
    .from('api_keys')
    .update({
      requests_this_month:     row.requests_this_month + 1,
      egress_bytes_this_month: row.egress_bytes_this_month + bytesEgressed,
      last_used_at:            new Date().toISOString(),
    })
    .eq('id', keyId)
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
