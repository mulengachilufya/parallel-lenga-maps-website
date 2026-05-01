/**
 * Bearer-token authentication for the public REST API (`/api/v1/*`).
 *
 * Flow:
 *   1. Pull `Authorization: Bearer lm_live_…` off the request.
 *   2. Hash it and look up the row in `api_keys` (service-role client — the
 *      caller has no Supabase session).
 *   3. Reject if revoked, or if the owning profile isn't `account_type='business'`
 *      with `plan_status='active'` and `plan_expires_at` in the future
 *      (or null = lifetime/comped).
 *   4. Return the resolved user_id + key_id so the route handler can attach
 *      them to its response and bump usage counters.
 *
 * Quotas:
 *   Hard limits (`MAX_REQUESTS_PER_MONTH`, `MAX_EGRESS_BYTES_PER_MONTH`) are
 *   enforced here and intentionally generous for v1. We do NOT meter overage
 *   — if you blow the quota you get a 429 and we expect you to email us. This
 *   keeps us out of the "surprise bill" trap until we're ready for real billing.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { extractKeyFromHeader, hashKey } from './api-keys'

export const MAX_REQUESTS_PER_MONTH    = 5_000
export const MAX_EGRESS_BYTES_PER_MONTH = 50 * 1024 * 1024 * 1024  // 50 GB

/** Resolved API caller after successful auth. */
export interface ApiCaller {
  keyId:                 string
  userId:                string
  plan:                  string
  scopes:                string[]
  requestsThisMonth:     number
  egressBytesThisMonth:  number
}

/** Fail reasons surface to the caller as HTTP responses. */
export type AuthFailure =
  | { type: 'missing-key' }
  | { type: 'invalid-key' }
  | { type: 'revoked' }
  | { type: 'plan-inactive' }      // not on Business / not paid
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

  // Verify the owning profile is on an active Business plan. We re-check this
  // on every request so a downgrade or expired payment kills API access
  // immediately — no need to revoke each key by hand.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_status, plan_expires_at, account_type')
    .eq('id', key.user_id)
    .single()

  if (!profile)                                return { ok: false, failure: { type: 'plan-inactive' } }
  if (profile.plan_status !== 'active')        return { ok: false, failure: { type: 'plan-inactive' } }
  if (profile.account_type !== 'business')     return { ok: false, failure: { type: 'plan-inactive' } }
  if (profile.plan_expires_at &&
      new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return { ok: false, failure: { type: 'plan-inactive' } }
  }

  return {
    ok: true,
    caller: {
      keyId:                 key.id,
      userId:                key.user_id,
      plan:                  profile.plan ?? 'business',
      scopes:                key.scopes ?? [],
      requestsThisMonth:     key.requests_this_month,
      egressBytesThisMonth:  key.egress_bytes_this_month,
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
  return NextResponse.json(body, { status: body.status })
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
        message: 'API access requires an active Business plan. See https://lenga-maps.com/pricing.',
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
