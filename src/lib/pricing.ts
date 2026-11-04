// src/lib/pricing.ts
// Single source of truth for all pricing and access logic.
// Every page, component, and API route imports from here.
//
// ─── PRICING MODEL (2026-11) ────────────────────────────────────
// Free: 3 datasets you choose (kept for good, unlimited downloads), plus a
// free workspace for 2 people.
//
// Individual PASS: $5 a month for everything. Every dataset, unlimited
// downloads, for as long as the pass runs. Sold as time passes (1, 6 or
// 12 months), never auto-renewing. When a pass ends the account drops back
// to Free: the 3 free picks stay, new downloads of other datasets stop.
// Access end date lives in profiles.plan_expires_at (null = no end date).
//
// Team / business: no public price. Teams ask for a quote (/projects and
// /pricing): seats, on-site support, custom data, API. An admin provisions
// the team; organizations.access_expires_at holds the end of the paid term.
//
// Every individual payment can be made two ways (manual proof of payment
// inside the account, approved by an admin; instant on-site payment is a
// later addition). Both end in the same place: /api/admin/payments/verify
// (or the future instant route) grants the pass through accessExpiry().
//
// GRANDFATHERING: accounts that bought the old $300 licence (or older
// plans) have plan_expires_at = null and keep access for good. They are
// never expired. Legacy 'licence' / 'updates' payments that were submitted
// before this change are still honoured by the verify route.

export type TierSlug = 'individual' | 'team'

// ─── Individual passes ────────────────────────────────────────

export type PassProduct = 'pass_1m' | 'pass_6m' | 'pass_12m'

/** Prices in USD. Change a price HERE and every page, email and payment
 *  route follows. Longer passes are cheaper per month. */
export const PASSES: Record<PassProduct, { months: number; price: number; label: string; note?: string }> = {
  pass_1m:  { months: 1,  price: 5,  label: '1 month' },
  pass_6m:  { months: 6,  price: 25, label: '6 months',  note: 'Save $5' },
  pass_12m: { months: 12, price: 45, label: '12 months', note: 'Save $15' },
}
export const PASS_ORDER: PassProduct[] = ['pass_1m', 'pass_6m', 'pass_12m']
export const DEFAULT_PASS: PassProduct = 'pass_1m'
/** The headline price: what one month costs. */
export const PASS_MONTH_PRICE = PASSES.pass_1m.price

export function isPassProduct(v: unknown): v is PassProduct {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PASSES, v)
}

// Legacy products. NOT for sale any more. They exist so payments submitted
// under the old once-off model (still waiting for approval) are honoured.
export type LegacyProduct = 'licence' | 'updates'
/** Months of new datasets a legacy licence (or renewal) includes. */
export const UPDATE_MONTHS = 6
export const LEGACY_LICENCE_PRICE = 300
export const LEGACY_UPDATES_PRICE = 99

export type IndividualProduct = PassProduct | LegacyProduct
export const INDIVIDUAL_PRODUCTS: Record<IndividualProduct, { price: number; label: string }> = {
  pass_1m:  { price: PASSES.pass_1m.price,  label: `Individual pass: ${PASSES.pass_1m.label}` },
  pass_6m:  { price: PASSES.pass_6m.price,  label: `Individual pass: ${PASSES.pass_6m.label}` },
  pass_12m: { price: PASSES.pass_12m.price, label: `Individual pass: ${PASSES.pass_12m.label}` },
  licence:  { price: LEGACY_LICENCE_PRICE,  label: `Individual licence (legacy): $${LEGACY_LICENCE_PRICE} once` },
  updates:  { price: LEGACY_UPDATES_PRICE,  label: `Updates renewal (legacy): ${UPDATE_MONTHS} months` },
}

// ─── Team terms ───────────────────────────────────────────────

export type TeamTerm = 'month' | 'quarter' | 'year'
export const TEAM_MIN_SEATS = 3

/** Indicative price of ONE seat for ONE month, shown only inside the quote
 *  builder as an estimate for seats. Support, custom data and API are always
 *  quoted. Set SHOW_SEAT_ESTIMATE to false to hide every number from teams. */
export const TEAM_SEAT_PRICE = 5
export const SHOW_SEAT_ESTIMATE = true

export const TEAM_TERMS: Record<TeamTerm, { months: number; label: string; per: string }> = {
  month:   { months: 1,  label: 'Monthly',  per: 'per month' },
  quarter: { months: 3,  label: '3 months', per: 'per 3 months' },
  year:    { months: 12, label: '1 year',   per: 'per year' },
}
export const TEAM_TERM_ORDER: TeamTerm[] = ['month', 'quarter', 'year']

export function isTeamTerm(v: unknown): v is TeamTerm {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TEAM_TERMS, v)
}

/** USD for `seats` seats (at least TEAM_MIN_SEATS) for one term. An
 *  estimate for the quote builder and a default for the admin forms. */
export function teamPrice(seats: number, term: TeamTerm): number {
  return Math.max(TEAM_MIN_SEATS, Math.round(seats)) * TEAM_SEAT_PRICE * TEAM_TERMS[term].months
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
// "I've paid" -> admin approval. Team is never priced in public: buyers
// describe what they need (/projects, /pricing), we reply with a quote,
// then an admin provisions the team.

export const PLANS: Record<TierSlug, Plan> = {
  individual: {
    slug: 'individual', name: 'Individual', price: PASS_MONTH_PRICE, priceLabel: `$${PASS_MONTH_PRICE} a month`,
    description: 'Every dataset and unlimited downloads for as long as your pass runs.',
    selfServe: true, contactHref: '/contact-us',
    ctaLabel: 'Get a pass',
    features: [
      'Every dataset in the catalogue, all 54 countries',
      'Unlimited downloads while your pass is active',
      'New datasets as we release them',
      'Pay for 1, 6 or 12 months, nothing renews on its own',
    ],
  },
  team: {
    slug: 'team', name: 'Team', price: 0, priceLabel: 'Get a quote',
    description: `A shared workspace and every dataset, from ${TEAM_MIN_SEATS} seats, priced to what you need.`,
    selfServe: false, contactHref: '/projects',
    ctaLabel: 'Tell us what you need',
    features: [
      'Every dataset, for every seat',
      'Project workspace: live web map, discussion, full history',
      'On-site support, custom data and API access if you need them',
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

/** Terms shown wherever an Individual pass is sold. */
export const LICENCE_TERMS = 'One pass per person. Datasets may not be redistributed, resold or republished. Files you have downloaded stay with you when a pass ends.'
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
    tagline: 'Everything, for as long as you need it.',
    count: 'Whole catalogue',
    datasets: ['Every dataset, all 54 African countries', 'Unlimited downloads while your pass is active', 'New datasets as we release them', 'Your 3 free datasets always stay yours'],
  },
  team: {
    bg: '#0D2B45', border: '#F5B800', nameColor: '#F5B800', priceColor: '#FFFFFF',
    dotColor: '#F5B800', btnBg: '#F5B800', dividerColor: '#F5B800',
    tagline: 'A shared workspace for GIS teams on real projects.',
    count: `From ${TEAM_MIN_SEATS} seats`,
    datasets: ['Tell us what you need, we quote it', 'Project workspace with live web map', 'Discussion and full project history', 'Every dataset, always up to date', 'On-site support, custom data and API on request'],
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