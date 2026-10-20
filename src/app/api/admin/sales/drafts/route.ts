/**
 * GET /api/admin/sales/drafts?status=draft|sent|discarded|all&pipeline=sales|partner
 * — the researched first emails waiting in the Drafts tab (sales) or the
 * Partnerships drafts (partner), each with its organisation and person,
 * plus how many outreach emails went out today (both pipelines: one domain).
 *
 * Admin only. Listing never sends anything.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, jsonError, requireAdmin } from '@/lib/sales/server'
import { DRAFTS_PER_DAY } from '@/lib/sales/playbook'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const status = req.nextUrl.searchParams.get('status') || 'draft'
  const pipeline = req.nextUrl.searchParams.get('pipeline') === 'partner' ? 'partner' : 'sales'

  let q = db.from('sales_drafts')
    .select('id, account_id, contact_id, subject, body, research, sources, batch, status, sent_at, created_at, updated_at, account:sales_accounts!inner(id, name, country_iso3, sector, website, stage, pipeline), contact:sales_contacts(id, name, title, email, linkedin_url, opted_out_at)')
    .eq('account.pipeline', pipeline).order('created_at', { ascending: true }).limit(500)
  if (status !== 'all') q = q.eq('status', status)
  const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0)
  const [drafts, counts, today] = await Promise.all([
    q,
    db.from('sales_drafts').select('status, account:sales_accounts!inner(pipeline)').eq('account.pipeline', pipeline),
    db.from('sales_activities').select('id', { count: 'exact', head: true })
      .eq('kind', 'email').eq('direction', 'out').gte('created_at', midnight.toISOString()),
  ])
  if (drafts.error) {
    console.error('[admin/sales/drafts] list failed', drafts.error)
    return jsonError('list_failed', 500, 'Could not load the drafts. Has migration 049 been applied?')
  }
  const tally = { draft: 0, sent: 0, discarded: 0 }
  for (const r of counts.data ?? []) tally[r.status as keyof typeof tally]++
  return NextResponse.json({ drafts: drafts.data ?? [], counts: tally, sent_today: today.count ?? 0, per_day: DRAFTS_PER_DAY })
}
