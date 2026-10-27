/**
 * PATCH /api/admin/sales/linkedin/:contactId — move someone along the
 * LinkedIn track, or edit what we have on them. Body, any of:
 *   { linkedin_url }              their profile (saved on the contact)
 *   { hook }                      what we noticed about them, used in the messages
 *   { message: { kind, text } }   an edited connect / thank / pitch message
 *   { action, text?, reason? }    a step done: requested | connected | thanked |
 *                                 comment1 | comment2 | pitched | replied |
 *                                 meeting | closed, or 'undo' for the latest step
 *
 * Steps land on the account's timeline, and the account's stage follows
 * (first message → Contacted, a reply → Replied, a call booked → Meeting).
 * Nothing is sent from here: the founder sends every message on LinkedIn.
 */
import { after, NextRequest, NextResponse } from 'next/server'
import { db, isUuid, jsonError, loadAccount, logActivity, requireAdmin, str, touched } from '@/lib/sales/server'
import { LI_ACTION_FIELD, LI_CLOSE_REASONS, LI_ORDER, cleanProfileUrl, type LiAction, type LiMessage } from '@/lib/sales/linkedin'

export const dynamic = 'force-dynamic'

const TIMELINE: Partial<Record<LiAction, string>> = {
  requested: 'Sent a LinkedIn connection request',
  connected: 'Accepted the LinkedIn connection',
  thanked:   'Sent a LinkedIn thank-you message',
  comment1:  'Commented on one of their LinkedIn posts',
  comment2:  'Commented on another of their LinkedIn posts',
  pitched:   'Sent the Lenga Maps message on LinkedIn',
  replied:   'Replied on LinkedIn',
  meeting:   'Booked a video call from LinkedIn',
  closed:    'Closed on LinkedIn',
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { contactId } = await params
  if (!isUuid(contactId)) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const { data: contact } = await db.from('sales_contacts').select('id, account_id, name, linkedin_url').eq('id', contactId).maybeSingle()
  if (!contact) return jsonError('not_found', 404, 'That person is no longer in the pipeline.')
  const { data: existing } = await db.from('sales_linkedin').select('*').eq('contact_id', contactId).maybeSingle()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { contact_id: contactId, account_id: contact.account_id, updated_at: now }

  if ('linkedin_url' in body) {
    const url = body.linkedin_url === '' || body.linkedin_url === null ? null : cleanProfileUrl(body.linkedin_url)
    if (body.linkedin_url && !url) return jsonError('validation', 400, 'Paste the address of their profile, the one with linkedin.com/in/ in it.')
    await db.from('sales_contacts').update({ linkedin_url: url }).eq('id', contactId)
    contact.linkedin_url = url
  }
  // The decision maker found on LinkedIn, replacing a role placeholder.
  const name = str(body.name, 120)
  if (name) {
    const title = str(body.title, 160)
    await db.from('sales_contacts').update({ name, ...(title ? { title } : {}) }).eq('id', contactId)
    contact.name = name
  }
  if ('hook' in body) patch.hook = str(body.hook, 300)
  if (body.message && typeof body.message === 'object') {
    const m = body.message as { kind?: unknown; text?: unknown }
    if (m.kind !== 'connect' && m.kind !== 'thank' && m.kind !== 'pitch') return jsonError('validation', 400, 'Unknown message.')
    patch.messages = { ...(existing?.messages ?? {}), [m.kind as LiMessage]: str(m.text, 5000) }
  }

  const action = body.action
  let logged: LiAction | null = null
  if (action === 'undo') {
    const last = [...LI_ORDER].reverse().find((a) => existing?.[LI_ACTION_FIELD[a]])
    if (!last) return jsonError('nothing_to_undo', 400, 'Nothing to undo yet.')
    patch[LI_ACTION_FIELD[last]] = null
    if (last === 'closed') patch.closed_reason = null
  } else if (typeof action === 'string') {
    if (!(action in LI_ACTION_FIELD)) return jsonError('validation', 400, 'Unknown step.')
    const a = action as LiAction
    if (a === 'requested' && !contact.linkedin_url) return jsonError('no_profile', 400, `Add ${contact.name}'s LinkedIn profile first.`)
    patch[LI_ACTION_FIELD[a]] = now
    if (a === 'closed') patch.closed_reason = LI_CLOSE_REASONS.includes(String(body.reason)) ? String(body.reason) : 'Other'
    logged = a
  }

  const { data: row, error } = await db.from('sales_linkedin').upsert(patch, { onConflict: 'contact_id' }).select('*').single()
  if (error) {
    console.error('[admin/sales/linkedin] save failed', error)
    return jsonError('save_failed', 500, 'Could not save. Has migration 050 been applied?')
  }

  // The save is what the founder waits for. The timeline entry and the account's stage follow
  // after the reply is sent, so a slow write there can never leave the button spinning.
  if (logged) {
    const step = logged
    const text = str(body.text, 5000)
    after(async () => {
      try {
        const account = await loadAccount(contact.account_id)
        if (account) {
          const inbound = step === 'connected' || step === 'replied'
          const reason = step === 'closed' ? ` Reason: ${row.closed_reason}.` : ''
          await logActivity({
            account_id: account.id, contact_id: contact.id, kind: step === 'replied' ? 'reply' : step === 'meeting' ? 'meeting' : 'linkedin',
            direction: inbound ? 'in' : step === 'closed' ? null : 'out',
            subject: `${TIMELINE[step]}${inbound ? ` (${contact.name})` : ''}`,
            body: `${text ?? ''}${reason}`.trim() || null,
            meta: { channel: 'linkedin', step: step }, created_by: gate.email,
          })
          if (step !== 'closed' && step !== 'connected') {
            await touched(account, step === 'replied' ? 'reply' : step === 'meeting' ? 'meeting' : 'linkedin', inbound ? 'in' : 'out', gate.email)
          }
        }
      } catch (e) { console.error('[admin/sales/linkedin] timeline failed', e) }
    })
  }
  return NextResponse.json({ ok: true, li: row, linkedin_url: contact.linkedin_url, name: contact.name })
}