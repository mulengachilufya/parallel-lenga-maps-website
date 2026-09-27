// src/lib/ops/report.ts
//
// The daily health report emailed to both owners at 08:00 Lusaka time.
// Subject line tells you whether to open it: "All clear" or "N things
// need you".

import { explain } from './explain'
import { overall, runHealthChecks } from './health'
import { opsDb } from './log'
import { sendToOwners } from './alerts'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const DOT = { ok: '🟢', warn: '🟠', fail: '🔴' } as const

export async function sendDailyReport(force = false): Promise<{ sent: boolean; status: string }> {
  const db = opsDb()
  const checks = await runHealthChecks()
  const status = overall(checks)
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const [{ data: problems }, { count: signups }, { count: payments }] = await Promise.all([
    db.from('ops_events').select('area, code, message, count, level').is('resolved_at', null).gte('last_at', since).order('last_at', { ascending: false }).limit(10),
    db.from('profiles').select('id', { head: true, count: 'exact' }).gte('created_at', since),
    db.from('manual_payments').select('id', { head: true, count: 'exact' }).gte('submitted_at', since),
  ])
  const needs = checks.filter((c) => c.status !== 'ok')
  if (!force && status === 'ok' && !(problems ?? []).length && new Date().getUTCDay() !== 1) {
    // Quiet days send nothing except the Monday "all clear", so silence
    // never means "the report stopped working" for more than a week.
    return { sent: true, status: 'quiet' }
  }
  const subject = needs.length ? `Lenga Maps daily report: ${needs.length} thing${needs.length === 1 ? '' : 's'} need${needs.length === 1 ? 's' : ''} you` : 'Lenga Maps daily report: all clear'

  const lines = [
    subject, '',
    ...checks.map((c) => `${DOT[c.status]} ${c.name}: ${c.summary}${c.fix && c.status !== 'ok' ? `\n   What to do: ${c.fix}` : ''}`),
    '', `Last 24 hours: ${signups ?? 0} new sign-ups, ${payments ?? 0} payment proofs submitted.`,
    ...((problems ?? []).length ? ['', 'Problems logged:', ...(problems ?? []).map((p) => `- ${explain(p.area, p.code).title} (${p.count}×): ${p.message}`)] : []),
    '', `Open the ops console: ${APP_URL}/ops`,
  ]
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:620px">
    <h2 style="font-size:18px;margin:0 0 12px">${esc(subject)}</h2>
    <table style="border-collapse:collapse;width:100%">${checks.map((c) => `<tr><td style="padding:6px 8px 6px 0;vertical-align:top">${DOT[c.status]}</td><td style="padding:6px 0;border-bottom:1px solid #eee"><b>${esc(c.name)}</b><br>${esc(c.summary)}${c.fix && c.status !== 'ok' ? `<br><span style="color:#8a4b00"><b>What to do:</b> ${esc(c.fix)}</span>` : ''}</td></tr>`).join('')}</table>
    <p style="margin:14px 0 6px">Last 24 hours: <b>${signups ?? 0}</b> new sign-ups, <b>${payments ?? 0}</b> payment proofs submitted.</p>
    ${(problems ?? []).length ? `<p style="margin:12px 0 4px"><b>Problems logged</b></p><ul style="margin:0;padding-left:18px">${(problems ?? []).map((p) => `<li>${esc(explain(p.area, p.code).title)} (${p.count}×): ${esc(p.message)}</li>`).join('')}</ul>` : ''}
    <p style="margin:18px 0"><a href="${APP_URL}/ops" style="background:#0D2B45;color:#fff;padding:9px 16px;text-decoration:none;border-radius:4px">Open the ops console</a></p>
    <p style="color:#888;font-size:12px">Sent daily when something needs you, and every Monday regardless.</p></div>`
  const sent = await sendToOwners(subject, lines.join('\n'), html)
  return { sent, status }
}
