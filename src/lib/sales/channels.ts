// src/lib/sales/channels.ts
//
// Who works which channel, and what the other channel has already done.
//
// Every prospect (sales and partnerships) sits on both tracks at once: the
// founder writes to them by email, Wiza (staff) reaches them on LinkedIn.
// Both see everything. So that nobody writes to someone cold who has already
// heard from the other, each card carries a note of the other channel's
// history, read from the timeline (sales_activities), where every email sent
// and every LinkedIn step is logged with who did it.

import { allRows, db, getSettings } from './server'

export type Channel = 'email' | 'linkedin'

/** The voice each channel's messages are written in: the person who sends them. */
export const CHANNEL_VOICE: Record<Channel, 'founder' | 'staff'> = { email: 'founder', linkedin: 'staff' }

export interface ChannelTouch { count: number; first_at: string; last_at: string; last: string | null; by: string | null }
/** Per account: what each channel has done so far (null: nothing yet). */
export type Touches = Record<string, { email: ChannelTouch | null; linkedin: ChannelTouch | null }>

/** The first name to show for whoever acted ("Mulenga", "Wiza"): staff by their row, owners by the sales name. */
export async function actorName(): Promise<(email: string | null) => string | null> {
  const [{ data: staff }, settings] = await Promise.all([db.from('admin_staff').select('email, name'), getSettings()])
  const names = new Map((staff ?? []).map((s) => [String(s.email).toLowerCase(), String(s.name ?? s.email).split(/\s+/)[0]]))
  return (email) => !email || !email.includes('@') ? null : names.get(email.toLowerCase()) ?? settings.my_name
}

/** Who runs each channel, for the tab headers. */
export async function channelOwners(): Promise<Record<Channel, string>> {
  const [{ data: staff }, settings] = await Promise.all([db.from('admin_staff').select('name').limit(1), getSettings()])
  return { email: settings.my_name, linkedin: String(staff?.[0]?.name ?? 'Staff').split(/\s+/)[0] }
}

const channelOf = (r: { kind: string; meta: Record<string, unknown> | null }): Channel | null => {
  if (r.kind === 'email') return 'email'
  if (r.kind === 'linkedin') return 'linkedin'
  // Replies and calls logged from the LinkedIn tab say so; the rest came by email.
  if (r.kind === 'reply' || r.kind === 'meeting') return r.meta?.channel === 'linkedin' ? 'linkedin' : 'email'
  return null
}

/** Everything each channel has done, per account, for one pipeline. */
export async function touches(pipeline: 'sales' | 'partner'): Promise<Touches> {
  const [acts, nameOf] = await Promise.all([
    allRows((f, t) => db.from('sales_activities')
      .select('account_id, kind, direction, subject, meta, created_by, created_at, account:sales_accounts!inner(pipeline)')
      .in('kind', ['email', 'linkedin', 'reply', 'meeting']).eq('account.pipeline', pipeline)
      .order('created_at', { ascending: true }).range(f, t)),
    actorName(),
  ])
  const out: Touches = {}
  for (const r of acts.data as { account_id: string; kind: string; direction: string | null; subject: string | null; meta: Record<string, unknown> | null; created_by: string | null; created_at: string }[]) {
    const ch = channelOf(r)
    if (!ch) continue
    const slot = (out[r.account_id] ??= { email: null, linkedin: null })
    const by = nameOf(r.created_by)
    const prev = slot[ch]
    slot[ch] = { count: (prev?.count ?? 0) + 1, first_at: prev?.first_at ?? r.created_at, last_at: r.created_at, last: r.subject, by: by ?? prev?.by ?? null }
  }
  return out
}
