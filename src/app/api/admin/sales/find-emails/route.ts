/**
 * POST /api/admin/sales/find-emails { pipeline? } — check the next prospects
 * for a published company inbox on their own website (see
 * src/lib/sales/find-emails.ts). One small batch per call so each stays
 * inside the function time limit; the page calls it again until none are left.
 *
 * Admin only. No paid service and no AI are used.
 */
import { NextRequest, NextResponse } from 'next/server'
import { jsonError, requireAdmin } from '@/lib/sales/server'
import { scanBatch } from '@/lib/sales/find-emails'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  try {
    return NextResponse.json(await scanBatch(body.pipeline === 'partner' ? 'partner' : 'sales'))
  } catch (e) {
    console.error('[admin/sales/find-emails] failed', e)
    return jsonError('scan_failed', 500, 'Could not check websites. Has migration 058 been applied?')
  }
}
