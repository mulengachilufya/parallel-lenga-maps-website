/**
 * POST /api/admin/sales/:id/sequence — { contact_id } lay out the three
 * week outreach sequence for this person as tasks, starting today. Steps
 * for a channel we have no address for (no email, no LinkedIn) are left
 * out. Starting again replaces any unfinished sequence.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, isUuid, jsonError, loadAccount, logActivity, requireAdmin, startSequence } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }
  if (!isUuid(body.contact_id)) return jsonError('validation', 400, 'Add a contact first: the sequence is for a person.')
  const { data: contact } = await db.from('sales_contacts').select('id, name, email, linkedin_url, opted_out_at')
    .eq('id', body.contact_id).eq('account_id', id).maybeSingle()
  if (!contact) return jsonError('not_found', 404, 'That contact no longer exists.')
  if (!contact.email && !contact.linkedin_url) return jsonError('validation', 400, `Add an email address or LinkedIn profile for ${contact.name} first.`)

  const n = await startSequence(id, { id: contact.id, email: contact.opted_out_at ? null : contact.email, linkedin_url: contact.linkedin_url })
  await logActivity({ account_id: id, contact_id: contact.id, kind: 'system', subject: `Outreach sequence started for ${contact.name} (${n} steps)`, created_by: gate.email })
  return NextResponse.json({ ok: true, steps: n })
}
