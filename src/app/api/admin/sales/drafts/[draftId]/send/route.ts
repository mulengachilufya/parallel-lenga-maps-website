/**
 * POST /api/admin/sales/drafts/:draftId/send — send this researched first
 * email, exactly as shown on screen: { subject, body, over_limit? }.
 *
 * Only ever runs from an admin pressing Send. It goes out through the same
 * 1-to-1 path as the compose box (opt-out link, refused for opted-out
 * people), marks the draft sent and lays out the follow-ups: LinkedIn and a
 * call, and in South Africa no further email (POPIA s69 allows one approach).
 *
 * Past DRAFTS_PER_DAY outreach emails in a day it asks first, so a new
 * sending domain is not flagged for a burst of cold email.
 */
import { NextRequest, NextResponse } from 'next/server'
import { DRAFTS_PER_DAY } from '@/lib/sales/playbook'
import {
  db, followUpsAfterFirstEmail, isUuid, jsonError, loadAccount, logActivity, requireAdmin, sendToContact,
} from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { draftId } = await params
  if (!isUuid(draftId)) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const { data: draft } = await db.from('sales_drafts').select('*').eq('id', draftId).maybeSingle()
  if (!draft) return jsonError('not_found', 404, 'That draft no longer exists.')
  if (draft.status !== 'draft') return jsonError('not_draft', 409, draft.status === 'sent' ? 'This one has already been sent.' : 'This draft was set aside. Bring it back first.')
  const account = await loadAccount(draft.account_id)
  if (!account) return jsonError('not_found', 404, 'The organisation for this draft no longer exists.')

  const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0)
  const { count } = await db.from('sales_activities').select('id', { count: 'exact', head: true })
    .eq('kind', 'email').eq('direction', 'out').gte('created_at', midnight.toISOString())
  if ((count ?? 0) >= DRAFTS_PER_DAY && body.over_limit !== true) {
    return jsonError('daily_limit', 429, `You have sent ${count} outreach emails today. Sending more than ${DRAFTS_PER_DAY} a day from a new domain risks landing in spam. Send anyway?`)
  }

  const subject = body.subject ?? draft.subject
  const text = body.body ?? draft.body
  const sent = await sendToContact({ account, contactId: draft.contact_id, subject, body: text, by: gate.email, meta: { draft: draft.id, batch: draft.batch } })
  if (!sent.ok) return sent.res

  const now = new Date().toISOString()
  await db.from('sales_drafts').update({ status: 'sent', subject, body: text, sent_at: now, sent_by: gate.email, updated_at: now }).eq('id', draft.id)
  const { data: contact } = await db.from('sales_contacts').select('id, linkedin_url').eq('id', draft.contact_id).single()
  const steps = contact ? await followUpsAfterFirstEmail(account, contact) : 0
  if (steps) {
    await logActivity({
      account_id: account.id, contact_id: draft.contact_id, kind: 'system', created_by: gate.email,
      subject: account.country_iso3 === 'ZAF'
        ? `Follow-ups planned (${steps}): LinkedIn and a call. No more emails unless they reply (POPIA).`
        : `Follow-ups planned (${steps} steps)`,
    })
  }
  return NextResponse.json({ ok: true, followups: steps })
}
