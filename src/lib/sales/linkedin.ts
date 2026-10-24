// src/lib/sales/linkedin.ts
//
// The LinkedIn track of /admin/sales, run alongside the email one. For each
// person: send a connection request, and once they accept, thank them,
// comment on two of their posts, then three days after the thank-you send
// the message about Lenga Maps (free to start, the price, and an ask for a
// 10 minute video call).
//
// Each step is a timestamp on sales_linkedin (migration 050); the step a
// person is on is worked out from which are set. Nothing is ever sent from
// the site: the founder copies the message and sends it on LinkedIn.

import { FREE_DATASET_LIMIT, FREE_TEAM_SEATS, TEAM_MIN_SEATS, TEAM_TERMS, teamPrice } from '@/lib/pricing'

/** The most seats the Team plan sells without a custom quote. */
export const LI_MAX_SEATS = 12
/** Days from the thank-you to the Lenga Maps message. */
export const LI_PITCH_AFTER_DAYS = 3

export interface LinkedInRow {
  contact_id: string; account_id: string; hook: string | null
  messages: Partial<Record<LiMessage, string>>
  requested_at: string | null; connected_at: string | null; thanked_at: string | null
  comment1_at: string | null; comment2_at: string | null; pitched_at: string | null
  replied_at: string | null; meeting_at: string | null; closed_at: string | null; closed_reason: string | null
}

export type LiMessage = 'connect' | 'thank' | 'pitch'
export type LiStep = 'find' | 'connect' | 'accept' | 'thank' | 'comment1' | 'comment2' | 'pitch' | 'reply' | 'meeting' | 'closed'
/** What pressing a step's main button records. */
export type LiAction = 'requested' | 'connected' | 'thanked' | 'comment1' | 'comment2' | 'pitched' | 'replied' | 'meeting' | 'closed'

export const LI_ACTION_FIELD: Record<LiAction, keyof LinkedInRow> = {
  requested: 'requested_at', connected: 'connected_at', thanked: 'thanked_at', comment1: 'comment1_at',
  comment2: 'comment2_at', pitched: 'pitched_at', replied: 'replied_at', meeting: 'meeting_at', closed: 'closed_at',
}
/** The order steps happen in; "undo" clears the latest one set. */
export const LI_ORDER: LiAction[] = ['requested', 'connected', 'thanked', 'comment1', 'comment2', 'pitched', 'replied', 'meeting', 'closed']

export const LI_STEP: Record<LiStep, { label: string; short: string; message?: LiMessage; action?: LiAction; button?: string; waiting?: boolean }> = {
  find:     { label: 'Find them on LinkedIn',        short: 'Find' },
  connect:  { label: 'Send a connection request',    short: 'Connect', message: 'connect', action: 'requested', button: 'I sent the request' },
  accept:   { label: 'Waiting for them to accept',   short: 'Requested', action: 'connected', button: 'They accepted', waiting: true },
  thank:    { label: 'Thank them for connecting',    short: 'Thank', message: 'thank', action: 'thanked', button: 'I sent it' },
  comment1: { label: 'Comment on one of their posts', short: 'Comment 1', action: 'comment1', button: 'I commented' },
  comment2: { label: 'Comment on a second post',     short: 'Comment 2', action: 'comment2', button: 'I commented' },
  pitch:    { label: 'Tell them about Lenga Maps',   short: 'Lenga Maps message', message: 'pitch', action: 'pitched', button: 'I sent it' },
  reply:    { label: 'Waiting for a reply',          short: 'Messaged', waiting: true },
  meeting:  { label: 'Video call booked',            short: 'Call booked' },
  closed:   { label: 'Closed',                       short: 'Closed' },
}

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400_000).toISOString()

/** The step someone is on and, if it is not for today, when it comes due. */
export function liStep(row: Partial<LinkedInRow> | null, linkedinUrl: string | null): { step: LiStep; due: string | null } {
  const r = row ?? {}
  if (r.closed_at) return { step: 'closed', due: null }
  if (r.meeting_at) return { step: 'meeting', due: null }
  if (!r.requested_at) return { step: linkedinUrl ? 'connect' : 'find', due: null }
  if (!r.connected_at) return { step: 'accept', due: null }
  if (!r.thanked_at) return { step: 'thank', due: null }
  // Spread over the three days between the thank-you and the message.
  if (!r.comment1_at) return { step: 'comment1', due: addDays(r.thanked_at, 1) }
  if (!r.comment2_at) return { step: 'comment2', due: addDays(r.thanked_at, 2) }
  if (!r.pitched_at) return { step: 'pitch', due: addDays(r.thanked_at, LI_PITCH_AFTER_DAYS) }
  return { step: 'reply', due: null }
}

/** True when the step is the founder's to do now (not waiting on them or a date). */
export function liActionable(step: LiStep, due: string | null, now = Date.now()): boolean {
  if (step === 'find' || step === 'connect' || step === 'thank') return true
  if (step === 'comment1' || step === 'comment2' || step === 'pitch') return !due || Date.parse(due) <= now
  return false
}

// ── Messages ────────────────────────────────────────────────────────────────
// In the founder's voice: warm, short, no dashes. {first} {org} {hook}.

const money = (n: number) => `$${n.toLocaleString('en-US')}`
const month = TEAM_TERMS.month

export const LI_TEMPLATES: Record<LiMessage, string> = {
  // LinkedIn allows about 300 characters on a connection note.
  connect: `Hi {first}, I came across {hook} and would love to connect. I'm the founder of Lenga Maps, a GIS environmental data platform covering all 54 African countries.`,

  thank: `Thanks for connecting, {first}, I really appreciate it! I've been reading about {hook}, really impressive. Looking forward to keeping up with you and the team at {org}.`,

  pitch: `Hi {first}, hope your week is going well.

I wanted to share a bit about what I'm building. Lenga Maps is one of Africa's biggest and most centralised GIS environmental data platforms, with over 15 environmental GIS datasets, heavily geoprocessed and cleaned, across all 54 African countries. It also has a shared GIS project workspace, where your team can view and comment on the same project map, suggest changes and even send voice notes, in real time.

It's completely free to start: ${FREE_DATASET_LIMIT} free datasets and a free team workspace with ${FREE_TEAM_SEATS} seats at www.lengamaps.com.

For bigger teams, the Team plan is ${money(month.base)} a month with ${TEAM_MIN_SEATS} seats included, and each extra seat is ${money(month.extraSeat)} a month. You can secure up to ${LI_MAX_SEATS} seats (${money(teamPrice(LI_MAX_SEATS, 'month'))} a month for a team of ${LI_MAX_SEATS}), and it's 10% less if you take 3 months or 20% less for a year. Just reply here, or request it at www.lengamaps.com/projects, and I'll set it up for you.

Would you be open to a quick 10 minute video call? I'd show you how it works and answer any questions. Happy to work around your schedule.`,
}

// For partners (the Partnerships pipeline) the third message asks to work
// together instead of selling seats, so it carries no pricing.
export const LI_PARTNER_PITCH = `Hi {first}, hope your week is going well.

I wanted to share a bit about what I'm building. Lenga Maps is one of Africa's biggest and most centralised GIS environmental data platforms, with over 15 environmental GIS datasets, heavily geoprocessed and cleaned, across all 54 African countries, and a shared GIS project workspace where teams view, comment on and suggest changes to the same map in real time.

After reading about {hook}, I think there's a real opportunity for us to work together, whether that's on a project, a joint bid, or getting Lenga Maps into the hands of the teams you work with. I'd love to hear what you're working on next and where ready to use spatial data would help.

Would you be open to a quick 15 minute video call to explore it? Happy to work around your schedule.`

// Wiza's voice (Chief Commercial Officer): the same steps, warmer and more
// personal. Picked when the person signed in is a staff member, not an owner.
export type LiVoice = 'founder' | 'staff'

export const LI_TEMPLATES_STAFF: Record<LiMessage, string> = {
  connect: `Hi {first}, I came across {hook} and really loved it. I'm the Chief Commercial Officer at Lenga Maps, a GIS environmental data platform covering all 54 African countries. I'd be so glad to connect.`,

  thank: `Thank you so much for connecting, {first}, it means a lot! I've been reading about {hook}, and honestly it's inspiring work. I'd love to keep learning from you and the team at {org}.`,

  pitch: LI_TEMPLATES.pitch
    .replace("I wanted to share a bit about what I'm building.", "I've really enjoyed following your work, and I wanted to share a little about what we're building at Lenga Maps.")
    .replace("Just reply here, or request it at www.lengamaps.com/projects, and I'll set it up for you.", "Just reply here, or request it at www.lengamaps.com/projects, and I'll personally make sure it's set up for you and your team.")
    .replace("Would you be open to a quick 10 minute video call? I'd show you how it works and answer any questions. Happy to work around your schedule.", "Would you be open to a quick 10 minute video call? I'd love to walk you through it and hear what your team needs. I'm very happy to work around your schedule."),
}

const LI_PARTNER_PITCH_STAFF = LI_PARTNER_PITCH
  .replace("I wanted to share a bit about what I'm building.", "I've really enjoyed following your work, and I wanted to share a little about what we're building at Lenga Maps.")
  .replace("I think there's a real opportunity for us to work together", "I genuinely believe there's a lovely opportunity for us to work together")
  .replace("Happy to work around your schedule.", "I'm very happy to work around your schedule.")

export const LI_CONNECT_LIMIT = 300

export function liMessage(kind: LiMessage, f: { first: string; org: string; hook: string | null; edited?: string | null; partner?: boolean; voice?: LiVoice }): string {
  const staff = f.voice === 'staff'
  const text = f.edited?.trim() || (kind === 'pitch' && f.partner ? (staff ? LI_PARTNER_PITCH_STAFF : LI_PARTNER_PITCH) : (staff ? LI_TEMPLATES_STAFF : LI_TEMPLATES)[kind])
  return text
    .replace(/\{first\}/g, f.first || 'there')
    .replace(/\{org\}/g, f.org)
    .replace(/\{hook\}/g, f.hook?.trim() || `the work ${f.org} is doing`)
}

// A role in place of a name ("GIS / Remote Sensing Lead") until the person is found.
const ROLE = /\b(officer|lead|manager|head|director|specialist|analyst|coordinator|team|engineer|unit)\b/i

export const firstName = (name: string) => {
  if (ROLE.test(name)) return ''
  const parts = name.trim().split(/\s+/)
  // "Dr Valerie Naidoo": LinkedIn is first-name terms.
  return (/^(dr|prof|mr|mrs|ms)\.?$/i.test(parts[0] ?? '') ? parts[1] : parts[0]) ?? ''
}

/** A LinkedIn people search for someone, for when we don't have their profile yet. */
export const liFindUrl = (name: string, org: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${name.replace(/^(dr|prof)\.?\s+/i, '')} ${org}`)}`

/** Their recent posts, for the two comments. */
export const liActivityUrl = (profile: string) => `${profile.replace(/[?#].*$/, '').replace(/\/+$/, '')}/recent-activity/all/`

/** A clean https://www.linkedin.com/in/... address, or null if it isn't one. */
export function cleanProfileUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)/i)
  return m ? `https://www.linkedin.com/in/${m[1]}/` : null
}

export const LI_CLOSE_REASONS = ['Did not accept', 'No reply', 'Not interested', 'Wrong person', 'Already a customer', 'Other']
