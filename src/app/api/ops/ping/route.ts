/**
 * GET /api/ops/ping — public "is the site alive?" for the GitHub uptime
 * watch (and anyone). Checks the database and sign-in only, reveals no
 * details, and answers 503 when either is down.
 */
import { NextResponse } from 'next/server'
import { coreChecks } from '@/lib/ops/health'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const checks = await coreChecks()
    const ok = checks.every((c) => c.status !== 'fail')
    return NextResponse.json(
      { ok, at: new Date().toISOString(), parts: Object.fromEntries(checks.map((c) => [c.id, c.status])) },
      { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
