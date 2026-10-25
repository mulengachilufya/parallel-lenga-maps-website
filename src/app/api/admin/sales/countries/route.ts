/**
 * GET /api/admin/sales/countries?pipeline=sales|partner — prospects per
 * country, split into those we have contacted (an email sent or a LinkedIn
 * request sent, see src/lib/sales/reach.ts) and those not contacted yet.
 * Organisations marked lost in the old stage model are still prospects
 * here; nothing is double counted (one organisation, one country).
 *
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { allRows, db, jsonError, requireAdmin } from '@/lib/sales/server'
import { reachedAccounts } from '@/lib/sales/reach'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const pipeline = req.nextUrl.searchParams.get('pipeline') === 'partner' ? 'partner' : 'sales'
  try {
    const [accounts, reached] = await Promise.all([
      allRows((f, t) => db.from('sales_accounts').select('id, country_iso3').eq('pipeline', pipeline).order('id').range(f, t)),
      reachedAccounts(pipeline),
    ])
    if (accounts.error) throw accounts.error
    const by = new Map<string, { iso3: string | null; prospects: number; contacted: number }>()
    for (const a of accounts.data as { id: string; country_iso3: string | null }[]) {
      const k = a.country_iso3 ?? ''
      const row = by.get(k) ?? { iso3: a.country_iso3, prospects: 0, contacted: 0 }
      row.prospects++
      if (reached.has(a.id)) row.contacted++
      by.set(k, row)
    }
    const countries = [...by.values()]
      .map((r) => ({ ...r, not_contacted: r.prospects - r.contacted }))
      .sort((a, b) => b.prospects - a.prospects)
    const total = countries.reduce((s, r) => ({ prospects: s.prospects + r.prospects, contacted: s.contacted + r.contacted }), { prospects: 0, contacted: 0 })
    return NextResponse.json({ countries, total: { ...total, not_contacted: total.prospects - total.contacted } })
  } catch (e) {
    console.error('[admin/sales/countries] failed', e)
    return jsonError('list_failed', 500, 'Could not count prospects by country.')
  }
}
