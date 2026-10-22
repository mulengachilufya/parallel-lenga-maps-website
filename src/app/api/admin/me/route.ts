import { NextResponse } from 'next/server'
import { currentAccess } from '@/lib/staff'

/**
 * GET /api/admin/me
 *
 * Lightweight check: can the signed-in user open /admin, and which parts?
 * Returns { isAdmin, isOwner, full, areas }. Always 200 so the dashboard
 * header can fetch this without retry/ceremony. ADMIN_EMAILS and the staff
 * table are server-only, so the browser asks here.
 */
export async function GET() {
  const a = await currentAccess()
  return NextResponse.json({
    isAdmin: !!a,
    isOwner: !!a?.owner,
    full: !!a?.full,
    areas: a?.areas ?? [],
  })
}
