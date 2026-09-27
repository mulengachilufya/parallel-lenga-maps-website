/**
 * POST /api/ops/action — { action, ...input } one of the fix-it tools in
 * lib/ops/actions.ts. Owners/admins or an emergency-key session only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runAction } from '@/lib/ops/actions'
import { requireOps } from '@/lib/ops/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireOps()
  if ('denied' in gate) return gate.denied
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = typeof body.action === 'string' ? body.action : ''
  try {
    const r = await runAction(gate, action, body)
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, message: `Something went wrong: ${e instanceof Error ? e.message : e}` }, { status: 500 })
  }
}
