// src/lib/ops/alerts.ts
//
// Emails to the owners: instant alerts for critical problems, and the daily
// health report. Sent on every configured Resend channel in turn until one
// works, so a single broken key can't silence the alarm.

import { getAdminEmails, OWNER_EMAILS } from '@/lib/admin'
import { sendEmail, type EmailChannel } from '@/lib/email'
import { explain } from './explain'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
const CHANNELS: EmailChannel[] = ['payments', 'account', 'manual_payment', 'newsletter']

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)) }

export function ownerInboxes(): string[] {
  return [...new Set([...OWNER_EMAILS, ...getAdminEmails()])]
}

/** Try each channel until one accepts; returns true if anyone got it. */
export async function sendToOwners(subject: string, text: string, html: string): Promise<boolean> {
  let any = false
  for (const to of ownerInboxes()) {
    for (const ch of CHANNELS) {
      if (await sendEmail({ to, subject, text, html }, ch)) { any = true; break }
    }
  }
  return any
}

export async function sendOpsAlert(area: string, code: string, message: string): Promise<void> {
  const e = explain(area, code)
  const subject = `⚠ Lenga Maps: ${e.title}`
  const text = `${e.title}\n\nWhat happened: ${message}\nWho is affected: ${e.impact}\nWhat to do: ${e.fix}\n\nOpen the ops console: ${APP_URL}/ops`
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px">
    <p style="margin:0 0 10px"><b>${esc(e.title)}</b></p>
    <p style="margin:0 0 6px"><b>What happened:</b> ${esc(message)}</p>
    <p style="margin:0 0 6px"><b>Who is affected:</b> ${esc(e.impact)}</p>
    <p style="margin:0 0 14px"><b>What to do:</b> ${esc(e.fix)}</p>
    <p><a href="${APP_URL}/ops" style="background:#0D2B45;color:#fff;padding:9px 16px;text-decoration:none;border-radius:4px">Open the ops console</a></p>
    <p style="color:#888;font-size:12px">You get this because you own Lenga Maps. Repeats of the same problem are sent at most every 6 hours.</p></div>`
  await sendToOwners(subject, text, html)
}
