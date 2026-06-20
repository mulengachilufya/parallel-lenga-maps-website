// src/lib/rate-limit.ts
//
// Per-IP fixed-window rate limiting for public, unauthenticated POST routes.
// Backed by the bump_ip_rate_counter() Postgres function (migration 026),
// so the count is correct across all serverless instances — an in-memory
// Map would reset per cold start and per region and is useless on Vercel.
//
// Design choice — FAIL OPEN: if the counter RPC errors (DB blip), we ALLOW
// the request. For these endpoints a false block costs a real sales lead or
// newsletter signup, which is worse than letting a few spam rows through
// during a transient outage. Abuse during a DB hiccup is bounded and rare.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

/**
 * Best-effort client IP. Vercel sets x-forwarded-for; the FIRST hop is the
 * real client (subsequent hops are proxies). Falls back to x-real-ip, then
 * a constant so a missing header doesn't crash — it just means those callers
 * share one bucket (acceptable; they're rare).
 */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export interface RateLimitResult {
  ok:        boolean
  count:     number   // how many hits this IP has in the current window
  limit:     number
  retryAfter: number  // seconds until the window rolls over
}

/**
 * Fixed-window per-IP limiter. `limit` requests allowed per `windowSeconds`.
 * Returns ok=false once the count EXCEEDS the limit within the window.
 */
export async function checkIpRateLimit(
  service: SupabaseClient,
  prefix: string,
  ip: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const windowMs    = windowSeconds * 1000
  const now         = Date.now()
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs)
  const retryAfter  = Math.ceil((windowStart.getTime() + windowMs - now) / 1000)
  const bucket      = `${prefix}:${ip}`

  const { data, error } = await service.rpc('bump_ip_rate_counter', {
    p_bucket: bucket,
    p_window: windowStart.toISOString(),
  })

  if (error || typeof data !== 'number') {
    // Fail open (see file header).
    if (error) console.error('[rate-limit] counter rpc failed (allowing):', error.message)
    return { ok: true, count: 0, limit, retryAfter }
  }

  return { ok: data <= limit, count: data, limit, retryAfter }
}

/** Standard 429 JSON body + Retry-After header for a tripped limiter. */
export function rateLimitedResponse(
  result: RateLimitResult,
  message = 'Too many requests. Please wait a moment and try again.',
) {
  return Response.json(
    { error: 'rate_limited', message },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
  )
}
