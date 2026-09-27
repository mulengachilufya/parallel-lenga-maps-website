/**
 * POST /api/admin/sales/:id/email — send a 1-to-1 email to a contact from
 * the founder's address: { contact_id, subject, body, template?, task_id? }
 *
 * Refused when the contact has asked not to be emailed. Replies go to the
 * founder's inbox as normal; log them here with "They replied".
 */
import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/ops/log'
import {
  db, getSettings, isUuid, jsonError, loadAccount, logActivity, requireAdmin, sendOutreach, str, touched,
} from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  if (!isUuid(body.contact_id)) return jsonError('validation', 400, 'Pick who to send it to.')
  const { data: contact } = await db.from('sales_contacts').select('*').eq('id', body.contact_id).eq('account_id', id).maybeSingle()
  if (!contact) return jsonError('not_found', 404, 'That contact no longer exists.')
  if (!contact.email) return jsonError('no_email', 400, `There is no email address for ${contact.name}. Add one, or reach them on LinkedIn.`)
  if (contact.opted_out_at) return jsonError('opted_out', 409, `${contact.name} asked not to be emailed, so this was not sent.`)

  const subject = str(body.subject, 200)
  const text = str(body.body, 20000)
  if (!subject || !text) return jsonError('validation', 400, 'The email needs a subject and a message.')
  if (/\{(first_name|company|country|sector_hook|my_name)\}|\[[a-z ]+\]/i.test(`${subject}\n${text}`)) {
    return jsonError('placeholders', 400, 'There are still placeholders in square or curly brackets. Fill them in before sending.')
  }

  const settings = await getSettings()
  const ok = await sendOutreach({
    to: contact.email, subject, body: text,
    signature: `${settings.my_name}\n${settings.signature}`, optoutToken: contact.optout_token,
  })
  if (!ok) {
    void logEvent('error', 'email', 'sales_send_failed', `An outreach email to ${account.name} could not be sent.`, { account: id })
    return jsonError('send_failed', 502, 'The email could not be sent. Check the Ops page (Health) for the email service, or send it from Gmail and log it here.')
  }

  const activity = await logActivity({
    account_id: id, contact_id: contact.id, kind: 'email', direction: 'out', subject, body: text,
    meta: { to: contact.email, template: str(body.template, 40), sent_from_site: true }, created_by: gate.email,
  })
  await touched(account, 'email', 'out', gate.email)
  if (isUuid(body.task_id)) {
    await db.from('sales_tasks').update({ done_at: new Date().toISOString(), outcome: 'done' })
      .eq('id', body.task_id).eq('account_id', id).is('done_at', null)
  }
  return NextResponse.json({ ok: true, activity, stage: account.stage })
}
