import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

/**
 * GET /api/admin/me
 *
 * Lightweight check: is the currently signed-in user an admin?
 * Returns { isAdmin: boolean } — always 200 so the dashboard header can
 * fetch this without retry/ceremony. ADMIN_EMAILS is server-only, so we
 * can't check it from the browser without this endpoint.
 */
export async function GET() {
  const auth = createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  return NextResponse.json({
    isAdmin: !!user && isAdminEmail(user.email),
  })
}
