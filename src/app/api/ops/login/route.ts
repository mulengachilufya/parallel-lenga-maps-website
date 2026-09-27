/**
 * POST /api/ops/login — { key } → an 8-hour ops session from an emergency
 * key. For when email sign-in isn't available. See lib/ops/auth.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { makeEmergencySession, OPS_COOKIE, tryEmergencyKey } from '@/lib/ops/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { key?: unknown }
  const key = typeof body.key === 'string' ? body.key.slice(0, 200) : ''
  if (!key) return NextResponse.json({ error: 'Enter a key.' }, { status: 400 })
  const r = await tryEmergencyKey(req, key)
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 403 })
  const res = NextResponse.json({ ok: true, label: r.label })
  res.cookies.set(OPS_COOKIE, makeEmergencySession(r.label), {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 8 * 3600,
  })
  return res
}
