// src/lib/sales/digest.ts
//
// The daily sales job, run with the 06:00 UTC ops cron:
//   1. Won deals whose team is in and working move to "Acquired" by
//      themselves (two people joined, or the only seat is in use, and at
//      least one project exists).
//   2. The owners get one short email: what is due today, who replied and
//      is waiting on us, pilots about to end, and deals going cold.
//      Nothing due, nothing sent.

import { sendToOwners } from '@/lib/ops/alerts'
import { ACTIVE_STAGES, STAGE, STALE_DAYS, todayIso, type Stage } from './playbook'
import { countryName, db, moveStage, teamStatus, type AccountRow } from './server'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
const DAY = 86400_000

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)) }

export async function runSalesJob(): Promise<Record<string, unknown>> {
  const { data: accounts, error } = await db.from('sales_accounts').select('*').limit(5000)
  if (error) throw new Error(`sales_accounts: ${error.message}`)
  const rows = (accounts ?? []) as (AccountRow & { stage_changed_at: string; next_step_due: string | null })[]

  // 1. Won → Acquired once the team is really using it.
  const acquired: string[] = []
  for (const a of rows.filter((r) => r.stage === 'won' && r.org_id)) {
    const t = await teamStatus(a.org_id)
    if (!t) continue
    const inUse = t.members.length >= Math.min(2, t.seat_count) && t.project_count >= 1
    if (inUse) {
      await moveStage(a, 'acquired', 'system', { note: `${t.members.length} people in, ${t.project_count} project(s). Moved automatically.` })
      acquired.push(a.name)
    }
  }

  // 2. The morning list.
  const today = todayIso()
  const { data: tasks } = await db.from('sales_tasks').select('account_id, title, due_on').is('done_at', null).lte('due_on', today).order('due_on')
  const byId = new Map(rows.map((r) => [r.id, r]))
  const due = (tasks ?? []).filter((t) => byId.has(t.account_id) && !['lost'].includes(byId.get(t.account_id)!.stage))
  const now = Date.now()
  const waiting = rows.filter((r) => r.stage === 'replied' && r.last_touch_at && now - new Date(r.last_touch_at).getTime() > 2 * DAY)
  const cold = rows.filter((r) => (ACTIVE_STAGES as Stage[]).includes(r.stage) && r.stage !== 'contacted'
    && now - new Date(r.last_touch_at ?? r.stage_changed_at).getTime() > STALE_DAYS * DAY)
  const pilots: { name: string; ends: string }[] = []
  for (const a of rows.filter((r) => r.stage === 'pilot' && r.org_id)) {
    const t = await teamStatus(a.org_id)
    if (t?.access_expires_at && new Date(t.access_expires_at).getTime() - now < 3 * DAY) pilots.push({ name: a.name, ends: t.access_expires_at.slice(0, 10) })
  }

  const summary = { acquired: acquired.length, due: due.length, waiting: waiting.length, cold: cold.length, pilots: pilots.length, sent: false }
  if (!due.length && !waiting.length && !pilots.length && !acquired.length && !(cold.length && new Date().getUTCDay() === 1)) return summary

  const place = (r: AccountRow) => countryName(r.country_iso3) ? ` (${countryName(r.country_iso3)})` : ''
  const sections: { title: string; lines: string[] }[] = []
  if (acquired.length) sections.push({ title: 'New customers', lines: acquired.map((n) => `${n} is now Acquired: the team is in and working.`) })
  if (due.length) sections.push({ title: `Due today (${due.length})`, lines: due.slice(0, 25).map((t) => `${byId.get(t.account_id)!.name}${place(byId.get(t.account_id)!)}: ${t.title}${t.due_on < today ? ` (was due ${t.due_on})` : ''}`) })
  if (waiting.length) sections.push({ title: 'Replied and waiting on you', lines: waiting.map((r) => `${r.name}${place(r)}: book the call.`) })
  if (pilots.length) sections.push({ title: 'Pilots ending', lines: pilots.map((p) => `${p.name}: ends ${p.ends}. Send the proposal.`) })
  if (cold.length && new Date().getUTCDay() === 1) {
    sections.push({ title: `Going cold, no contact for ${STALE_DAYS}+ days`, lines: cold.slice(0, 15).map((r) => `${r.name}${place(r)}: ${STAGE[r.stage].label}`) })
  }

  const subject = due.length ? `Sales today: ${due.length} to do${waiting.length ? `, ${waiting.length} waiting on you` : ''}` : 'Sales: an update'
  const text = sections.map((s) => `${s.title}\n${s.lines.map((l) => `  - ${l}`).join('\n')}`).join('\n\n') + `\n\nOpen the pipeline: ${APP_URL}/admin/sales`
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px">
${sections.map((s) => `<p style="margin:0 0 4px"><b>${esc(s.title)}</b></p><ul style="margin:0 0 16px;padding-left:20px">${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}
<p><a href="${APP_URL}/admin/sales" style="background:#0D2B45;color:#fff;padding:9px 16px;text-decoration:none;border-radius:4px">Open the pipeline</a></p>
<p style="color:#888;font-size:12px">Sent each morning when something needs you. Deals going cold are listed on Mondays.</p></div>`
  summary.sent = await sendToOwners(subject, text, html)
  return summary
}
