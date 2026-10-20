// src/lib/sales/partners-server.ts — server-only helpers for the
// Partnerships pipeline: validating edits and moving an organisation
// between the sales and partnership pipelines.

import { db, isoDate, logActivity, num, str } from './server'
import { ALL_PARTNER_STAGES, DOCUMENTS, TRACKS, partnerStageLabel, track as trackInfo, type PartnerStage, type PartnerTrack } from './partnerships'

/** The partnership fields present in a request body, validated. */
export function partnershipPatch(body: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {}
  if (typeof body.track === 'string' && TRACKS.some((t) => t.id === body.track)) p.track = body.track
  if ('document' in body) p.document = DOCUMENTS.some((d) => d.id === body.document) ? body.document : null
  if ('we_give' in body) p.we_give = str(body.we_give, 2000)
  if ('we_get' in body) p.we_get = str(body.we_get, 2000)
  if ('revenue_model' in body) p.revenue_model = str(body.revenue_model, 500)
  if ('est_annual_usd' in body) p.est_annual_usd = num(body.est_annual_usd)
  if ('next_step' in body) p.next_step = str(body.next_step, 300)
  if ('next_step_due' in body) p.next_step_due = isoDate(body.next_step_due)
  return p
}

export const validPartnerStage = (v: unknown): PartnerStage | null =>
  typeof v === 'string' && (ALL_PARTNER_STAGES as string[]).includes(v) ? v as PartnerStage : null

/** Move a partnership to a stage, keeping the first time it got there. */
export async function movePartnerStage(accountId: string, to: PartnerStage, by: string, extra: { reason?: string | null; note?: string | null } = {}) {
  const { data: p } = await db.from('sales_partnerships').select('stage, stage_history').eq('account_id', accountId).maybeSingle()
  if (!p || p.stage === to) return
  const now = new Date().toISOString()
  const history = { ...(p.stage_history ?? {}) }
  if (!history[to]) history[to] = now
  await db.from('sales_partnerships').update({
    stage: to, stage_history: history, updated_at: now, dropped_reason: to === 'dropped' ? extra.reason ?? 'Other' : null,
  }).eq('account_id', accountId)
  await logActivity({
    account_id: accountId, kind: 'stage', created_by: by,
    subject: `Partnership: ${partnerStageLabel(p.stage as PartnerStage)} → ${partnerStageLabel(to)}`,
    body: [extra.note, to === 'dropped' && extra.reason ? `Reason: ${extra.reason}.` : null].filter(Boolean).join('\n') || null,
    meta: { pipeline: 'partner', from: p.stage, to },
  })
}

/**
 * Move an organisation into the Partnerships pipeline (or back to sales).
 * Going to partnerships sets aside its unsent email drafts and closes the
 * sales sequence's open tasks, since a partner gets a different approach.
 */
export async function moveToPipeline(accountId: string, to: 'partner' | 'sales', by: string, opts: { track?: PartnerTrack; we_give?: string | null; we_get?: string | null; revenue_model?: string | null } = {}) {
  const now = new Date().toISOString()
  await db.from('sales_accounts').update({ pipeline: to, updated_at: now }).eq('id', accountId)
  if (to === 'partner') {
    const t = trackInfo(opts.track)
    await db.from('sales_partnerships').upsert({
      account_id: accountId, track: t.id, document: t.doc, stage_history: { identified: now },
      we_give: opts.we_give ?? null, we_get: opts.we_get ?? null, revenue_model: opts.revenue_model ?? null,
    }, { onConflict: 'account_id', ignoreDuplicates: true })
    const { data: drafts } = await db.from('sales_drafts').update({ status: 'discarded', updated_at: now })
      .eq('account_id', accountId).eq('status', 'draft').select('id')
    await db.from('sales_tasks').update({ done_at: now, outcome: 'skipped' }).eq('account_id', accountId).eq('sequence', true).is('done_at', null)
    await logActivity({
      account_id: accountId, kind: 'system', created_by: by, subject: `Moved to Partnerships (${t.label})`,
      body: drafts?.length ? `${drafts.length} unsent email draft(s) set aside; bring them back from the Drafts tab if wanted.` : null,
    })
  } else {
    await logActivity({ account_id: accountId, kind: 'system', created_by: by, subject: 'Moved back to the sales pipeline' })
  }
}
