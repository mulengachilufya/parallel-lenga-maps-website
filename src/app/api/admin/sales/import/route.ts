/**
 * POST /api/admin/sales/import — add many prospects at once from a pasted
 * list. { rows: [{ name, country, sector?, website?, contact_name?,
 * contact_title?, contact_email?, contact_linkedin? }] }
 *
 * Countries may be an ISO3 code or a country name. Organisations already in
 * the pipeline (same name and country) are skipped, not duplicated; a new
 * contact on an existing organisation is added to it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { AFRICAN_COUNTRIES } from '@/lib/workspace/templates'
import { SECTORS } from '@/lib/sales/playbook'
import { contactFields, db, jsonError, requireAdmin, str } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

function country(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (!s) return null
  const hit = AFRICAN_COUNTRIES.find((c) => c.iso3.toLowerCase() === s || c.name.toLowerCase() === s)
    ?? AFRICAN_COUNTRIES.find((c) => c.name.toLowerCase().startsWith(s) || s.startsWith(c.name.toLowerCase()))
  return hit?.iso3 ?? null
}

function sector(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (!s) return null
  return SECTORS.find((x) => x.id === s || x.label.toLowerCase().includes(s) || s.includes(x.id))?.id ?? 'other'
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  let body: { rows?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) as Record<string, unknown>[] : []
  if (!rows.length) return jsonError('validation', 400, 'Nothing to import.')

  const { data: existing } = await db.from('sales_accounts').select('id, name, country_iso3').limit(5000)
  const key = (n: string, c: string | null) => `${n.trim().toLowerCase()}|${c ?? ''}`
  const known = new Map((existing ?? []).map((a) => [key(a.name, a.country_iso3), a.id as string]))

  let added = 0, contactsAdded = 0, skipped = 0
  const problems: string[] = []
  const now = new Date().toISOString()

  for (const [i, r] of rows.entries()) {
    const name = str(r.name, 200)
    if (!name) { problems.push(`Row ${i + 1}: no organisation name`); continue }
    const iso3 = country(r.country)
    if (r.country && !iso3) problems.push(`Row ${i + 1} (${name}): did not recognise the country "${String(r.country)}"`)

    let accountId = known.get(key(name, iso3))
    if (accountId) skipped++
    else {
      const { data, error } = await db.from('sales_accounts').insert({
        name, country_iso3: iso3, sector: sector(r.sector), website: str(r.website, 300),
        source: 'outbound', stage: 'target', stage_history: { target: now },
      }).select('id').single()
      if (error || !data) { problems.push(`Row ${i + 1} (${name}): ${error?.message ?? 'could not add'}`); continue }
      accountId = data.id as string
      known.set(key(name, iso3), accountId)
      added++
    }

    const c = contactFields({ name: r.contact_name, title: r.contact_title, email: r.contact_email, linkedin_url: r.contact_linkedin })
    if (c.name) {
      const { data: dup } = await db.from('sales_contacts').select('id').eq('account_id', accountId).ilike('name', c.name).maybeSingle()
      if (!dup) {
        const { count } = await db.from('sales_contacts').select('id', { count: 'exact', head: true }).eq('account_id', accountId)
        await db.from('sales_contacts').insert({ ...c, account_id: accountId, is_primary: !count })
        contactsAdded++
      }
    }
  }

  return NextResponse.json({ ok: true, added, contactsAdded, skipped, problems: problems.slice(0, 50) })
}
