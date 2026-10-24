// src/lib/pricing.ts
// Single source of truth for all pricing and access logic.
// Every page, component, and API route imports from here.
//
// ─── PRICING MODEL (2026-10) ────────────────────────────────────
// Free stays as it was: 3 datasets you choose, and free teams of 2.
//
// Individual: a one-off licence. Pay once, keep every dataset in the
// catalogue for good, and get every dataset added in the next
// UPDATE_MONTHS. After that, an updates renewal adds UPDATE_MONTHS more.
// One person, downloads only, no workspace, no sector packs, no
// redistribution or resale. profiles.updates_until holds the date; null
// means no limit (accounts from earlier plans keep what they had).
//
// Team: 3 seats or more, paid per month, per 3 months or per year
// (TEAM_TERMS). Every dataset plus the shared workspace. Sold on a quote
// and provisioned by an admin; organizations.access_expires_at holds the
// end of the paid term.
//
// Sector packs (Carbon/MRV, Mining…) are quoted separately; no plan
// includes them.
//
// Every payment is a bank transfer approved by an admin
// (/api/admin/payments/verify). No card checkout, no automatic renewal.
// Accounts that were active before 2026-09 keep permanent access
// (plan_expires_at null always means "does not expire").

export type TierSlug = 'individual' | 'team'

/** Months of new datasets an Individual licence (or a renewal) includes. */
export const UPDATE_MONTHS = 6
export const LICENCE_PRICE = 300
export const UPDATES_PRICE = 99

export type IndividualProduct = 'licence' | 'updates'
export const INDIVIDUAL_PRODUCTS: Record<IndividualProduct, { price: number; label: string }> = {
  licence: { price: LICENCE_PRICE, label: `Individual licence: $${LICENCE_PRICE} once` },
  updates: { price: UPDATES_PRICE, label: `${UPDATE_MONTHS} more months of updates: $${UPDATES_PRICE}` },
}

// ─── Team terms ───────────────────────────────────────────────

export type TeamTerm = 'month' | 'quarter' | 'year'
export const TEAM_MIN_SEATS = 3

export const TEAM_TERMS: Record<TeamTerm, { months: number; label: string; per: string; base: number; extraSeat: number; saving?: string }> = {
  month:   { months: 1,  label: 'Monthly',  per: 'per month',    base: 500,  extraSeat: 100 },
  quarter: { months: 3,  label: '3 months', per: 'per 3 months', base: 1350, extraSeat: 270, saving: 'Save 10%' },
  year:    { months: 12, label: '1 year',   per: 'per year',     base: 4800, extraSeat: 960, saving: 'Save 20%' },
}
export const TEAM_TERM_ORDER: TeamTerm[] = ['month', 'quarter', 'year']

export function isTeamTerm(v: unknown): v is TeamTerm {
  return typeof v === 'string' && v in TEAM_TERMS
}

/** USD for a team of `seats` (at least TEAM_MIN_SEATS) for one term. */
export function teamPrice(seats: number, term: TeamTerm): number {
  const t = TEAM_TERMS[term]
  return t.base + Math.max(0, Math.round(seats) - TEAM_MIN_SEATS) * t.extraSeat
}

/** Default length of a team's paid period when an admin doesn't pick one. */
export const ACCESS_MONTHS = 3

/** Months in a team term sent by an admin form; ACCESS_MONTHS if missing. */
export function termMonths(v: unknown): number {
  return isTeamTerm(v) ? TEAM_TERMS[v].months : ACCESS_MONTHS
}

/** When access paid for now ends: `months` after now, or after an expiry
 *  that is still in the future (so renewing early loses nothing). */
export function accessExpiry(currentExpiry?: string | null, months = ACCESS_MONTHS, now = new Date()): string {
  const cur = currentExpiry ? new Date(currentExpiry) : null
  const base = cur && cur > now ? new Date(cur) : new Date(now)
  base.setMonth(base.getMonth() + months)
  return base.toISOString()
}

/** null = never expires (grandfathered accounts). */
export function isExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() <= now
}
export type UserState = 'free' | TierSlug

export interface Plan {
  slug:         TierSlug
  name:         string
  price:        number     // USD; for 'team' the smallest monthly price
  priceLabel:   string
  description:  string
  selfServe:    boolean     // true = has its own pay-now flow (bank transfer + admin approval)
  contactHref:  string
  ctaLabel:     string
  features:     string[]
}

// Individual is self-serve: /dashboard/payment -> BankTransferPanel ->
// "I've paid" -> admin approval. Team is always quoted first (/projects),
// then provisioned by an admin with the seats and term paid for.

export const PLANS: Record<TierSlug, Plan> = {
  individual: {
    slug: 'individual', name: 'Individual', price: LICENCE_PRICE, priceLabel: `$${LICENCE_PRICE} once`,
    description: `Pay once and keep every dataset. Includes ${UPDATE_MONTHS} months of new datasets.`,
    selfServe: true, contactHref: '/contact-us',
    ctaLabel: 'Buy licence',
    features: [
      'Every dataset in the catalogue, yours for good',
      'All 54 African countries, unlimited downloads',
      `New datasets for ${UPDATE_MONTHS} months; then $${UPDATES_PRICE} per ${UPDATE_MONTHS} months`,
      'One person, downloads only',
    ],
  },
  team: {
    slug: 'team', name: 'Team', price: TEAM_TERMS.month.base, priceLabel: `From $${TEAM_TERMS.month.base} a month`,
    description: `A shared workspace and every dataset, from ${TEAM_MIN_SEATS} seats.`,
    selfServe: false, contactHref: '/projects',
    ctaLabel: 'Get a quote',
    features: [
      'Every dataset, for every seat, with all updates',
      'Project workspace: live web map, discussion, full history',
      `${TEAM_MIN_SEATS} seats included; $${TEAM_TERMS.month.extraSeat} a month per extra seat`,
      'Monthly, 3 months (save 10%) or 1 year (save 20%)',
    ],
  },
}

export const PLAN_ORDER: TierSlug[] = ['individual', 'team']

// Plans with their own pay-now flow (bank-details/manual-proof/admin-verify).
export const SELF_SERVE_PLAN_ORDER: TierSlug[] = ['individual']

/**
 * Where a plan's primary CTA should send a buyer. Single source of truth:
 * every place that renders a plan CTA calls this.
 */
export function planCtaHref(slug: TierSlug): string {
  const plan = PLANS[slug]
  return plan.selfServe ? `/dashboard/payment?plan=${slug}` : plan.contactHref
}

/** Licence terms shown wherever an Individual licence is sold. */
export const LICENCE_TERMS = 'One licence per person. Datasets may not be redistributed, resold or republished.'
/** Bank-fee instruction on every payment screen and invoice. */
export const BANK_FEES_NOTE = 'Bank charges: OUR. The sender pays all sending and intermediary bank fees.'

// ─── Plan card UI ─────────────────────────────────────────────

export interface PlanCardUI {
  bg:           string
  border:       string
  nameColor:    string
  priceColor:   string
  dotColor:     string
  btnBg:        string
  dividerColor: string
  tagline:      string
  count:        string
  datasets:     string[]
}

export const PLAN_CARD_UI: Record<TierSlug, PlanCardUI> = {
  individual: {
    bg: '#EEEDFE', border: '#AFA9EC', nameColor: '#534AB7', priceColor: '#3C3489',
    dotColor: '#534AB7', btnBg: '#534AB7', dividerColor: '#534AB7',
    tagline: 'Pay once. Keep every dataset.',
    count: 'Whole catalogue',
    datasets: ['Every dataset, yours for good', 'All 54 African countries', `${UPDATE_MONTHS} months of new datasets`, 'One person, downloads only'],
  },
  team: {
    bg: '#0D2B45', border: '#F5B800', nameColor: '#F5B800', priceColor: '#FFFFFF',
    dotColor: '#F5B800', btnBg: '#F5B800', dividerColor: '#F5B800',
    tagline: 'A shared workspace for GIS teams on real projects.',
    count: `${TEAM_MIN_SEATS} seats included`,
    datasets: [`$${TEAM_TERMS.month.base} a month, or $${TEAM_TERMS.year.base.toLocaleString()} a year`, `${TEAM_MIN_SEATS} seats, +$${TEAM_TERMS.month.extraSeat}/month per extra seat`, 'Project workspace with live web map', 'Discussion and full project history', 'Every dataset, always up to date'],
  },
}

// ─── Datasets ─────────────────────────────────────────────────
// Slugs match the id field in api-datasets.ts EXACTLY — do not change.
// No tier ladder anymore: every dataset is available to every paid account.

export type DatasetSlug =
  | 'admin-boundaries' | 'aquifer' | 'drought-index'
  | 'rainfall' | 'protected-areas'
  | 'watersheds' | 'population' | 'rivers' | 'roads'
  | 'temperature' | 'hydrorivers' | 'lulc' | 'lakes' | 'soil' | 'wetlands'
  // Added 2026-10 (src/lib/catalog.ts). Each joins ALL_DATASETS and
  // FREE_PICKABLE once its files are in R2.
  | 'crop-production' | 'tree-cover-loss' | 'soil-nutrients' | 'mining-geology' | 'solar-wind' | 'power-plants' | 'crop-suitability' | 'built-up'
  // Ready-made reports (PDF), not GIS files: pickable, but not counted in ALL_DATASETS.
  | 'country-profiles'

export const ALL_DATASETS: DatasetSlug[] = [
  'admin-boundaries', 'aquifer', 'drought-index', 'rainfall', 'protected-areas',
  'watersheds', 'population', 'rivers', 'roads',
  'temperature', 'hydrorivers', 'lulc', 'lakes', 'soil', 'wetlands',
  'crop-production', 'tree-cover-loss', 'soil-nutrients', 'mining-geology', 'solar-wind', 'power-plants',
  'crop-suitability', 'built-up',
]

export const DATASET_COUNT = ALL_DATASETS.length

/**
 * When each dataset joined the catalogue. An Individual licence covers
 * datasets added on or before its updates_until date. Every new dataset
 * MUST get its real release date here (TypeScript enforces an entry).
 */
export const DATASET_ADDED: Record<DatasetSlug, string> = {
  'admin-boundaries': '2026-01-01', aquifer: '2026-01-01', 'drought-index': '2026-01-01',
  rainfall: '2026-01-01', 'protected-areas': '2026-01-01', watersheds: '2026-01-01',
  population: '2026-01-01', rivers: '2026-01-01', roads: '2026-01-01',
  temperature: '2026-01-01', hydrorivers: '2026-01-01', lulc: '2026-01-01',
  lakes: '2026-01-01', soil: '2026-01-01', wetlands: '2026-01-01',
  'crop-production': '2026-10-24', 'tree-cover-loss': '2026-10-24', 'soil-nutrients': '2026-10-24',
  'mining-geology': '2026-10-24', 'solar-wind': '2026-10-24', 'power-plants': '2026-10-24', 'country-profiles': '2026-10-24', 'crop-suitability': '2026-10-24', 'built-up': '2026-10-24',
}

/** Is this dataset covered by a licence whose updates run until `until`?
 *  null = no limit. Unknown slugs count as covered. */
export function coveredByUpdates(slug: string, until: string | null | undefined): boolean {
  if (!until) return true
  const added = (DATASET_ADDED as Record<string, string>)[slug]
  return !added || new Date(added).getTime() <= new Date(until).getTime()
}

// ─── Free plans (2026-09) ─────────────────────────────────────
// Individual free: any signed-in account picks FREE_DATASET_LIMIT datasets
// and can download those, for every country, for good. Team free: a
// workspace for FREE_TEAM_SEATS people whose owner picks the team's
// FREE_DATASET_LIMIT datasets. Picks are permanent until the account pays
// (paid = every dataset). Enforced server-side in src/lib/entitlements.ts.

export const FREE_DATASET_LIMIT = 3
export const FREE_TEAM_SEATS    = 2

/** Datasets a free account may pick: the ones that have files today. */
export const FREE_PICKABLE: DatasetSlug[] = [
  'admin-boundaries', 'rivers', 'lakes', 'watersheds', 'roads', 'population',
  'protected-areas', 'soil', 'lulc', 'aquifer', 'rainfall', 'temperature', 'drought-index',
  'crop-production', 'tree-cover-loss', 'soil-nutrients', 'mining-geology', 'solar-wind', 'power-plants',
  'country-profiles', 'crop-suitability', 'built-up',
]

export interface FreeOffer {
  name: string; priceLabel: string; tagline: string; count: string
  items: string[]; cta: string; href: string
}

/** The two free plans, as shown on /pricing, /projects and the dashboard. */
export const FREE_OFFERS: Record<TierSlug, FreeOffer> = {
  individual: {
    name: 'Free', priceLabel: '$0', tagline: 'Choose 3 datasets and keep them. No card, no time limit.',
    count: `${FREE_DATASET_LIMIT} datasets you choose`,
    items: ['Any 3 datasets, for all 54 countries', 'Unlimited downloads of those 3', 'Your 3 stay yours; upgrade any time for every dataset'],
    cta: 'Sign up free', href: '/signup',
  },
  team: {
    name: 'Free team', priceLabel: '$0', tagline: 'A shared project workspace for 2 people.',
    count: `${FREE_DATASET_LIMIT} datasets your team chooses`,
    items: [`${FREE_TEAM_SEATS} seats`, 'Project workspace: live web map, discussion, full history', 'Your members\' chosen datasets on your maps', `Upgrade from ${TEAM_MIN_SEATS} seats for every dataset`],
    cta: 'Start a free team', href: '/team?start=free',
  },
}

/** Keep only valid, pickable, distinct slugs. */
export function cleanPicks(v: unknown): DatasetSlug[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((s): s is DatasetSlug => typeof s === 'string' && (FREE_PICKABLE as string[]).includes(s)))]
}

// ─── Access ───────────────────────────────────────────────────
// Binary now: an account is either paid (any plan) or free. Paid unlocks
// everything. No trial, no per-dataset gate, no download cap.

const LEGACY_PAID_PLANS = ['starter', 'pro', 'max', 'enterprise']

export function getUserState(
  plan:       string | undefined | null,
  planStatus: string | undefined | null,
  expiresAt?: string | null,
): UserState {
  if (planStatus !== 'active' || !plan) return 'free'
  if (isExpired(expiresAt)) return 'free'
  if (plan === 'individual' || plan === 'team') return plan
  // Legacy monthly tiers: migration 029 rewrites these to 'individual', but
  // honour them until it has run so a deploy never locks customers out.
  if (LEGACY_PAID_PLANS.includes(plan)) return 'individual'
  return 'free'
}

export function getTierLabel(state: UserState): string {
  const labels: Record<UserState, string> = {
    free:       'Free',
    individual: 'Individual',
    team:       'Team',
  }
  return labels[state]
}

/** Any paid account (individual or team) can access every file. */
export function canAccessFiles(state: UserState): boolean {
  return state !== 'free'
}

/** Every dataset is available to every paid account — no per-tier gate. */
export function canAccessDataset(userPlan: TierSlug | 'free'): boolean {
  return userPlan !== 'free'
}