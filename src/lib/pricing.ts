// src/lib/pricing.ts
// Single source of truth for all pricing and access logic.
// Every page, component, and API route imports from here.
//
// ─── 3-MONTH ACCESS MODEL (2026-09) ────────────────────────────
// Replaced the 5-tier monthly system (Starter/Pro/Max/Enterprise/Team)
// with two flat plans, each paid up front for ACCESS_MONTHS of access.
// Paying again extends access from the current expiry. Accounts that were
// active before 2026-09 keep permanent access (plan_expires_at is null for
// them, and null always means "does not expire"). Every paid account — either
// plan — gets every dataset. There is no more per-dataset gating, no
// free trial, no automatic billing, no card checkout. Access is
// granted manually by an admin after the buyer contacts us and pays via
// bank transfer (see /api/admin/payments/verify).
//
// Old TierSlug values ('starter' | 'pro' | 'max' | 'enterprise') and the
// dataset-tier ladder are gone. Accounts that were active on a legacy tier
// were migrated to permanent 'individual' access (migration 029).

export type TierSlug = 'individual' | 'team'

/** Length of one paid access period, for both plans. */
export const ACCESS_MONTHS = 3
export const TERM_LABEL = 'for 3 months'

/** When access paid for now ends: ACCESS_MONTHS after `from`, or after an
 *  expiry that is still in the future (so renewing early loses nothing). */
export function accessExpiry(currentExpiry?: string | null, now = new Date()): string {
  const cur = currentExpiry ? new Date(currentExpiry) : null
  const base = cur && cur > now ? new Date(cur) : new Date(now)
  base.setMonth(base.getMonth() + ACCESS_MONTHS)
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
  price:        number     // USD; for 'team' the smallest package
  priceLabel:   string
  description:  string
  selfServe:    boolean     // true = has its own pay-now flow (bank transfer + proof + admin approval)
  contactHref:  string      // "talk to me first" alternative, for both plans
  ctaLabel:     string
  features:     string[]
}

// Two parallel paths to get paid, per plan:
//   selfServe (individual only) -> /dashboard/payment -> BankTransferPanel:
//     buyer gets bank details immediately (auto-emailed), pays, uploads
//     proof, lands in the admin queue as 'pending'. Fastest path — no
//     waiting on a reply first. Admin approval grants ACCESS_MONTHS of
//     access immediately.
//   contactHref (both plans) -> talk first, get bank details by email
//     manually, same admin-approval queue underneath. Team ALWAYS goes
//     this route (package + seats confirmed on a quote) -> /projects.

// Team is sold as fixed-size packages, not per seat. Admin provisions the
// org with seat_count = maxSeats of the package that was paid for.
export interface TeamPackage {
  id:       'team-4' | 'team-12'
  label:    string
  maxSeats: number
  price:    number   // USD per 3-month period, whole package
  blurb:    string
}

export const TEAM_PACKAGES: TeamPackage[] = [
  {
    id: 'team-4', label: 'Small team', maxSeats: 4, price: 350,
    blurb: 'For project teams getting a shared workspace for the first time.',
  },
  {
    id: 'team-12', label: 'Organisation', maxSeats: 12, price: 1000,
    blurb: 'For departments and multi-project teams that live in GIS data.',
  },
]

export const PLANS: Record<TierSlug, Plan> = {
  individual: {
    slug: 'individual', name: 'Individual', price: 100, priceLabel: '$100 for 3 months',
    description: 'Every dataset, every country, for 3 months. Renew whenever you need more time.',
    selfServe: true, contactHref: '/contact-us',
    ctaLabel: 'Get access',
    features: [
      'All 15 datasets, all 54 African countries',
      'Unlimited downloads',
      '3 months of access; renewing adds 3 more',
      'Shapefile, GeoJSON, GeoTIFF formats',
      'Email support',
    ],
  },
  team: {
    slug: 'team', name: 'Team', price: 350, priceLabel: 'From $350 for 3 months',
    description: 'For teams, per 3 months: up to 4 seats for $350, up to 12 seats for $1,000.',
    selfServe: false, contactHref: '/projects',
    ctaLabel: 'Contact us',
    features: [
      'Everything in Individual, for every seat',
      'Up to 4 seats for $350, up to 12 seats for $1,000',
      'Project workspace: live web map, team discussion, full history',
      'Shared download history',
      '3 months of access; renewing adds 3 more',
      'Commercial use licence + direct email support',
    ],
  },
}

export const PLAN_ORDER: TierSlug[] = ['individual', 'team']

// Plans with their own pay-now flow (bank-details/manual-proof/admin-verify).
export const SELF_SERVE_PLAN_ORDER: TierSlug[] = ['individual']

/**
 * Where a plan's primary CTA should send a buyer. Single source of truth —
 * every place that renders a plan CTA (paywall modal, /pricing, dashboard)
 * calls this instead of re-deriving the routing rule locally. That
 * duplication is exactly what caused the self-serve flow to briefly break
 * during the once-off migration — three copies of the same branch, one of
 * them wrong.
 */
export function planCtaHref(slug: TierSlug): string {
  const plan = PLANS[slug]
  return plan.selfServe ? `/dashboard/payment?plan=${slug}` : plan.contactHref
}

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
    tagline: 'The full platform for 3 months. No auto-renewal.',
    count: '15 datasets',
    datasets: ['Every dataset we have', 'All 54 African countries', 'Unlimited downloads', '3 months per payment'],
  },
  team: {
    bg: '#0D2B45', border: '#F5B800', nameColor: '#F5B800', priceColor: '#FFFFFF',
    dotColor: '#F5B800', btnBg: '#F5B800', dividerColor: '#F5B800',
    tagline: 'A shared workspace for GIS teams on real projects.',
    count: '15 datasets',
    datasets: ['Up to 4 seats: $350', 'Up to 12 seats: $1,000', 'Project workspace with live web map', 'Team discussion and project history', 'Commercial use licence'],
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

export const ALL_DATASETS: DatasetSlug[] = [
  'admin-boundaries', 'aquifer', 'drought-index', 'rainfall', 'protected-areas',
  'watersheds', 'population', 'rivers', 'roads',
  'temperature', 'hydrorivers', 'lulc', 'lakes', 'soil', 'wetlands',
]

export const DATASET_COUNT = ALL_DATASETS.length

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