/**
 * GET    /api/admin/sales/:id — the account with its contacts, timeline,
 *                               tasks, and (once it has a team) how the
 *                               team is getting on.
 * PATCH  /api/admin/sales/:id — edit fields; { stage, lost_reason?,
 *                               nurture_until?, note? } moves the stage.
 * DELETE /api/admin/sales/:id — remove it and everything under it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { LOST_REASONS } from '@/lib/sales/playbook'
import {
  accountPatch, db, getSettings, isoDate, linkTeams, jsonError, loadAccount, moveStage, requireAdmin, str, teamStatus, validStage,
} from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  let account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404, 'That account no longer exists.')
  // Pick up a free team their people started since we last looked.
  if (!account.org_id && (await linkTeams(id)).length) account = (await loadAccount(id))!

  const [contacts, activities, tasks, team, settings] = await Promise.all([
    db.from('sales_contacts').select('*').eq('account_id', id).order('is_primary', { ascending: false }).order('created_at'),
    db.from('sales_activities').select('*').eq('account_id', id).order('created_at', { ascending: false }).limit(300),
    db.from('sales_tasks').select('*').eq('account_id', id).order('done_at', { ascending: false, nullsFirst: true }).order('due_on'),
    teamStatus(account.org_id),
    getSettings(),
  ])
  return NextResponse.json({
    account, contacts: contacts.data ?? [], activities: activities.data ?? [], tasks: tasks.data ?? [], team, settings,
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404, 'That account no longer exists.')
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const patch = accountPatch(body)
  if (Object.keys(patch).length) {
    const { error } = await db.from('sales_accounts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return jsonError('update_failed', 500, error.message)
  }

  if ('stage' in body) {
    const to = validStage(body.stage)
    if (!to) return jsonError('validation', 400, 'Unknown stage.')
    const lost_reason = str(body.lost_reason, 300)
    if (to === 'lost' && !lost_reason) return jsonError('validation', 400, `Say why it was lost, for example: ${LOST_REASONS[0]}.`)
    const nurture_until = isoDate(body.nurture_until)
    if (to === 'nurture' && !nurture_until) return jsonError('validation', 400, 'Pick a date to check back.')
    await moveStage(account, to, gate.email, { note: str(body.note, 2000), lost_reason, nurture_until })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404)
  await db.from('sales_accounts').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
