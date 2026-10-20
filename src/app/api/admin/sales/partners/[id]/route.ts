/**
 * PATCH /api/admin/sales/partners/:id — edit a partnership: any of track,
 *   document, we_give, we_get, revenue_model, est_annual_usd, next_step,
 *   next_step_due; { stage, reason?, note? } moves it along.
 * POST  /api/admin/sales/partners/:id — move the organisation between
 *   pipelines: { to: 'partner', track } or { to: 'sales' }.
 *
 * Admin only. Nothing here contacts anyone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, jsonError, loadAccount, requireAdmin, str } from '@/lib/sales/server'
import { moveToPipeline, movePartnerStage, partnershipPatch, validPartnerStage } from '@/lib/sales/partners-server'
import { DROP_REASONS, TRACKS, type PartnerTrack } from '@/lib/sales/partnerships'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() } catch { return {} }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404, 'That partner no longer exists.')
  const body = await readBody(req)

  const patch = partnershipPatch(body)
  if (Object.keys(patch).length) {
    const { error } = await db.from('sales_partnerships').update({ ...patch, updated_at: new Date().toISOString() }).eq('account_id', id)
    if (error) return jsonError('update_failed', 500, error.message)
  }
  if ('stage' in body) {
    const to = validPartnerStage(body.stage)
    if (!to) return jsonError('validation', 400, 'Unknown stage.')
    const reason = DROP_REASONS.includes(String(body.reason)) ? String(body.reason) : null
    await movePartnerStage(id, to, gate.email, { reason, note: str(body.note, 2000) })
  }
  const { data } = await db.from('sales_partnerships').select('*').eq('account_id', id).maybeSingle()
  return NextResponse.json({ ok: true, partnership: data })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404, 'That organisation no longer exists.')
  const body = await readBody(req)
  if (body.to === 'partner') {
    if (!TRACKS.some((t) => t.id === body.track)) return jsonError('validation', 400, 'Pick a track for the partnership.')
    await moveToPipeline(id, 'partner', gate.email, { track: body.track as PartnerTrack })
  } else if (body.to === 'sales') {
    await moveToPipeline(id, 'sales', gate.email)
  } else return jsonError('validation', 400, 'Say where to move it: partner or sales.')
  return NextResponse.json({ ok: true })
}
