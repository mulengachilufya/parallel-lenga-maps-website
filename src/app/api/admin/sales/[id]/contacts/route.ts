/**
 * POST   /api/admin/sales/:id/contacts — add a person { name, title?, email?,
 *                                        phone?, linkedin_url?, is_primary? }
 * PATCH  /api/admin/sales/:id/contacts — { contact_id, ...fields }
 * DELETE /api/admin/sales/:id/contacts?contact=<id>
 */
import { NextRequest, NextResponse } from 'next/server'
import { contactFields, db, isUuid, jsonError, loadAccount, requireAdmin } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function makePrimary(accountId: string, contactId: string) {
  await db.from('sales_contacts').update({ is_primary: false }).eq('account_id', accountId).neq('id', contactId)
  await db.from('sales_contacts').update({ is_primary: true }).eq('id', contactId)
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  if (!await loadAccount(id)) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }
  const c = contactFields(body)
  if (!c.name) return jsonError('validation', 400, 'The contact needs a name.')
  if (typeof body.email === 'string' && body.email.trim() && !c.email) return jsonError('validation', 400, 'That email address does not look right.')

  const { count } = await db.from('sales_contacts').select('id', { count: 'exact', head: true }).eq('account_id', id)
  const { data, error } = await db.from('sales_contacts').insert({ ...c, account_id: id, is_primary: !count }).select('*').single()
  if (error || !data) return jsonError('create_failed', 500, error?.message)
  if (body.is_primary === true && count) await makePrimary(id, data.id)
  return NextResponse.json({ ok: true, contact: data })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }
  if (!isUuid(body.contact_id)) return jsonError('validation', 400)

  const all = contactFields(body)
  const patch = Object.fromEntries(Object.entries(all).filter(([k]) => k in body))
  if ('name' in patch && !patch.name) return jsonError('validation', 400, 'The contact needs a name.')
  if (typeof body.email === 'string' && body.email.trim() && !all.email) return jsonError('validation', 400, 'That email address does not look right.')
  if (Object.keys(patch).length) {
    const { error } = await db.from('sales_contacts').update(patch).eq('id', body.contact_id).eq('account_id', id)
    if (error) return jsonError('update_failed', 500, error.message)
  }
  if (body.is_primary === true) await makePrimary(id, body.contact_id)
  if (body.opted_out === false) await db.from('sales_contacts').update({ opted_out_at: null }).eq('id', body.contact_id).eq('account_id', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const contactId = req.nextUrl.searchParams.get('contact')
  if (!isUuid(contactId)) return jsonError('validation', 400)
  await db.from('sales_contacts').delete().eq('id', contactId).eq('account_id', id)
  return NextResponse.json({ ok: true })
}
