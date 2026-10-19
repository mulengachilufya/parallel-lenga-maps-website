// src/lib/sales/server.ts
//
// Server-only helpers for /api/admin/sales/*: the admin gate, stage moves
// (with their side effects), the timeline, settings and outreach email.

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
import { sendEmail } from '@/lib/email'
import { logEvent } from '@/lib/ops/log'
import { AFRICAN_COUNTRIES } from '@/lib/workspace/templates'
import {
  ALL_STAGES, SECTORS, SEQUENCE, STAGE, dueDate, fill, stageIndex,
  type MergeFields, type Stage,
} from './playbook'

export const db: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')

export function jsonError(error: string, status: number, message?: string) {
  return NextResponse.json({ error, message: message ?? error }, { status })
}

/** The signed-in admin's email, or a ready-to-return 403. */
export async function requireAdmin(): Promise<{ email: string } | { denied: NextResponse }> {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user?.email || !isAdminEmail(user.email)) return { denied: jsonError('forbidden', 403, 'Admin access only.') }
  return { email: user.email }
}

export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t || null
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function isoDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

export const countryName = (iso3: string | null | undefined) =>
  AFRICAN_COUNTRIES.find((c) => c.iso3 === iso3)?.name ?? ''

export const validCountry = (v: unknown): string | null =>
  typeof v === 'string' && AFRICAN_COUNTRIES.some((c) => c.iso3 === v.toUpperCase()) ? v.toUpperCase() : null

export const validSector = (v: unknown): string | null =>
  typeof v === 'string' && SECTORS.some((s) => s.id === v) ? v : null

export const validStage = (v: unknown): Stage | null =>
  typeof v === 'string' && (ALL_STAGES as string[]).includes(v) ? v as Stage : null

// ── Settings ────────────────────────────────────────────────────────────────

export interface SalesSettings { focus_countries: string[]; signature: string; my_name: string }

export async function getSettings(): Promise<SalesSettings> {
  const { data } = await db.from('ops_settings').select('key, value')
    .in('key', ['sales_focus_countries', 'sales_signature', 'sales_my_name'])
  const get = (k: string) => data?.find((r) => r.key === k)?.value
  const focus = get('sales_focus_countries')
  return {
    focus_countries: Array.isArray(focus) ? focus.filter((c): c is string => typeof c === 'string') : [],
    signature:       typeof get('sales_signature') === 'string' ? get('sales_signature') as string : 'Lenga Maps\nwww.lengamaps.com',
    my_name:         typeof get('sales_my_name') === 'string' ? get('sales_my_name') as string : 'Mulenga',
  }
}

export async function saveSettings(s: Partial<SalesSettings>, by: string) {
  const rows: { key: string; value: unknown; updated_by: string; updated_at: string }[] = []
  const at = new Date().toISOString()
  if (s.focus_countries) rows.push({ key: 'sales_focus_countries', value: s.focus_countries, updated_by: by, updated_at: at })
  if (typeof s.signature === 'string') rows.push({ key: 'sales_signature', value: s.signature, updated_by: by, updated_at: at })
  if (typeof s.my_name === 'string') rows.push({ key: 'sales_my_name', value: s.my_name, updated_by: by, updated_at: at })
  if (rows.length) await db.from('ops_settings').upsert(rows)
}

// ── Timeline and stage moves ────────────────────────────────────────────────

export interface AccountRow {
  id: string; name: string; stage: Stage; stage_history: Record<string, string>
  country_iso3: string | null; sector: string | null; org_id: string | null
  last_touch_at: string | null
}

export async function loadAccount(id: string): Promise<AccountRow | null> {
  if (!isUuid(id)) return null
  const { data } = await db.from('sales_accounts').select('*').eq('id', id).maybeSingle()
  return data as AccountRow | null
}

export async function logActivity(a: {
  account_id: string; contact_id?: string | null; kind: string; direction?: 'out' | 'in' | null
  subject?: string | null; body?: string | null; meta?: Record<string, unknown>; created_by: string
}) {
  const { data } = await db.from('sales_activities').insert({
    account_id: a.account_id, contact_id: a.contact_id ?? null, kind: a.kind, direction: a.direction ?? null,
    subject: a.subject ?? null, body: a.body ?? null, meta: a.meta ?? {}, created_by: a.created_by,
  }).select('*').single()
  return data
}

/**
 * Move an account to a stage. Records the first time it reached the stage,
 * writes the move on the timeline, and tidies tasks: once someone replies
 * (or the deal leaves the line) the remaining sequence steps are skipped,
 * and "Not now" leaves a task for the day to check back.
 */
export async function moveStage(
  account: AccountRow, to: Stage, by: string,
  extra: { note?: string | null; lost_reason?: string | null; nurture_until?: string | null } = {},
): Promise<void> {
  if (account.stage === to) return
  const now = new Date().toISOString()
  const history = { ...(account.stage_history ?? {}) }
  if (!history[to]) history[to] = now

  const patch: Record<string, unknown> = { stage: to, stage_history: history, stage_changed_at: now, updated_at: now }
  if (to === 'lost') patch.lost_reason = extra.lost_reason ?? null
  if (to === 'nurture') patch.nurture_until = extra.nurture_until ?? null
  await db.from('sales_accounts').update(patch).eq('id', account.id)

  const reason = to === 'lost' && extra.lost_reason ? ` Reason: ${extra.lost_reason}.` : ''
  const until = to === 'nurture' && extra.nurture_until ? ` Check back on ${extra.nurture_until}.` : ''
  await logActivity({
    account_id: account.id, kind: 'stage', created_by: by,
    subject: `${STAGE[account.stage].label} → ${STAGE[to].label}`,
    body: [extra.note, `${reason}${until}`.trim()].filter(Boolean).join('\n') || null,
    meta: { from: account.stage, to },
  })

  const pastContacted = stageIndex(to) > stageIndex('contacted') || to === 'lost' || to === 'nurture'
  if (pastContacted) {
    await db.from('sales_tasks').update({ done_at: now, outcome: 'skipped' })
      .eq('account_id', account.id).eq('sequence', true).is('done_at', null)
  }
  if (to === 'lost') {
    await db.from('sales_tasks').update({ done_at: now, outcome: 'skipped' })
      .eq('account_id', account.id).is('done_at', null)
  }
  if (to === 'nurture' && extra.nurture_until) {
    await db.from('sales_tasks').insert({
      account_id: account.id, kind: 'email', template: 'nurture',
      title: `Check back in with ${account.name}`, due_on: extra.nurture_until,
    })
  }
  account.stage = to
  account.stage_history = history
}

/**
 * Something happened with the account. Bumps last_touch_at and nudges the
 * stage forward when the event implies it: our first message moves a radar
 * account to Contacted, a reply moves it to Replied (also out of Not now),
 * a held meeting to Met.
 */
export async function touched(account: AccountRow, kind: string, direction: 'out' | 'in' | null, by: string) {
  const now = new Date().toISOString()
  await db.from('sales_accounts').update({ last_touch_at: now, updated_at: now }).eq('id', account.id)
  account.last_touch_at = now
  const at = stageIndex(account.stage)
  // A "Not now" account that writes back is back in play; otherwise logging
  // something on a Not now / Lost account doesn't reopen it.
  if (account.stage === 'nurture' && kind === 'reply') return moveStage(account, 'replied', by)
  if (at < 0) return
  if (kind === 'reply' && at < stageIndex('replied')) await moveStage(account, 'replied', by)
  else if (kind === 'meeting' && at < stageIndex('meeting')) await moveStage(account, 'meeting', by)
  else if (direction === 'out' && ['email', 'linkedin', 'call'].includes(kind) && account.stage === 'target') await moveStage(account, 'contacted', by)
}

/** Lay out the outreach sequence as tasks, starting today. */
export async function startSequence(accountId: string, contact: { id: string; email: string | null; linkedin_url: string | null } | null) {
  // South Africa (POPIA s69): one unsolicited email only, so no email follow-ups.
  const { data: acc } = await db.from('sales_accounts').select('country_iso3').eq('id', accountId).maybeSingle()
  const oneEmail = acc?.country_iso3 === 'ZAF'
  const rows = SEQUENCE
    .filter((s) => !(oneEmail && s.kind === 'email' && s.day > 0))
    .filter((s) => s.kind === 'call' || (s.kind === 'email' ? !!contact?.email : !!contact?.linkedin_url) || !contact)
    .map((s) => ({
      account_id: accountId, contact_id: contact?.id ?? null, kind: s.kind, template: s.template,
      title: s.title, due_on: dueDate(s.day), sequence: true,
    }))
  // A fresh sequence replaces any unfinished one.
  await db.from('sales_tasks').update({ done_at: new Date().toISOString(), outcome: 'skipped' })
    .eq('account_id', accountId).eq('sequence', true).is('done_at', null)
  if (rows.length) await db.from('sales_tasks').insert(rows)
  return rows.length
}

// ── Outreach email ──────────────────────────────────────────────────────────

export function mergeFields(account: { name: string; country_iso3: string | null; sector: string | null }, contactName: string | null, myName: string): MergeFields {
  return {
    first_name:  (contactName ?? '').trim().split(/\s+/)[0] || 'there',
    company:     account.name,
    country:     countryName(account.country_iso3) || 'Africa',
    sector_hook: (SECTORS.find((s) => s.id === account.sector) ?? SECTORS[SECTORS.length - 1]).hook,
    my_name:     myName,
  }
}
export { fill }

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)) }
function linkify(s: string) { return s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#1E5F8E">${u}</a>`) }

/**
 * A 1-to-1 email from the founder. Deliberately plain: it should read like a
 * person wrote it, because a person did. Every one carries a one-click way
 * to stop further emails (also sent as List-Unsubscribe).
 */
export async function sendOutreach(opts: {
  to: string; subject: string; body: string; signature: string; optoutToken: string
}): Promise<boolean> {
  const optout = `${APP_URL}/api/sales/optout?t=${opts.optoutToken}`
  const full = `${opts.body.trim()}\n\n${opts.signature.trim()}`
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:600px">
${full.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`).join('\n')}
<p style="margin:24px 0 0;font-size:12px;color:#999">Not the right person, or rather not hear from me? <a href="${optout}" style="color:#999">Let me know here</a> and I won't email again.</p>
</div>`
  const text = `${full}\n\n--\nRather not hear from me? ${optout}`
  return sendEmail({
    to: opts.to, subject: opts.subject, html, text,
    headers: { 'List-Unsubscribe': `<${optout}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }, 'sales')
}

/** Merge fields or [square bracket] gaps still in a message. */
export const hasPlaceholders = (s: string) => /\{(first_name|company|country|sector_hook|my_name)\}|\[[a-z ]+\]/i.test(s)

/**
 * Send one 1-to-1 email to a contact as the founder, log it on the timeline
 * and nudge the stage. Used by the compose box and by the Drafts tab, and
 * only ever called from an admin's own click.
 */
export async function sendToContact(opts: {
  account: AccountRow; contactId: unknown; subject: unknown; body: unknown; by: string; meta?: Record<string, unknown>
}): Promise<{ ok: true; activity: unknown } | { ok: false; res: NextResponse }> {
  const fail = (error: string, status: number, message: string) => ({ ok: false as const, res: jsonError(error, status, message) })
  const { account } = opts
  if (!isUuid(opts.contactId)) return fail('validation', 400, 'Pick who to send it to.')
  const { data: contact } = await db.from('sales_contacts').select('*').eq('id', opts.contactId).eq('account_id', account.id).maybeSingle()
  if (!contact) return fail('not_found', 404, 'That contact no longer exists.')
  if (!contact.email) return fail('no_email', 400, `There is no email address for ${contact.name}. Add one, or reach them on LinkedIn.`)
  if (contact.opted_out_at) return fail('opted_out', 409, `${contact.name} asked not to be emailed, so this was not sent.`)

  const subject = str(opts.subject, 200)
  const text = str(opts.body, 20000)
  if (!subject || !text) return fail('validation', 400, 'The email needs a subject and a message.')
  if (hasPlaceholders(`${subject}\n${text}`)) {
    return fail('placeholders', 400, 'There are still placeholders in square or curly brackets. Fill them in before sending.')
  }

  const settings = await getSettings()
  const ok = await sendOutreach({
    to: contact.email, subject, body: text,
    signature: `${settings.my_name}\n${settings.signature}`, optoutToken: contact.optout_token,
  })
  if (!ok) {
    void logEvent('error', 'email', 'sales_send_failed', `An outreach email to ${account.name} could not be sent.`, { account: account.id })
    return fail('send_failed', 502, 'The email could not be sent. Check the Ops page (Health) for the email service, or send it from Gmail and log it here.')
  }

  const activity = await logActivity({
    account_id: account.id, contact_id: contact.id, kind: 'email', direction: 'out', subject, body: text,
    meta: { to: contact.email, sent_from_site: true, ...(opts.meta ?? {}) }, created_by: opts.by,
  })
  await touched(account, 'email', 'out', opts.by)
  return { ok: true, activity }
}

/**
 * After a researched first email: the rest of the outreach as tasks. In
 * South Africa POPIA (s69) allows one unsolicited electronic approach, so
 * there the follow-ups are LinkedIn and a call, never another email.
 */
export async function followUpsAfterFirstEmail(account: AccountRow, contact: { id: string; linkedin_url: string | null }) {
  const noMoreEmail = account.country_iso3 === 'ZAF'
  const rows = SEQUENCE
    .filter((s) => s.day > 0)
    .filter((s) => (s.kind === 'email' ? !noMoreEmail : true))
    .map((s) => ({
      account_id: account.id, contact_id: contact.id, kind: s.kind, template: s.template,
      title: s.kind === 'linkedin' && !contact.linkedin_url ? `${s.title} (find them first)` : s.title,
      due_on: dueDate(s.day), sequence: true,
    }))
  await db.from('sales_tasks').update({ done_at: new Date().toISOString(), outcome: 'skipped' })
    .eq('account_id', account.id).eq('sequence', true).is('done_at', null)
  if (rows.length) await db.from('sales_tasks').insert(rows)
  return rows.length
}

/** The editable account fields present in a request body, validated. */
export function accountPatch(body: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {}
  if ('name' in body && str(body.name, 200)) p.name = str(body.name, 200)
  if ('country_iso3' in body) p.country_iso3 = validCountry(body.country_iso3)
  if ('sector' in body) p.sector = validSector(body.sector)
  if ('website' in body) p.website = str(body.website, 300)
  if ('linkedin_url' in body) p.linkedin_url = str(body.linkedin_url, 300)
  if ('size' in body) p.size = str(body.size, 60)
  if ('source' in body && typeof body.source === 'string' && ['outbound', 'website_form', 'referral', 'event', 'partner', 'other'].includes(body.source)) p.source = body.source
  if ('priority' in body && [1, 2, 3].includes(Number(body.priority))) p.priority = Number(body.priority)
  if ('seats_estimate' in body) p.seats_estimate = num(body.seats_estimate) === null ? null : Math.max(1, Math.round(num(body.seats_estimate)!))
  if ('value_usd' in body) p.value_usd = num(body.value_usd)
  if ('next_step' in body) p.next_step = str(body.next_step, 300)
  if ('next_step_due' in body) p.next_step_due = isoDate(body.next_step_due)
  if ('notes' in body) p.notes = str(body.notes, 5000)
  if ('discovery' in body && body.discovery && typeof body.discovery === 'object') {
    const d: Record<string, string> = {}
    for (const [k, v] of Object.entries(body.discovery as Record<string, unknown>)) {
      if (/^[a-z_]{1,40}$/.test(k) && typeof v === 'string') d[k] = v.slice(0, 2000)
    }
    p.discovery = d
  }
  return p
}

export function contactFields(body: Record<string, unknown>) {
  const email = str(body.email, 200)?.toLowerCase() ?? null
  return {
    name:         str(body.name, 200),
    title:        str(body.title, 200),
    email:        email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    phone:        str(body.phone, 60),
    linkedin_url: str(body.linkedin_url, 300),
    notes:        str(body.notes, 2000),
  }
}

/** How a customer's team is getting on: members in, projects made. */
export async function teamStatus(orgId: string | null) {
  if (!orgId) return null
  const [org, members, invites, projects] = await Promise.all([
    db.from('organizations').select('id, name, status, seat_count, access_expires_at, created_at, plan, free_datasets').eq('id', orgId).maybeSingle(),
    db.from('organization_members').select('user_id, member_name, member_email, role, joined_at').eq('org_id', orgId),
    db.from('organization_invites').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending'),
    db.from('workspace_projects').select('id, updated_at').eq('org_id', orgId).is('archived_at', null).order('updated_at', { ascending: false }),
  ])
  if (!org.data) return null
  return {
    ...org.data,
    members:          (members.data ?? []).filter((m) => m.joined_at),
    pending_invites:  invites.count ?? 0,
    project_count:    projects.data?.length ?? 0,
    last_project_at:  projects.data?.[0]?.updated_at ?? null,
  }
}

/**
 * Link accounts to the team their people are on. When someone we are
 * talking to starts a free team (or joins one), the account picks it up and
 * moves to "On the free plan". Returns the names of accounts linked.
 */
export async function linkTeams(onlyAccountId?: string): Promise<string[]> {
  let q = db.from('sales_accounts').select('*').is('org_id', null).not('stage', 'in', '(lost)')
  if (onlyAccountId) q = q.eq('id', onlyAccountId)
  const { data: accounts } = await q.limit(2000)
  if (!accounts?.length) return []
  const { data: contacts } = await db.from('sales_contacts').select('account_id, email')
    .in('account_id', accounts.map((a) => a.id)).not('email', 'is', null)
  const emails = [...new Set((contacts ?? []).map((c) => (c.email as string).toLowerCase()))]
  if (!emails.length) return []
  const { data: members } = await db.from('organization_members').select('org_id, member_email')
    .in('member_email', emails)
  if (!members?.length) return []
  const orgByEmail = new Map(members.map((m) => [String(m.member_email).toLowerCase(), m.org_id as string]))

  const linked: string[] = []
  for (const a of accounts as (AccountRow & { stage_history: Record<string, string> })[]) {
    const orgId = (contacts ?? []).filter((c) => c.account_id === a.id).map((c) => orgByEmail.get(String(c.email).toLowerCase())).find(Boolean)
    if (!orgId) continue
    const { data: org } = await db.from('organizations').select('name, plan').eq('id', orgId).maybeSingle()
    await db.from('sales_accounts').update({ org_id: orgId, updated_at: new Date().toISOString() }).eq('id', a.id)
    await logActivity({ account_id: a.id, kind: 'system', created_by: 'system',
      subject: `Linked to their ${org?.plan === 'free' ? 'free ' : ''}team "${org?.name ?? ''}"`, meta: { org_id: orgId } })
    if (org?.plan === 'free' && (stageIndex(a.stage) < stageIndex('free') || a.stage === 'nurture')) {
      await moveStage(a, 'free', 'system', { note: 'They started a free team.' })
      await db.from('sales_tasks').insert({ account_id: a.id, kind: 'email', template: 'free_checkin', title: 'Check in on their free team', due_on: dueDate(3) })
    }
    linked.push(a.name)
  }
  return linked
}
