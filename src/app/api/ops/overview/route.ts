/**
 * GET /api/ops/overview — everything the ops console shows: who you are,
 * health checks, open problems (explained), recent actions, site switches.
 */
import { NextResponse } from 'next/server'
import { requireOps } from '@/lib/ops/auth'
import { AREA_LABEL, explain } from '@/lib/ops/explain'
import { overall, runHealthChecks } from '@/lib/ops/health'
import { opsDb } from '@/lib/ops/log'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireOps()
  if ('denied' in gate) return gate.denied
  const db = opsDb()
  const [checks, problems, auditRows, settings, runs] = await Promise.all([
    runHealthChecks().catch((e) => [{ id: 'health', name: 'Health checks', status: 'fail' as const, summary: `Could not run: ${e}` }]),
    db.from('ops_events').select('*').is('resolved_at', null).order('last_at', { ascending: false }).limit(100),
    db.from('ops_audit').select('*').order('at', { ascending: false }).limit(60),
    db.from('ops_settings').select('*'),
    db.from('ops_cron_runs').select('*'),
  ])
  return NextResponse.json({
    you: gate,
    status: overall(checks),
    checks,
    problems: (problems.data ?? []).map((p) => ({ ...p, area_label: AREA_LABEL[p.area] ?? p.area, explain: explain(p.area, p.code) })),
    audit: auditRows.data ?? [],
    settings: Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value])),
    jobs: runs.data ?? [],
  }, { headers: { 'Cache-Control': 'no-store' } })
}
