/**
 * GET /api/account/access — what the signed-in account can download:
 * { state, paid, datasets, personal: { picks, left }, team }.
 * The download gate, the dashboard and the pickers all read this, so the
 * browser never works out entitlements by itself.
 */
import { NextResponse } from 'next/server'
import { callerAccess } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await callerAccess()
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(access, { headers: { 'Cache-Control': 'no-store' } })
}
