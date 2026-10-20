/**
 * GET  /api/admin/sales/partners — every partner in the Partnerships
 *                                  pipeline with its partnership, main
 *                                  person and how many people we have there.
 * POST /api/admin/sales/partners — add a partner: { name, track, country_iso3?,
 *                                  sector?, website?, we_give?, we_get?,
 *                                  revenue_model?, document?, next_step?,
 *                                  contact?: { name, title?, email?, linkedin_url? } }
 *
 * Admin only. Nothing here contacts anyone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { accountPatch, contactFields, db, jsonError, logActivity, requireAdmin } from '@/lib/sales/server'
import { partnershipPatch } from '@/lib/sales/partners-server'
import { track as trackInfo, type PartnerTrack } from '@/lib/sales/partnerships'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied

  const [accounts, partnerships, contacts] = await Promise.all([
    db.from('sales_accounts').select('id, name, country_iso3, sector, website, priority, last_touch_at, created_at')
      .eq('pipeline', 'partner').limit(2000),
    db.from('sales_partnerships').select('*').limit(2000),
    db.from('sales_contacts').select('id, account_id, name, title, email, linkedin_url, is_primary').limit(10000),
  ])
  if (accounts.error || partnerships.error) {
    console.error('[admin/sales/partners] list failed', accounts.error ?? partnerships.error)
    return jsonError('list_failed', 500, 'Could not load partners. Has migration 051 been applied?')
  }
  const byAccount = new Map((partnerships.data ?? []).map((p) => [p.account_id as string, p]))
  const people = new Map<string, NonNullable<typeof contacts.data>>()
  for (const c of contacts.data ?? []) people.set(c.account_id, [...(people.get(c.account_id) ?? []), c])

  const partners = (accounts.data ?? []).filter((a) => byAccount.has(a.id)).map((a) => {
    const cs = people.get(a.id) ?? []
    return { ...a, partnership: byAccount.get(a.id), contact: cs.find((c) => c.is_primary) ?? cs[0] ?? null, contact_count: cs.length }
  })
  return NextResponse.json({ partners })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const fields = accountPatch(body)
  if (!fields.name) return jsonError('validation', 400, 'The partner needs a name.')
  const p = partnershipPatch(body)
  if (!p.track) return jsonError('validation', 400, 'Pick a track: how this partner gets Lenga Maps used.')

  const now = new Date().toISOString()
  const { data: account, error } = await db.from('sales_accounts')
    .insert({ ...fields, pipeline: 'partner', stage: 'target', stage_history: { target: now } }).select('*').single()
  if (error || !account) return jsonError('create_failed', 500, error?.message)
  const { error: pe } = await db.from('sales_partnerships')
    .insert({ ...p, account_id: account.id, document: p.document ?? trackInfo(p.track as PartnerTrack).doc, stage_history: { identified: now } })
  if (pe) return jsonError('create_failed', 500, pe.message)

  const c = body.contact && typeof body.contact === 'object' ? contactFields(body.contact as Record<string, unknown>) : null
  if (c?.name) await db.from('sales_contacts').insert({ ...c, account_id: account.id, is_primary: true })
  await logActivity({ account_id: account.id, kind: 'system', subject: `Added as a partner (${trackInfo(p.track as PartnerTrack).label})`, created_by: gate.email })
  return NextResponse.json({ ok: true, id: account.id })
}
