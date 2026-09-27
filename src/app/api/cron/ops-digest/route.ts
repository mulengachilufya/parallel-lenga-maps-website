/**
 * GET /api/cron/ops-digest — daily health report to the owners (Vercel
 * Cron, 06:00 UTC = 08:00 Lusaka), then the sales job: won teams that are
 * in and working move to Acquired, and the morning sales list goes out.
 * Requires CRON_SECRET like the other job.
 */
import { NextRequest, NextResponse } from 'next/server'
import { logEvent, recordCron } from '@/lib/ops/log'
import { sendDailyReport } from '@/lib/ops/report'
import { runSalesJob } from '@/lib/sales/digest'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    await logEvent('error', 'jobs', 'cron_unauthorised', 'The daily report was called without the right CRON_SECRET, so it did not run.', {})
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  let ok = true
  const out: Record<string, unknown> = {}
  try {
    const r = await sendDailyReport(false)
    await recordCron('ops-digest', r.sent, r)
    out.report = r
  } catch (e) {
    ok = false
    await recordCron('ops-digest', false, { error: e instanceof Error ? e.message : String(e) })
  }
  try {
    const s = await runSalesJob()
    await recordCron('sales-digest', true, s)
    out.sales = s
  } catch (e) {
    ok = false
    await recordCron('sales-digest', false, { error: e instanceof Error ? e.message : String(e) })
  }
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 500 })
}
