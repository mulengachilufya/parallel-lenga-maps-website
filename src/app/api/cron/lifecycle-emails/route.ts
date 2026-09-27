/**
 * GET /api/cron/lifecycle-emails
 *
 * Runs daily (Vercel Cron).
 *
 *   Dormant-subscriber nudge - active (paid) accounts that signed up more
 *   than 3 days ago and have downloaded exactly zero datasets. Dedup via
 *   nudge_email_sent_at. CTA -> /atlas.
 *
 *   Access periods - paid plans last 3 months (plan_expires_at, and
 *   organizations.access_expires_at for teams). A week before the end the
 *   customer (or team owner) gets one reminder; on expiry the account flips
 *   to plan_status 'free' (plan is kept, so a renewal restores it) and gets
 *   an "ended" email. Rows with no expiry are grandfathered and never touched.
 *   Read-time checks (getUserState / isOrgActive) already refuse expired
 *   access, so this pass is housekeeping and email, not the gate.
 *
 * There is no trial any more. The welcome email is event-driven
 * (init-profile), not here.
 *
 * Auth: requires CRON_SECRET in the Authorization header. Vercel Cron sets
 * this automatically on production runs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runLifecycle } from '@/lib/jobs/lifecycle'
import { logEvent, recordCron } from '@/lib/ops/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    await logEvent('error', 'jobs', 'cron_unauthorised', 'The daily job was called without the right CRON_SECRET, so it did not run.', {})
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  try {
    const summary = await runLifecycle()
    await recordCron('lifecycle', true, summary)
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    await recordCron('lifecycle', false, { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
