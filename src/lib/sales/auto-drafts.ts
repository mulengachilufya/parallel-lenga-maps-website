// src/lib/sales/auto-drafts.ts
//
// The email track holds the same prospects as the LinkedIn track, limited to
// people we have an email address for. So every such person who has not been
// emailed yet needs a draft: researched drafts are kept as written, and anyone
// added or imported with an address (or given one later) gets a first email
// from the template, in the founder's voice (email is the founder's channel).

import { allRows, db, getSettings, mergeFields, fill } from './server'
import { template } from './playbook'
import { CHANNEL_VOICE } from './channels'
import { reachedAccounts } from './reach'

// Partners get an ask to work together, never pricing.
const PARTNER_INTRO = {
  subject: 'Working together on spatial data in {country}',
  body: `Hi {first_name},

I'm the founder of Lenga Maps, a GIS environmental data platform with cleaned, consistent layers for all 54 African countries and a shared workspace where teams build project maps together.

I've been following the work {company} is doing, and I think there's a real opportunity for us to work together, whether on a project, a joint bid, or getting ready-to-use spatial data to the teams you work with.

Would you be open to a short call to explore it?

Best,
{my_name}`,
}

/** Create the missing first-email drafts for one pipeline. Returns how many were added. */
export async function ensureEmailDrafts(pipeline: 'sales' | 'partner'): Promise<number> {
  const [contacts, drafts, reached, settings] = await Promise.all([
    allRows((f, t) => db.from('sales_contacts')
      .select('id, name, account_id, account:sales_accounts!inner(name, country_iso3, sector, stage, pipeline)')
      .not('email', 'is', null).is('opted_out_at', null).neq('account.stage', 'lost').eq('account.pipeline', pipeline)
      .order('id').range(f, t)),
    allRows((f, t) => db.from('sales_drafts').select('contact_id').eq('voice', CHANNEL_VOICE.email).not('contact_id', 'is', null).order('id').range(f, t)),
    reachedAccounts(pipeline),
    getSettings(),
  ])
  if (contacts.error || drafts.error) return 0
  const hasDraft = new Set((drafts.data as { contact_id: string }[]).map((d) => d.contact_id))
  const intro = pipeline === 'partner' ? PARTNER_INTRO : template('intro')
  if (!intro) return 0
  type Acc = { name: string; country_iso3: string | null; sector: string | null }
  const rows = (contacts.data as { id: string; name: string; account_id: string; account: Acc | Acc[] }[])
    // Not emailed yet (no email to the organisation) and no draft of any status.
    .filter((c) => !hasDraft.has(c.id) && !reached.get(c.account_id)?.email_at)
    .map((c) => {
      const account = Array.isArray(c.account) ? c.account[0] : c.account
      // A role placeholder is no name to greet: "Hi there".
      const f = mergeFields(account, /\b(officer|lead|manager|head|director|specialist|lecturer|engineer|unit|gis)\b/i.test(c.name) ? null : c.name, settings.my_name)
      return {
        account_id: c.account_id, contact_id: c.id, subject: fill(intro.subject ?? '', f), body: fill(intro.body, f),
        voice: CHANNEL_VOICE.email, status: 'draft', created_by: 'template', batch: 'auto',
      }
    })
  if (!rows.length) return 0
  const { error } = await db.from('sales_drafts').insert(rows)
  if (error) { console.error('[sales] auto drafts failed', error); return 0 }
  return rows.length
}
