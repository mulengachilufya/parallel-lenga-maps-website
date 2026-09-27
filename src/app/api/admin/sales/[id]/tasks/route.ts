/**
 * POST  /api/admin/sales/:id/tasks — { title, due_on, kind?, contact_id? }
 * PATCH /api/admin/sales/:id/tasks — { task_id, outcome?: 'done'|'skipped'|null,
 *                                      due_on? } tick off, skip, reopen or move.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, isUuid, isoDate, jsonError, loadAccount, requireAdmin, str } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const KINDS = ['email', 'linkedin', 'call', 'meeting', 'other']

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  if (!await loadAccount(id)) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }
  const title = str(body.title, 300)
  const due_on = isoDate(body.due_on)
  if (!title || !due_on) return jsonError('validation', 400, 'A task needs a description and a date.')
  const { data, error } = await db.from('sales_tasks').insert({
    account_id: id, title, due_on,
    kind: KINDS.includes(String(body.kind)) ? body.kind : 'other',
    contact_id: isUuid(body.contact_id) ? body.contact_id : null,
    template: str(body.template, 40),
  }).select('*').single()
  if (error) return jsonError('create_failed', 500, error.message)
  return NextResponse.json({ ok: true, task: data })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }
  if (!isUuid(body.task_id)) return jsonError('validation', 400)

  const patch: Record<string, unknown> = {}
  if (body.outcome === 'done' || body.outcome === 'skipped') { patch.outcome = body.outcome; patch.done_at = new Date().toISOString() }
  if (body.outcome === null) { patch.outcome = null; patch.done_at = null }
  if (isoDate(body.due_on)) patch.due_on = body.due_on
  if (!Object.keys(patch).length) return jsonError('validation', 400)
  const { error } = await db.from('sales_tasks').update(patch).eq('id', body.task_id).eq('account_id', id)
  if (error) return jsonError('update_failed', 500, error.message)
  return NextResponse.json({ ok: true })
}
