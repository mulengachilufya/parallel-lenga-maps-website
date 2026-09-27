/**
 * POST /api/admin/sales/:id/activity — put something on the timeline:
 *   { kind: 'note'|'call'|'meeting'|'linkedin'|'email'|'reply',
 *     contact_id?, subject?, body?, task_id? }
 *
 * 'email' here is one sent from your own inbox (Gmail), logged by hand.
 * 'reply' is them getting back to us, by any channel. Logging moves the
 * stage forward where it obviously should (see touched()), and task_id
 * ticks off the task it was for.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, isUuid, jsonError, loadAccount, logActivity, requireAdmin, str, touched } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

const KINDS = ['note', 'call', 'meeting', 'linkedin', 'email', 'reply'] as const

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const kind = KINDS.find((k) => k === body.kind)
  if (!kind) return jsonError('validation', 400, 'Unknown kind of activity.')
  const text = str(body.body, 10000)
  if (kind === 'note' && !text) return jsonError('validation', 400, 'Write the note first.')
  const direction = kind === 'reply' ? 'in' : kind === 'note' ? null : 'out'
  const channel = kind === 'reply' && typeof body.channel === 'string' ? body.channel.slice(0, 20) : undefined

  const activity = await logActivity({
    account_id: id, contact_id: isUuid(body.contact_id) ? body.contact_id : null, kind, direction,
    subject: str(body.subject, 300), body: text, meta: channel ? { channel } : {}, created_by: gate.email,
  })
  if (kind !== 'note') await touched(account, kind, direction, gate.email)
  if (isUuid(body.task_id)) {
    await db.from('sales_tasks').update({ done_at: new Date().toISOString(), outcome: 'done' })
      .eq('id', body.task_id).eq('account_id', id).is('done_at', null)
  }
  return NextResponse.json({ ok: true, activity, stage: account.stage })
}
