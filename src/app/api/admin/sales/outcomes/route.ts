/**
 * /api/admin/sales/outcomes?pipeline=sales|partner — how it turned out for
 * every organisation we have reached.
 *
 * GET   the reached organisations with their outcome (won, lost, no response
 *       or not ticked yet).
 * PATCH { account_id, outcome: 'won' | 'lost' | 'no_response' | null }
 *       ticks (or clears) it. Starts no tasks and changes no stage.
 *
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { allRows, db, isUuid, jsonError, requireAdmin } from '@/lib/sales/server'
import { reachedAccounts } from '@/lib/sales/reach'

export const dynamic = 'force-dynamic'

const OUTCOMES = ['won', 'lost', 'no_response'] as const

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const pipeline = req.nextUrl.searchParams.get('pipeline') === 'partner' ? 'partner' : 'sales'
  try {
    const reached = await reachedAccounts(pipeline)
    // The whole pipeline, filtered here: a list of ids could outgrow a URL.
    const accounts = await allRows((f, t) => db.from('sales_accounts')
      .select('id, name, country_iso3, outcome, outcome_at').eq('pipeline', pipeline).order('name').order('id').range(f, t))
    if (accounts.error) throw accounts.error
    return NextResponse.json({
      accounts: (accounts.data as { id: string; name: string; country_iso3: string | null; outcome: string | null; outcome_at: string | null }[])
        .filter((a) => reached.has(a.id)).map((a) => ({ ...a, ...reached.get(a.id)! })),
    })
  } catch (e) {
    console.error('[admin/sales/outcomes] list failed', e)
    return jsonError('list_failed', 500, 'Could not load the outcomes. Has migration 057 been applied?')
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  if (!isUuid(body.account_id)) return jsonError('validation', 400, 'Which organisation?')
  const outcome = body.outcome === null ? null : (OUTCOMES as readonly unknown[]).includes(body.outcome) ? body.outcome as string : undefined
  if (outcome === undefined) return jsonError('validation', 400, 'Outcome must be won, lost or no_response.')
  const now = new Date().toISOString()
  const { error } = await db.from('sales_accounts')
    .update({ outcome, outcome_at: outcome ? now : null, outcome_by: outcome ? gate.email : null, updated_at: now })
    .eq('id', body.account_id)
  if (error) return jsonError('save_failed', 500, 'Could not save the outcome.')
  return NextResponse.json({ ok: true, outcome, outcome_at: outcome ? now : null })
}
