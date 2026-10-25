/**
 * GET /api/admin/sales/sent?pipeline=sales|partner — everyone we have
 * reached out to, by channel (emails sent, LinkedIn connection requests
 * sent), plus the counts for the tab labels: email drafts ready to send and
 * people still to reach on LinkedIn.
 *
 * The pipeline ends here: what happens after a reply is handled by hand.
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { allRows, db, jsonError, requireAdmin } from '@/lib/sales/server'
import { actorName, CHANNEL_VOICE } from '@/lib/sales/channels'
import { ensureEmailDrafts } from '@/lib/sales/auto-drafts'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const pipeline = req.nextUrl.searchParams.get('pipeline') === 'partner' ? 'partner' : 'sales'

  // So the Email drafts count matches its list.
  await ensureEmailDrafts(pipeline)
  const [emails, linkedin, emailDrafts, people, reached, nameOf] = await Promise.all([
    allRows((f, t) => db.from('sales_activities')
      .select('id, account_id, subject, created_by, created_at, account:sales_accounts!inner(name, country_iso3, pipeline), contact:sales_contacts(name, email)')
      .eq('kind', 'email').eq('direction', 'out').eq('account.pipeline', pipeline)
      .order('created_at', { ascending: false }).range(f, t)),
    allRows((f, t) => db.from('sales_linkedin')
      .select('contact_id, account_id, requested_at, account:sales_accounts!inner(name, country_iso3, pipeline), contact:sales_contacts!inner(name, linkedin_url)')
      .not('requested_at', 'is', null).eq('account.pipeline', pipeline)
      .order('requested_at', { ascending: false }).range(f, t)),
    db.from('sales_drafts').select('id, account:sales_accounts!inner(pipeline), contact:sales_contacts!inner(email)', { count: 'exact', head: true })
      .not('contact.email', 'is', null).eq('account.pipeline', pipeline).eq('voice', CHANNEL_VOICE.email).eq('status', 'draft'),
    db.from('sales_contacts').select('id, account:sales_accounts!inner(pipeline, stage)', { count: 'exact', head: true })
      .is('opted_out_at', null).neq('account.stage', 'lost').eq('account.pipeline', pipeline),
    db.from('sales_linkedin').select('contact_id, account:sales_accounts!inner(pipeline)', { count: 'exact', head: true })
      .or('requested_at.not.is.null,closed_at.not.is.null').eq('account.pipeline', pipeline),
    actorName(),
  ])
  if (emails.error || linkedin.error) {
    console.error('[admin/sales/sent] list failed', emails.error ?? linkedin.error)
    return jsonError('list_failed', 500, 'Could not load the sent list.')
  }
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  type Acc = { name: string; country_iso3: string | null }
  return NextResponse.json({
    email: (emails.data as { id: string; account_id: string; subject: string | null; created_by: string | null; created_at: string; account: Acc | Acc[]; contact: { name: string; email: string | null } | { name: string; email: string | null }[] | null }[])
      .map((r) => ({ id: r.id, account_id: r.account_id, org: one(r.account)?.name ?? '', country: one(r.account)?.country_iso3 ?? null,
        person: one(r.contact)?.name ?? null, detail: one(r.contact)?.email ?? null, subject: r.subject, at: r.created_at, by: nameOf(r.created_by) })),
    linkedin: (linkedin.data as { contact_id: string; account_id: string; requested_at: string; account: Acc | Acc[]; contact: { name: string; linkedin_url: string | null } | { name: string; linkedin_url: string | null }[] }[])
      .map((r) => ({ id: r.contact_id, account_id: r.account_id, org: one(r.account)?.name ?? '', country: one(r.account)?.country_iso3 ?? null,
        person: one(r.contact)?.name ?? null, detail: one(r.contact)?.linkedin_url ?? null, subject: null, at: r.requested_at, by: null })),
    counts: {
      email_drafts: emailDrafts.count ?? 0,
      linkedin_drafts: Math.max(0, (people.count ?? 0) - (reached.count ?? 0)),
    },
  })
}
