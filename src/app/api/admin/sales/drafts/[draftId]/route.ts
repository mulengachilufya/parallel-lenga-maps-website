/**
 * PATCH /api/admin/sales/drafts/:draftId — edit a draft before sending:
 * { subject?, body? }, or set it aside / bring it back: { status:
 * 'discarded' | 'draft' }. A sent draft can no longer change.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, isUuid, jsonError, requireAdmin, str } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { draftId } = await params
  if (!isUuid(draftId)) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const { data: draft } = await db.from('sales_drafts').select('id, status').eq('id', draftId).maybeSingle()
  if (!draft) return jsonError('not_found', 404, 'That draft no longer exists.')
  if (draft.status === 'sent') return jsonError('already_sent', 409, 'This one has already been sent.')

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('subject' in body) { const s = str(body.subject, 200); if (!s) return jsonError('validation', 400, 'The subject cannot be empty.'); patch.subject = s }
  if ('body' in body) { const b = str(body.body, 20000); if (!b) return jsonError('validation', 400, 'The message cannot be empty.'); patch.body = b }
  if (body.status === 'discarded' || body.status === 'draft') patch.status = body.status

  const { data, error } = await db.from('sales_drafts').update(patch).eq('id', draftId).select('*').single()
  if (error) return jsonError('save_failed', 500, 'Could not save the draft.')
  return NextResponse.json({ ok: true, draft: data })
}
