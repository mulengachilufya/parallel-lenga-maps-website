// src/lib/sales/reach.ts
//
// Who we have reached, per organisation: the one definition the Sent,
// Outcomes and Countries tabs share. An organisation counts as contacted
// once an email has gone out to it (a sent email on its timeline) or a
// LinkedIn connection request has been sent to one of its people.

import { allRows, db } from './server'

export interface Reach { email_at: string | null; linkedin_at: string | null }

/** Every organisation in the pipeline we have reached, with when, by channel. */
export async function reachedAccounts(pipeline: 'sales' | 'partner'): Promise<Map<string, Reach>> {
  const [emails, linkedin] = await Promise.all([
    allRows((f, t) => db.from('sales_activities')
      .select('account_id, created_at, account:sales_accounts!inner(pipeline)')
      .eq('kind', 'email').eq('direction', 'out').eq('account.pipeline', pipeline)
      .order('created_at', { ascending: true }).range(f, t)),
    allRows((f, t) => db.from('sales_linkedin')
      .select('account_id, requested_at, account:sales_accounts!inner(pipeline)')
      .not('requested_at', 'is', null).eq('account.pipeline', pipeline)
      .order('requested_at', { ascending: true }).range(f, t)),
  ])
  if (emails.error || linkedin.error) throw new Error('reach query failed')
  const out = new Map<string, Reach>()
  for (const r of emails.data as { account_id: string; created_at: string }[]) {
    const x = out.get(r.account_id) ?? { email_at: null, linkedin_at: null }
    x.email_at ??= r.created_at // first email
    out.set(r.account_id, x)
  }
  for (const r of linkedin.data as { account_id: string; requested_at: string }[]) {
    const x = out.get(r.account_id) ?? { email_at: null, linkedin_at: null }
    x.linkedin_at ??= r.requested_at
    out.set(r.account_id, x)
  }
  return out
}
