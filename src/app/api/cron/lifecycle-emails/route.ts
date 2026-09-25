/**
 * GET /api/cron/lifecycle-emails
 *
 * Runs daily (Vercel Cron).
 *
 *   Dormant-subscriber nudge - active (paid) accounts that signed up more
 *   than 3 days ago and have downloaded exactly zero datasets. Dedup via
 *   nudge_email_sent_at. CTA -> /atlas.
 *
 * The trial-ended pass that used to run here is gone - there's no more
 * trial in the once-off model. The welcome email is event-driven
 * (init-profile), not here.
 *
 * Auth: requires CRON_SECRET in the Authorization header. Vercel Cron sets
 * this automatically on production runs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, nudgeEmail } from '@/lib/email'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const now = Date.now()
  const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString()

  // Active (paid) accounts, signed up > 3 days ago, never downloaded, not
  // yet nudged.
  const { data: dormant, error: dormErr } = await service
    .from('profiles')
    .select('id, email, full_name, plan_status, downloads_used, created_at, nudge_email_sent_at')
    .eq('plan_status', 'active')
    .eq('downloads_used', 0)
    .lte('created_at', threeDaysAgo)
    .is('nudge_email_sent_at', null)

  if (dormErr) console.error('[lifecycle] dormant query failed:', dormErr)

  let nudgesSent = 0
  for (const p of dormant ?? []) {
    if (!p.email) continue
    const ok = await sendEmail(nudgeEmail(p.email, p.full_name))
    if (ok) {
      nudgesSent++
      await service
        .from('profiles')
        .update({ nudge_email_sent_at: new Date().toISOString() })
        .eq('id', p.id)
    }
  }

  return NextResponse.json({
    ok: true,
    checked_at: new Date(now).toISOString(),
    nudges_sent: nudgesSent,
    nudge_candidates: (dormant ?? []).length,
  })
}
