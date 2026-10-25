/**
 * /api/account/orders — a signed-in user's own orders.
 *
 *   GET                  → their bank-transfer payments (plans, seats,
 *                          updates) and their quote requests (custom data,
 *                          team quotes)
 *   DELETE { kind, id }  → cancel one:
 *       kind 'payment': pending or rejected ones are deleted. A verified
 *                       one is only hidden from their list (hidden_at,
 *                       migration 059): it is the receipt, and the plan stays.
 *       kind 'quote':   any time. If we have not worked it yet, its copy in
 *                       the sales pipeline goes too; otherwise the pipeline
 *                       notes that they withdrew it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function me() {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  return user?.email ? { id: user.id, email: user.email.toLowerCase() } : null
}

export async function GET() {
  const user = await me()
  if (!user) return NextResponse.json({ payments: [], quotes: [] })
  const [p, q] = await Promise.all([
    service.from('manual_payments')
      .select('id, reference, plan, product, account_type, amount_usd, amount_zmw, currency, status, submitted_at, admin_note')
      .eq('user_id', user.id).is('hidden_at', null).order('submitted_at', { ascending: false }).limit(50),
    service.from('quote_requests')
      .select('id, org_name, seats, datasets_interest, status, created_at')
      .ilike('email', user.email).order('created_at', { ascending: false }).limit(50),
  ])
  return NextResponse.json({ payments: p.data ?? [], quotes: q.data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'unauthorized', message: 'Sign in first.' }, { status: 401 })
  let body: { kind?: string; id?: string | number } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const gone = () => NextResponse.json({ error: 'not_found', message: 'That order is no longer there.' }, { status: 404 })

  if (body.kind === 'payment') {
    const id = Number(body.id)
    if (!Number.isInteger(id)) return gone()
    const { data: row } = await service.from('manual_payments').select('id, status').eq('id', id).eq('user_id', user.id).maybeSingle()
    if (!row) return gone()
    if (row.status === 'verified') {
      const { error } = await service.from('manual_payments').update({ hidden_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
      if (error) return NextResponse.json({ error: 'remove_failed', message: 'Could not remove. Try again.' }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    const { error } = await service.from('manual_payments').delete().eq('id', id).eq('user_id', user.id).neq('status', 'verified')
    if (error) return NextResponse.json({ error: 'cancel_failed', message: 'Could not cancel. Try again.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.kind === 'quote' && typeof body.id === 'string') {
    const { data: row } = await service.from('quote_requests').select('id').eq('id', body.id).ilike('email', user.email).maybeSingle()
    if (!row) return gone()
    const { data: acct } = await service.from('sales_accounts').select('id, stage, source').eq('quote_request_id', row.id).maybeSingle()
    if (acct) {
      // Untouched since it came in: nothing of ours to keep, so it goes.
      const { count: worked } = await service.from('sales_activities').select('id', { count: 'exact', head: true })
        .eq('account_id', acct.id).neq('created_by', 'website')
      if (acct.source === 'website_form' && acct.stage === 'replied' && !worked) {
        await service.from('sales_accounts').delete().eq('id', acct.id)
      } else {
        await service.from('sales_activities').insert({
          account_id: acct.id, kind: 'note', direction: 'in', subject: 'They withdrew their website quote request', created_by: 'website',
        })
      }
    }
    const { error } = await service.from('quote_requests').delete().eq('id', row.id)
    if (error) return NextResponse.json({ error: 'cancel_failed', message: 'Could not cancel. Try again.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'validation', message: 'Missing order.' }, { status: 400 })
}
