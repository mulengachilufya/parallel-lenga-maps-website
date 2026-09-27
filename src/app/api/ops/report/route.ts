/**
 * POST /api/ops/report — a visitor's browser reports an error it hit.
 * Public, so tightly limited: 20 reports per address per hour, short text
 * only, and nothing personal is stored (see scrub in lib/ops/log).
 */
import { NextRequest, NextResponse } from 'next/server'
import { logEvent, opsDb } from '@/lib/ops/log'
import { checkIpRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rl = await checkIpRateLimit(opsDb(), 'ops-report', clientIp(req), 20, 3600)
  if (!rl.ok) return new NextResponse(null, { status: 204 })
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const message = typeof b.message === 'string' ? b.message.slice(0, 300) : ''
  const path = typeof b.path === 'string' ? b.path.slice(0, 200) : ''
  if (!message) return new NextResponse(null, { status: 204 })
  // Noise that says nothing about Lenga's code.
  if (/ResizeObserver loop|Script error\.?$|extension:\/\/|NetworkError when attempting|Load failed|AbortError/i.test(message)) {
    return new NextResponse(null, { status: 204 })
  }
  const pageKey = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
  await logEvent('warn', 'browser', 'error', `On ${pageKey || 'a page'}: ${message}`, { path: pageKey, agent: (req.headers.get('user-agent') ?? '').slice(0, 120) },
    `browser:error:${pageKey}:${message.slice(0, 80)}`)
  return new NextResponse(null, { status: 204 })
}
