/**
 * GET /api/admin/sales/drafts?status=draft|sent|discarded|all&pipeline=sales|partner
 * — the researched first emails waiting in the Drafts tab (sales) or the
 * Partnerships drafts (partner), each with its organisation and person,
 * plus how many outreach emails went out today (both pipelines: one domain).
 *
 * Admin only. Listing never sends anything.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, jsonError, requireAdmin } from '@/lib/sales/server'
import { CHANNEL_VOICE, channelOwners, touches } from '@/lib/sales/channels'
import { ensureEmailDrafts } from '@/lib/sales/auto-drafts'
import { DRAFTS_PER_DAY } from '@/lib/sales/playbook'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const status = req.nextUrl.searchParams.get('status') || 'draft'
  const pipeline = req.nextUrl.searchParams.get('pipeline') === 'partner' ? 'partner' : 'sales'

  // Email is the founder's channel: everyone sees the drafts in the founder's
  // voice, and each card says what LinkedIn has already done with that organisation.
  const voice = CHANNEL_VOICE.email
  // Everyone with an email address who has not been emailed gets a draft.
  if (status === 'draft' || status === 'all') await ensureEmailDrafts(pipeline)
  let q = db.from('sales_drafts')
    .select('id, account_id, contact_id, subject, body, research, sources, batch, status, sent_at, created_at, updated_at, account:sales_accounts!inner(id, name, country_iso3, sector, website, stage, pipeline), contact:sales_contacts!inner(id, name, title, email, linkedin_url, opted_out_at)')
    // Only people we can actually email; the rest are on the LinkedIn track alone.
    .not('contact.email', 'is', null).eq('account.pipeline', pipeline).eq('voice', voice).order('created_at', { ascending: true }).limit(500)
  if (status !== 'all') q = q.eq('status', status)
  const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0)
  const [drafts, counts, today, other, owners, noEmail] = await Promise.all([
    q,
    Promise.all((['draft', 'sent', 'discarded'] as const).map((st) => db.from('sales_drafts')
      .select('id, account:sales_accounts!inner(pipeline), contact:sales_contacts!inner(email)', { count: 'exact', head: true })
      .not('contact.email', 'is', null).eq('account.pipeline', pipeline).eq('voice', voice).eq('status', st))),
    db.from('sales_activities').select('id', { count: 'exact', head: true })
      .eq('kind', 'email').eq('direction', 'out').gte('created_at', midnight.toISOString()),
    touches(pipeline),
    channelOwners(),
    // Drafts kept for people with no email address yet (they are on the LinkedIn track).
    db.from('sales_drafts').select('id, account:sales_accounts!inner(pipeline), contact:sales_contacts!inner(email)', { count: 'exact', head: true })
      .is('contact.email', null).eq('account.pipeline', pipeline).eq('voice', voice).eq('status', 'draft'),
  ])
  if (drafts.error) {
    console.error('[admin/sales/drafts] list failed', drafts.error)
    return jsonError('list_failed', 500, 'Could not load the drafts. Has migration 049 been applied?')
  }
  // Counted in the database: there can be thousands of drafts.
  const tally = { draft: counts[0].count ?? 0, sent: counts[1].count ?? 0, discarded: counts[2].count ?? 0 }
  return NextResponse.json({
    drafts: (drafts.data ?? []).map((d) => ({ ...d, linkedin: other[d.account_id]?.linkedin ?? null })),
    counts: tally, sent_today: today.count ?? 0, per_day: DRAFTS_PER_DAY, owners, no_email: noEmail.count ?? 0,
  })
}
