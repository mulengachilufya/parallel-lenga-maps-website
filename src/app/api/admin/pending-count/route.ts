/**
 * GET /api/admin/pending-count
 *
 * Returns the count of pending manual_payments rows. Used by the dashboard
 * header to show a red badge on the Admin button so the operator can never
 * miss new submissions, even if email / WhatsApp / Telegram all silently fail.
 *
 * Always returns 200 with `{ count: number, isAdmin: boolean }` so the
 * dashboard can fetch this without retry/ceremony. Non-admins see count=0.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET() {
  const auth = createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ isAdmin: false, count: 0 })
  }

  const { count, error } = await service
    .from('manual_payments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (error) {
    console.error('[pending-count] query failed:', error)
    return NextResponse.json({ isAdmin: true, count: 0, error: 'query_failed' })
  }

  return NextResponse.json({ isAdmin: true, count: count ?? 0 })
}
