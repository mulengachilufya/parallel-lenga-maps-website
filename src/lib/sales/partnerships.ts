// src/lib/sales/partnerships.ts
//
// The Partnerships pipeline: partners whose job is to get Lenga Maps used
// and paid for. They are grouped by how the money reaches us, not by
// country or by what kind of organisation they are: the same NGO could be a
// co-bidder or a channel. Each track has its own first ask and the document
// that usually closes it.
//
// Not here on purpose: asking anyone for their data. Our datasets come from
// public sources whose licences allow commercial use.

export type PartnerTrack = 'marketplace' | 'embedded' | 'joint_bid' | 'project' | 'channel'
export type PartnerStage =
  | 'identified' | 'intro' | 'meeting' | 'proposal' | 'terms' | 'drafting' | 'legal' | 'signed' | 'live' | 'growing'
  | 'paused' | 'dropped'
export type PartnerDoc = 'listing' | 'licence' | 'teaming' | 'referral' | 'reseller' | 'pilot' | 'loi' | 'mou' | 'nda' | 'other'

export interface Partnership {
  account_id: string; track: PartnerTrack; stage: PartnerStage; stage_history: Record<string, string>
  document: PartnerDoc | null; we_give: string | null; we_get: string | null; revenue_model: string | null
  est_annual_usd: number | null; next_step: string | null; next_step_due: string | null; dropped_reason: string | null
  research: string | null; sources: { label: string; url: string }[]
  created_at: string; updated_at: string
}

export const TRACKS: { id: PartnerTrack; label: string; short: string; how: string; firstAsk: string; doc: PartnerDoc; examples: string }[] = [
  {
    id: 'marketplace', label: 'Marketplaces', short: 'Marketplace',
    how: 'Buyers find us where they already shop, and the marketplace bills them for us.',
    firstAsk: 'Apply to list. Prepare the listing: what each dataset is, coverage, licence and price.',
    doc: 'listing', examples: 'AWS Data Exchange, Snowflake Marketplace, Esri ArcGIS Marketplace, Databricks',
  },
  {
    id: 'embedded', label: 'Built into their product', short: 'Built in',
    how: 'They put our data or workspace inside their product and pay a yearly licence or per use.',
    firstAsk: 'A 20 minute call: what African data they lack today, and a free trial key for their team.',
    doc: 'licence', examples: 'Carbon project and rating platforms, climate risk analytics, crop insurers',
  },
  {
    id: 'joint_bid', label: 'Joint bids', short: 'Joint bid',
    how: 'We are the data and workspace line in a bid they lead for a donor or lender programme.',
    firstAsk: 'Which tenders they are bidding on in the next six months, and a one-page capability note from us.',
    doc: 'teaming', examples: 'Big consultancies, research centres and NGOs that win World Bank, AfDB, GCF and EU work',
  },
  {
    id: 'project', label: 'Project partners', short: 'Project',
    how: 'They run or finance a stream of projects and bring Lenga Maps onto each one: their teams or their consultants use it.',
    firstAsk: 'One live project to start on, set up free for their team, with a clear goal.',
    doc: 'pilot', examples: 'Development lenders, utilities and agencies that commission environmental studies',
  },
  {
    id: 'channel', label: 'Resellers and referrals', short: 'Channel',
    how: 'They recommend or sell Lenga Maps to the people they serve, and earn a commission.',
    firstAsk: 'Who they serve and how they recommend tools today; offer a referral fee and a free team for them.',
    doc: 'referral', examples: 'GIS distributors, training centres, member associations',
  },
]
export const track = (id: string | null | undefined) => TRACKS.find((t) => t.id === id) ?? TRACKS[0]

export const PARTNER_STAGES: { id: PartnerStage; label: string; short: string; hint: string }[] = [
  { id: 'identified', label: 'Identified', short: 'Identified', hint: 'On the list. Find the right person.' },
  { id: 'intro', label: 'Intro made', short: 'Intro', hint: 'First message sent or warm intro made.' },
  { id: 'meeting', label: 'First meeting', short: 'Meeting', hint: 'Had the first call. Write down what they need.' },
  { id: 'proposal', label: 'Proposal sent', short: 'Proposal', hint: 'Concept note or proposal with them.' },
  { id: 'terms', label: 'Terms agreed', short: 'Terms', hint: 'Agreed in principle: who does what, and the money.' },
  { id: 'drafting', label: 'Document drafted', short: 'Drafting', hint: 'The agreement is being written.' },
  { id: 'legal', label: 'Their legal review', short: 'Legal', hint: 'With their lawyers or procurement. Have ours read it too.' },
  { id: 'signed', label: 'Signed', short: 'Signed', hint: 'Signed. Now make the first thing happen.' },
  { id: 'live', label: 'Live', short: 'Live', hint: 'First users, listing or money is moving. This is the real win.' },
  { id: 'growing', label: 'Growing', short: 'Growing', hint: 'Working and growing. Review it every quarter.' },
]
export const PARTNER_OFF: { id: PartnerStage; label: string }[] = [
  { id: 'paused', label: 'Paused' }, { id: 'dropped', label: 'Dropped' },
]
export const ALL_PARTNER_STAGES: PartnerStage[] = [...PARTNER_STAGES.map((s) => s.id), 'paused', 'dropped']
export const partnerStageLabel = (s: PartnerStage) =>
  PARTNER_STAGES.find((x) => x.id === s)?.label ?? PARTNER_OFF.find((x) => x.id === s)?.label ?? s
export const partnerStageIndex = (s: PartnerStage) => PARTNER_STAGES.findIndex((x) => x.id === s)

export const DOCUMENTS: { id: PartnerDoc; label: string; when: string }[] = [
  { id: 'listing', label: 'Marketplace listing agreement', when: 'Their standard terms for sellers.' },
  { id: 'licence', label: 'Data or software licence', when: 'They use or embed our data or workspace and pay for it.' },
  { id: 'teaming', label: 'Teaming agreement', when: 'A joint bid for one named tender or programme.' },
  { id: 'referral', label: 'Referral agreement', when: 'They send us customers for a commission.' },
  { id: 'reseller', label: 'Reseller agreement', when: 'They sell Lenga Maps themselves, at a margin.' },
  { id: 'pilot', label: 'Pilot agreement (statement of work)', when: 'One project to prove it, with a goal and a date.' },
  { id: 'loi', label: 'Letter of intent', when: 'They intend to buy or partner. Investors count these.' },
  { id: 'mou', label: 'MoU', when: 'Only when a government or big institution needs one. Name one deliverable, an owner each side and a date.' },
  { id: 'nda', label: 'NDA', when: 'Before sharing anything confidential.' },
  { id: 'other', label: 'Other', when: '' },
]
export const docLabel = (d: PartnerDoc | null | undefined) => DOCUMENTS.find((x) => x.id === d)?.label ?? 'Not chosen'

export const DROP_REASONS = ['No reply', 'Not a fit', 'No budget or programme', 'Went with someone else', 'Timing', 'Other']

/** Live and growing partners count; signed ones not yet live don't. */
export const isLive = (s: PartnerStage) => s === 'live' || s === 'growing'
