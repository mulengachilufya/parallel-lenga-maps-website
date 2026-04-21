import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
import { getDownloadUrl } from '@/lib/r2'

/**
 * GET /api/admin/payments/list?status=pending|verified|rejected|all
 *
 * Admin-only. Lists manual payments with a 1-hour presigned screenshot URL
 * so the admin can eyeball the transfer before approving.
 *
 * Auth: requires a Supabase session AND the email must appear in
 * process.env.ADMIN_EMAILS (comma-separated).
 */

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const auth = createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const statusParam = new URL(req.url).searchParams.get('status') || 'pending'
  const wantAll = statusParam === 'all'

  const query = service
    .from('manual_payments')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(100)

  const { data, error } = wantAll ? await query : await query.eq('status', statusParam)
  if (error) {
    console.error('[admin/payments/list] query failed:', error)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  // Sign each screenshot for 1 hour so admin can inspect it.
  const rows = await Promise.all(
    (data || []).map(async (row) => {
      let screenshotUrl = ''
      try {
        screenshotUrl = await getDownloadUrl(row.screenshot_key, 3600)
      } catch { /* ignore */ }
      return { ...row, screenshot_url: screenshotUrl }
    })
  )

  return NextResponse.json({ payments: rows })
}
