// src/lib/pricing.ts
// Single source of truth for all pricing and access logic.
// Every page, component, and API route imports from here.
//
// ─── ONCE-OFF MODEL (2026-08) ──────────────────────────────────
// Replaced the 5-tier monthly system (Starter/Pro/Max/Enterprise/Team)
// with two flat, once-off, no-expiry plans. Every paid account — either
// plan — gets every dataset. There is no more per-dataset gating, no
// free trial, no recurring billing, no self-serve checkout. Access is
// granted manually by an admin after the buyer contacts us and pays via
// bank transfer (see /api/admin/payments/verify).
//
// Old TierSlug values ('starter' | 'pro' | 'max' | 'enterprise') and the
// dataset-tier ladder (DATASET_MIN_TIER, PLAN_ORDER, datasetCountForTier,
// canAccessDataset) are gone. Anything still importing them will fail to
// compile — that's the map for Phase 2 (dataset-access.ts /
// DownloadGateContext.tsx) and Phase 3 (kill the trial system).

export type TierSlug = 'individual' | 'team'
export type UserState = 'free' | TierSlug

export interface Plan {
  slug:         TierSlug
  name:         string
  price:        number     // USD, per seat for 'team'
  priceLabel:   string
  description:  string
  perSeat:      boolean
  minSeats:     number      // enforced at admin-grant / quote time
  selfServe:    boolean     // true = has its own pay-now flow (bank transfer + proof + admin approval)
  contactHref:  string      // "talk to me first" alternative, for both plans
  ctaLabel:     string
  features:     string[]
}

// Two parallel paths to get paid, per plan:
//   selfServe (individual only) -> /dashboard/payment -> BankTransferPanel:
//     buyer gets bank details immediately (auto-emailed), pays, uploads
//     proof, lands in the admin queue as 'pending'. Fastest path — no
//     waiting on a reply first. Admin approval grants access immediately,
//     no expiry.
//   contactHref (both plans) -> talk first, get bank details by email
//     manually, same admin-approval queue underneath. Team ALWAYS goes
//     this route (seats need negotiating) -> /projects.
export const PLANS: Record<TierSlug, Plan> = {
  individual: {
    slug: 'individual', name: 'Individual', price: 50, priceLabel: '$50 once-off',
    description: 'One-time payment. Every dataset, every country, no expiry.',
    perSeat: false, minSeats: 1, selfServe: true, contactHref: '/contact-us',
    ctaLabel: 'Get access',
    features: [
      'All 15 datasets, all 54 African countries',
      'Unlimited downloads',
      'Pay once — access never expires',
      'Shapefile, GeoJSON, GeoTIFF formats',
      'Email support',
    ],
  },
  team: {
    slug: 'team', name: 'Team', price: 45, priceLabel: '$45/seat once-off',
    description: 'One-time per-seat payment for teams and organisations. 2-seat minimum.',
    perSeat: true, minSeats: 2, selfServe: false, contactHref: '/projects',
    ctaLabel: 'Contact us',
    features: [
      'Everything in Individual, per seat',
      'Shared team workspace and download history',
      'Pay once per seat — access never expires',
      'Owner-managed seats, 2-seat minimum',
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
    tagline: 'The full platform, once, no subscription.',
    count: '15 datasets',
    datasets: ['Every dataset we have', 'All 54 African countries', 'Unlimited downloads', 'No expiry'],
  },
  team: {
    bg: '#0D2B45', border: '#F5B800', nameColor: '#F5B800', priceColor: '#FFFFFF',
    dotColor: '#F5B800', btnBg: '#F5B800', dividerColor: '#F5B800',
    tagline: 'A shared workspace for GIS teams on real projects.',
    count: '15 datasets',
    datasets: ['Per-seat team accounts', 'Shared download history', 'Commercial use licence', '2-seat minimum'],
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

export function getUserState(
  plan:       string | undefined | null,
  planStatus: string | undefined | null,
): UserState {
  if (planStatus === 'active' && plan && (plan === 'individual' || plan === 'team')) {
    return plan as TierSlug
  }
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