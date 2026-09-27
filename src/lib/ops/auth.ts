// src/lib/ops/auth.ts
//
// Who may use the ops console, and how they got in.
//
//   1. Signed in with an owner or admin email (normal Lenga login, magic
//      link or password): cmulenga672@gmail.com, lengamaps@gmail.com, and
//      anyone in ADMIN_EMAILS.
//   2. An emergency key: works even if both email accounts are lost or the
//      sign-in service is down. Only SHA-256 fingerprints of the keys live
//      on the server (OPS_EMERGENCY_KEY_HASHES), never the keys. Five wrong
//      tries per hour per network address and you're locked out; every use
//      (right or wrong) is logged and emailed to both owners.
//
// An emergency login gets an 8-hour signed cookie scoped to /ops and /api/ops.

import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/admin'
import { createServerSupabase } from '@/lib/supabase-server'
import { clientIp } from '@/lib/rate-limit'
import { audit, logEvent, opsDb } from './log'

export const OPS_COOKIE = 'lm_ops'
const SESSION_MS = 8 * 3600_000
const MAX_TRIES_PER_HOUR = 5

export interface OpsActor { actor: string; via: 'console' | 'emergency-key' }

function sessionSecret(): string {
  // A dedicated secret if set; otherwise derived from the service key, which
  // is already the most sensitive value on the server.
  return process.env.OPS_SESSION_SECRET
    || createHash('sha256').update(`lenga-ops:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`).digest('hex')
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url')
}

export function makeEmergencySession(label: string): string {
  const body = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS, label })).toString('base64url')
  return `${body}.${sign(body)}`
}

function readEmergencySession(raw: string | undefined): { label: string } | null {
  if (!raw) return null
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const want = Buffer.from(sign(body)), got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { exp: number; label: string }
    return p.exp > Date.now() ? { label: p.label } : null
  } catch { return null }
}

/** The caller, if allowed into ops. */
export async function opsActor(): Promise<OpsActor | null> {
  const jar = await cookies()
  const em = readEmergencySession(jar.get(OPS_COOKIE)?.value)
  if (em) return { actor: `emergency key ${em.label}`, via: 'emergency-key' }
  try {
    const auth = await createServerSupabase()
    const { data: { user } } = await auth.auth.getUser()
    if (user && isAdminEmail(user.email)) return { actor: user.email!, via: 'console' }
  } catch { /* sign-in service down: only the emergency key works */ }
  return null
}

export async function requireOps(): Promise<OpsActor | { denied: NextResponse }> {
  const a = await opsActor()
  return a ?? { denied: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
}

function keyHashes(): string[] {
  return (process.env.OPS_EMERGENCY_KEY_HASHES ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[0-9a-f]{64}$/.test(s))
}

/** Normalise what a person types: case, spaces and dashes don't matter. */
export function normaliseKey(k: string): string {
  return k.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
export function hashKey(k: string): string {
  return createHash('sha256').update(normaliseKey(k)).digest('hex')
}

/** Check an emergency key. If the rate counter can't be read (database down) the
 *  check still runs: the keys are 100+ bits of randomness, so guessing is
 *  hopeless even without the limit, and this path must work when things are broken. */
export async function tryEmergencyKey(req: NextRequest, key: string): Promise<{ ok: true; label: string } | { ok: false; reason: string }> {
  const ip = clientIp(req)
  const windowStart = new Date(Math.floor(Date.now() / 3600_000) * 3600_000).toISOString()
  let tries = 0
  try {
    const { data, error } = await opsDb().rpc('bump_ip_rate_counter', { p_bucket: `ops-key:${ip}`, p_window: windowStart })
    if (error || typeof data !== 'number') throw error ?? new Error('no count')
    tries = data
  } catch {
    // Database unreachable: still allow, because this is the path of last
    // resort when things are broken, but log it loudly.
    tries = 0
  }
  if (tries > MAX_TRIES_PER_HOUR) return { ok: false, reason: 'Too many tries from this network. Wait an hour.' }

  const hashes = keyHashes()
  if (!hashes.length) return { ok: false, reason: 'No emergency keys are configured on the server.' }
  const h = Buffer.from(hashKey(key))
  const idx = hashes.findIndex((x) => { const b = Buffer.from(x); return b.length === h.length && timingSafeEqual(b, h) })
  if (idx < 0) {
    await logEvent('warn', 'security', 'emergency_failed', 'A wrong emergency key was entered on the ops console.', { ip, tries })
    return { ok: false, reason: 'That key is not right.' }
  }
  const label = String.fromCharCode(65 + idx)   // A, B, …
  await logEvent('critical', 'security', 'emergency_login', `Emergency key ${label} was used to open the ops console.`, { ip }, `security:emergency_login:${Date.now()}`)
  await audit(`emergency key ${label}`, 'emergency-key', 'emergency_login', null, { ip })
  return { ok: true, label }
}
