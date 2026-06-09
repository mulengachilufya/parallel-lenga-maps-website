/**
 * GET /api/cron/lifecycle-emails
 *
 * Runs daily (Vercel Cron). Sends the two time-based lifecycle emails in a
 * single pass so we stay within the Hobby-plan cron limit:
 *
 *   1. Trial-ended — users whose 72h free trial lapsed without converting,
 *      bounded to the last 7 days so a first deploy doesn't blast every
 *      historical churned account. Dedup via trial_ended_email_sent_at.
 *      CTA → /pricing.
 *
 *   2. Dormant-subscriber nudge — active subscribers who signed up more
 *      than 3 days ago and have downloaded exactly zero datasets. Dedup
 *      via nudge_email_sent_at. CTA → /atlas.
 *
 * The welcome email is event-driven (init-profile), not here.
 *
 * Auth: requires CRON_SECRET in the Authorization header. Vercel Cron sets
 * this automatically on production runs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, trialEndedEmail, nudgeEmail } from '@/lib/email'
import { TRIAL_DURATION_MS } from '@/lib/pricing'

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

  const now      = Date.now()
  const expiry   = new Date(now - TRIAL_DURATION_MS).toISOString()        // trial started before this = expired
  const sevenAgo = new Date(now - 7 * 86_400_000 - TRIAL_DURATION_MS).toISOString() // lower bound for "recent"
  const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString()

  // ── 1. Trial-ended pass ──────────────────────────────────────────────────
  // trial_started_at between (now - 72h - 7d) and (now - 72h): trial lapsed
  // in the last week. Not converted (plan_status not 'active'). Not yet
  // emailed.
  const { data: ended, error: endedErr } = await service
    .from('profiles')
    .select('id, email, full_name, plan_status, trial_started_at, trial_ended_email_sent_at')
    .not('trial_started_at', 'is', null)
    .lte('trial_started_at', expiry)
    .gte('trial_started_at', sevenAgo)
    .is('trial_ended_email_sent_at', null)

  if (endedErr) console.error('[lifecycle] trial-ended query failed:', endedErr)

  let trialEndedSent = 0
  for (const p of ended ?? []) {
    if (p.plan_status === 'active') continue // converted — don't send
    if (!p.email) continue
    const ok = await sendEmail(trialEndedEmail(p.email, p.full_name))
    if (ok) {
      trialEndedSent++
      await service
        .from('profiles')
        .update({ trial_ended_email_sent_at: new Date().toISOString() })
        .eq('id', p.id)
    }
  }

  // ── 2. Dormant-subscriber nudge ──────────────────────────────────────────
  // Active subscribers, signed up > 3 days ago, never downloaded, not yet
  // nudged.
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
    trial_ended_sent: trialEndedSent,
    trial_ended_candidates: (ended ?? []).length,
    nudges_sent: nudgesSent,
    nudge_candidates: (dormant ?? []).length,
  })
}
