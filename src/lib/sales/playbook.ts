// src/lib/sales/playbook.ts
//
// The enterprise sales playbook, shared by /admin/sales and its API routes.
// Stages, what each one is for, when an account is ready to move on, the
// outreach sequence and the message templates. Safe for the browser: no
// secrets, no server imports.
//
// Copy style: no em dashes in anything a prospect reads.

export const STAGES = [
  'target', 'contacted', 'replied', 'meeting', 'free', 'proposal', 'won', 'acquired',
] as const
export const SIDE_STAGES = ['nurture', 'lost'] as const
export type Stage = typeof STAGES[number] | typeof SIDE_STAGES[number]
export const ALL_STAGES: Stage[] = [...STAGES, ...SIDE_STAGES]

export interface StageInfo {
  label:       string
  short:       string
  probability: number        // chance a deal at this stage closes, for the weighted pipeline
  goal:        string
  doNow:       string[]
  moveOn:      string        // when the account is ready for the next stage
  tone:        string        // tailwind classes for the stage chip
}

export const STAGE: Record<Stage, StageInfo> = {
  target: {
    label: 'On the radar', short: 'Radar', probability: 0.02, tone: 'bg-slate-100 text-slate-700',
    goal: 'Find the one person who feels the pain: a GIS lead, an environmental or project manager, a head of exploration.',
    doNow: [
      'Find them on LinkedIn (use "Find people" below) and add them as a contact.',
      'Write down why this organisation needs us: a current project, a tender, a country they work in.',
      'Start the outreach sequence. It lays out the next three weeks for you.',
    ],
    moveOn: 'You have sent the first message.',
  },
  contacted: {
    label: 'Contacted', short: 'Contacted', probability: 0.05, tone: 'bg-sky-100 text-sky-800',
    goal: 'Get a reply. Most replies come after the second or third touch, so keep going.',
    doNow: [
      'Work through the sequence tasks on the Today tab as they come due.',
      'Mix email and LinkedIn. A call on day 14 often lands when emails have not.',
      'When they reply, press "They replied". The rest of the sequence stops by itself.',
    ],
    moveOn: 'They reply, in any way.',
  },
  replied: {
    label: 'Replied', short: 'Replied', probability: 0.15, tone: 'bg-indigo-100 text-indigo-800',
    goal: 'Book a 30 minute call within a week, while they are interested.',
    doNow: [
      'Answer within a day. Offer two specific times.',
      'If they asked a question, answer it in one line and ask for the call.',
      'Not now? Move them to "Not now" with a date to check back.',
    ],
    moveOn: 'The call has happened.',
  },
  meeting: {
    label: 'Meeting held', short: 'Met', probability: 0.3, tone: 'bg-violet-100 text-violet-800',
    goal: 'Understand their work well enough to show them their own project in Lenga Maps.',
    doNow: [
      'Fill in the discovery notes: the project, the countries, the data they struggle to get, team size, who signs, budget timing.',
      'Show the workspace on a real area they care about, not a generic demo.',
      'Invite them to start a free team (2 people, 3 datasets) and use it on one live project.',
    ],
    moveOn: 'They start a free team, or ask for a proposal.',
  },
  free: {
    label: 'On the free plan', short: 'Free', probability: 0.4, tone: 'bg-amber-100 text-amber-800',
    goal: 'Their team uses the free workspace on a real project, then outgrows it.',
    doNow: [
      'Send the "Start your free team" email. When they create it, it links to this page by itself.',
      'Check in after a few days: are they in, which 3 datasets did they choose, any blockers?',
      'When they need a third person or a fourth dataset, send the proposal. Ask who approves purchases and how they buy.',
    ],
    moveOn: 'They want more seats or every dataset and ask for a price.',
  },
  proposal: {
    label: 'Proposal sent', short: 'Proposal', probability: 0.7, tone: 'bg-orange-100 text-orange-800',
    goal: 'Get paid. Make buying easy: clear seats, one price per term, invoice on request.',
    doNow: [
      'Send the proposal email with seats, price and what is included.',
      'Ask what their procurement needs: vendor form, quotation on letterhead, PO number.',
      'Follow up every 3 to 4 working days until payment.',
    ],
    moveOn: 'Payment has arrived.',
  },
  won: {
    label: 'Won (paid)', short: 'Won', probability: 0.95, tone: 'bg-emerald-100 text-emerald-800',
    goal: 'Get the whole team in and working in the first two weeks.',
    doNow: [
      'Press "Payment received" and pick the term they paid for.',
      'Book a 30 minute onboarding call and invite every seat.',
      'Help them set up their first project from a template.',
    ],
    moveOn: 'Two or more people have joined and there is a project. This moves by itself.',
  },
  acquired: {
    label: 'Acquired', short: 'Acquired', probability: 1, tone: 'bg-green-600 text-white',
    goal: 'Keep them, renew them, and turn them into a reference.',
    doNow: [
      'Check in a month before renewal. The renewal date is on this page.',
      'Ask for a short quote or a case study once they have delivered a project.',
      'Ask who else in their network should hear about Lenga Maps.',
    ],
    moveOn: 'This is the finish line.',
  },
  nurture: {
    label: 'Not now', short: 'Not now', probability: 0.03, tone: 'bg-stone-200 text-stone-700',
    goal: 'Keep the door open without chasing.',
    doNow: ['Set a date to check back. A task will appear on that day.', 'Send something useful now and then, like a new dataset for their country.'],
    moveOn: 'Their timing changes. Move them back into the pipeline.',
  },
  lost: {
    label: 'Lost', short: 'Lost', probability: 0, tone: 'bg-gray-200 text-gray-500',
    goal: 'Learn why, so the next one goes better.',
    doNow: ['Write the real reason. The Numbers tab adds these up.'],
    moveOn: 'Never say never. You can reopen it any time.',
  },
}

export const stageIndex = (s: Stage) => (STAGES as readonly string[]).indexOf(s)

/** The furthest stage in the main line an account has ever reached. */
export function furthest(history: Record<string, string> | null | undefined, current: Stage): number {
  let best = stageIndex(current)
  for (const k of Object.keys(history ?? {})) best = Math.max(best, stageIndex(k as Stage))
  return best
}

export const SECTORS: { id: string; label: string; hook: string }[] = [
  { id: 'mining',        label: 'Mining and exploration', hook: 'Exploration and mining teams tell us the slowest part of a new licence area is pulling together geology, roads, water and protected areas before anyone goes to site.' },
  { id: 'environment',   label: 'Environmental and EIA consultancy', hook: 'EIA teams tell us the baseline maps take days of hunting for data that is often out of date or in the wrong projection.' },
  { id: 'water',         label: 'Water and sanitation', hook: 'Water teams tell us catchments, rivers, settlements and soils are rarely in one place, and never for every country they work in.' },
  { id: 'energy',        label: 'Energy', hook: 'Energy project teams tell us site screening stalls on basic questions: where the roads, settlements and protected areas are, and how reliable that data is.' },
  { id: 'engineering',   label: 'Engineering and infrastructure', hook: 'Infrastructure teams tell us route and site studies start with weeks of gathering base data from a dozen sources.' },
  { id: 'agriculture',   label: 'Agriculture', hook: 'Agriculture teams tell us soils, rainfall, water and access data are hard to get for the same area at the same level of detail.' },
  { id: 'ngo',           label: 'NGO and development', hook: 'Programme teams tell us they lose time rebuilding the same base maps for every new district or country office.' },
  { id: 'government',    label: 'Government and public sector', hook: 'Planning teams tell us the hard part is sharing one set of maps across departments and keeping track of who changed what.' },
  { id: 'research',      label: 'Research and universities', hook: 'Research groups tell us students and staff spend weeks sourcing base data before the actual analysis starts.' },
  { id: 'other',         label: 'Other', hook: 'Teams working across Africa tell us good base data is scattered, inconsistent between countries and slow to assemble.' },
]
export const sectorLabel = (id: string | null | undefined) => SECTORS.find((s) => s.id === id)?.label ?? (id || 'No sector')

export const SOURCES: { id: string; label: string }[] = [
  { id: 'outbound', label: 'We reached out' },
  { id: 'website_form', label: 'Website form' },
  { id: 'referral', label: 'Referral' },
  { id: 'event', label: 'Event' },
  { id: 'partner', label: 'Partner' },
  { id: 'other', label: 'Other' },
]

export const LOST_REASONS = [
  'No budget', 'Went with another tool', 'Built it in-house', 'No reply after the full sequence',
  'Wrong person, could not find the right one', 'Project cancelled or paused', 'Price too high',
  'Data they needed was missing', 'Other',
]


// ── Templates ───────────────────────────────────────────────────────────────

export type Channel = 'email' | 'linkedin' | 'call'

export interface Template {
  id:       string
  channel:  Channel
  label:    string
  when:     string
  subject?: string
  body:     string
}

// Fields: {first_name} {company} {country} {sector_hook} {my_name}
export const TEMPLATES: Template[] = [
  {
    id: 'intro', channel: 'email', label: 'First email', when: 'Day 0 of the sequence',
    subject: 'Base maps for {company} in {country}',
    body: `Hi {first_name},

{sector_hook}

That is what Lenga Maps fixes. We have cleaned, consistent GIS layers for all 54 African countries (boundaries, hydrology, roads, settlements, soils, protected areas and more), plus a shared workspace where your team builds project maps together, in the browser.

Would it be useful if I set up {company}'s next project area in it, so you can see your own data rather than a demo? It takes me about a day.

Best,
{my_name}`,
  },
  {
    id: 'follow_up', channel: 'email', label: 'Follow-up email', when: 'Day 5',
    subject: 'Re: Base maps for {company} in {country}',
    body: `Hi {first_name},

Following up on my note last week. One thing teams like yours use us for most: every layer comes with where it came from and when, so a reviewer can trust the map.

If there is a project area you are working on now, send me a rough location and I will show you what we have for it. No commitment.

Best,
{my_name}`,
  },
  {
    id: 'breakup', channel: 'email', label: 'Last email in the sequence', when: 'Day 21',
    subject: 'Closing the loop',
    body: `Hi {first_name},

I have not heard back, so I will assume the timing is not right and stop writing. If base data for {country} ever becomes a headache, reply to this email and I will pick it up straight away.

All the best with your projects,
{my_name}`,
  },
  {
    // Left empty on purpose: quote requests ask for all kinds of things
    // (datasets, a plan, a custom area), so the reply is written fresh.
    id: 'custom', channel: 'email', label: 'Blank email (write your own)', when: 'Replying to a quote request, or anything else',
    subject: '',
    body: '',
  },
  {
    id: 'meeting', channel: 'email', label: 'Book the call', when: 'After they reply',
    subject: 'Quick call about {company}',
    body: `Hi {first_name},

Thanks for getting back to me. A 30 minute call is the easiest way to see whether we fit. Would either of these work?

  1. [day and time]
  2. [day and time]

If you tell me the project area beforehand, I will have it loaded so we look at your real data.

Best,
{my_name}`,
  },
  {
    id: 'free_team', channel: 'email', label: 'Start your free team', when: 'After a good first call',
    subject: 'Try Lenga Maps free with your team',
    body: `Hi {first_name},

Thanks for the call. The easiest way to see if this works for {company} is to use it on a real project, free:

  1. Create an account at https://www.lengamaps.com/signup with this email address.
  2. Open https://www.lengamaps.com/team and press "Start a free team". It is free for 2 people, with no end date.
  3. Choose the 3 datasets your project needs most, then invite a colleague and open the Workspace.

Everything you build carries over if you upgrade later for more people and every dataset. Reply here any time you get stuck.

Best,
{my_name}`,
  },
  {
    id: 'free_checkin', channel: 'email', label: 'Free team check-in', when: 'A few days after they start',
    subject: 'How is the workspace going?',
    body: `Hi {first_name},

Quick check-in. Is your colleague in, and is there anything stopping you from using the workspace on the project?

If it helps, I can join a 15 minute call with the two of you this week.

Best,
{my_name}`,
  },
  {
    id: 'proposal', channel: 'email', label: 'Proposal', when: 'When they outgrow the free team or ask for a price',
    subject: 'Lenga Maps for {company}: proposal',
    body: `Hi {first_name},

Thanks for the time your team put into this. Here is what I propose:

  Seats: [number] people
  Price: [amount] USD per [month / 3 months / year] (3 seats: $500 a month, $1,350 for 3 months or $4,800 a year; each extra seat $100 a month, $270 for 3 months or $960 a year)
  Included: every dataset for all 54 countries, the project workspace with shared maps, discussion and full history, and commercial use.

Payment is by bank transfer; the sender pays all bank charges (OUR). I can send a formal quotation or an invoice, and fill in any vendor forms your procurement team needs. What do they usually ask for?

Best,
{my_name}`,
  },
  {
    id: 'onboarding', channel: 'email', label: 'Welcome and onboarding', when: 'When payment arrives',
    subject: 'Welcome to Lenga Maps, {company}',
    body: `Hi {first_name},

Payment received, thank you. Your team's access is active for the term you paid for.

Next steps:
  1. Invite your colleagues from the Team page in your dashboard.
  2. Start your first project from a template in the Workspace.
  3. Book 30 minutes with me for a walk-through: reply with a time that suits you.

Best,
{my_name}`,
  },
  {
    id: 'nurture', channel: 'email', label: 'Checking back in', when: 'When a "Not now" date comes round',
    subject: 'Checking back in',
    body: `Hi {first_name},

When we last spoke the timing was not right. We have added a lot since then for {country}. Is it worth a 20 minute look now?

Best,
{my_name}`,
  },
  {
    id: 'li_connect', channel: 'linkedin', label: 'Connection note', when: 'Day 2. LinkedIn allows about 300 characters.',
    body: `Hi {first_name}, I run Lenga Maps: ready GIS data for all 54 African countries and a shared map workspace for project teams. Would be glad to connect with someone doing project work in {country}.`,
  },
  {
    id: 'li_message', channel: 'linkedin', label: 'LinkedIn message', when: 'Day 9, once connected',
    body: `Thanks for connecting, {first_name}. I sent you a short email about base maps for {company}. If a project area is on your desk right now, send me a rough location and I will show you what we have for it. No pitch, just the maps.`,
  },
  {
    id: 'call', channel: 'call', label: 'Call outline', when: 'Day 14',
    body: `Hi {first_name}, it is {my_name} from Lenga Maps. I sent you a couple of notes about GIS data for {country}. Do you have two minutes?

1. Ask: how does your team get base data for a new project today?
2. Listen for: time lost, data in different formats, out of date, hard to share.
3. Offer: I load one of your project areas and show you, 30 minutes, this week or next.
4. If no: ask who else in the team handles GIS data.`,
  },
]
export const template = (id: string | null | undefined) => TEMPLATES.find((t) => t.id === id)

export interface MergeFields { first_name: string; company: string; country: string; sector_hook: string; my_name: string }

export function fill(text: string, f: MergeFields): string {
  return text.replace(/\{(first_name|company|country|sector_hook|my_name)\}/g, (_, k: keyof MergeFields) => f[k] || '')
}

// ── The outreach sequence ───────────────────────────────────────────────────

// LinkedIn runs as its own track in the LinkedIn tab (src/lib/sales/linkedin.ts),
// so the email sequence no longer carries LinkedIn steps.
export const SEQUENCE: { day: number; kind: 'email' | 'linkedin' | 'call'; template: string; title: string }[] = [
  { day: 0,  kind: 'email',    template: 'intro',      title: 'Send the first email' },
  { day: 5,  kind: 'email',    template: 'follow_up',  title: 'Send the follow-up email' },
  { day: 14, kind: 'call',     template: 'call',       title: 'Call them' },
  { day: 21, kind: 'email',    template: 'breakup',    title: 'Send the last email' },
]

/** YYYY-MM-DD, `days` working-ish days from `from`: weekends roll to Monday. */
export function dueDate(days: number, from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days))
  const dow = d.getUTCDay()
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2)
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

/** Accounts in these stages with no touch for this long show as going cold. */
export const STALE_DAYS = 14
export const ACTIVE_STAGES: Stage[] = ['contacted', 'replied', 'meeting', 'free', 'proposal', 'won']

/** Outreach emails a day before the Drafts tab asks "send anyway?". */
export const DRAFTS_PER_DAY = 15
