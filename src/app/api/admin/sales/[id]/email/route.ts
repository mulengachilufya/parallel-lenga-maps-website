/**
 * POST /api/admin/sales/:id/email — send a 1-to-1 email to a contact from
 * the founder's address: { contact_id, subject, body, template?, task_id? }
 *
 * Refused when the contact has asked not to be emailed. Replies go to the
 * founder's inbox as normal; log them here with "They replied".
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, isUuid, jsonError, loadAccount, requireAdmin, sendToContact, str } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const sent = await sendToContact({
    account, contactId: body.contact_id, subject: body.subject, body: body.body, by: gate.email,
    meta: { template: str(body.template, 40) },
  })
  if (!sent.ok) return sent.res
  if (isUuid(body.task_id)) {
    await db.from('sales_tasks').update({ done_at: new Date().toISOString(), outcome: 'done' })
      .eq('id', body.task_id).eq('account_id', id).is('done_at', null)
  }
  return NextResponse.json({ ok: true, activity: sent.activity, stage: account.stage })
}
