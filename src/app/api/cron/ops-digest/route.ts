/**
 * GET /api/cron/ops-digest — daily health report to the owners (Vercel
 * Cron, 06:00 UTC = 08:00 Lusaka). Requires CRON_SECRET like the other job.
 */
import { NextRequest, NextResponse } from 'next/server'
import { logEvent, recordCron } from '@/lib/ops/log'
import { sendDailyReport } from '@/lib/ops/report'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    await logEvent('error', 'jobs', 'cron_unauthorised', 'The daily report was called without the right CRON_SECRET, so it did not run.', {})
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  try {
    const r = await sendDailyReport(false)
    await recordCron('ops-digest', r.sent, r)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    await recordCron('ops-digest', false, { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
