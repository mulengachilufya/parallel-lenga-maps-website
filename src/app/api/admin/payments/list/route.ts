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
  const auth = await createServerSupabase()
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

  // Attach payer identity from profiles so the transfer can be matched to a
  // fully-identified person (name / country / sector captured at signup).
  const userIds = [...new Set((data || []).map((r) => r.user_id).filter(Boolean))]
  const profileById = new Map<string, {
    first_name: string | null; last_name: string | null
    country: string | null; sector: string | null; full_name: string | null
  }>()
  if (userIds.length) {
    const { data: profs } = await service
      .from('profiles')
      .select('id, first_name, last_name, country, sector, full_name')
      .in('id', userIds)
    for (const p of profs || []) profileById.set(p.id, p)
  }

  // Sign each screenshot for 1 hour so admin can inspect it.
  const rows = await Promise.all(
    (data || []).map(async (row) => {
      let screenshotUrl = ''
      try {
        screenshotUrl = await getDownloadUrl(row.screenshot_key, 3600)
      } catch { /* ignore */ }
      const prof = profileById.get(row.user_id)
      return {
        ...row,
        screenshot_url:     screenshotUrl,
        profile_first_name: prof?.first_name ?? null,
        profile_last_name:  prof?.last_name  ?? null,
        profile_country:    prof?.country    ?? null,
        profile_sector:     prof?.sector     ?? null,
        profile_full_name:  prof?.full_name  ?? null,
      }
    })
  )

  return NextResponse.json({ payments: rows })
}
