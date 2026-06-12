// src/lib/pricing.ts
// Single source of truth for all pricing, tier, and trial logic.
// Every page, component, and API route imports from here.

export type TierSlug = 'starter' | 'pro' | 'max' | 'enterprise' | 'team'
export type UserState = 'free_trial' | 'free' | TierSlug

export interface Plan {
  slug:           TierSlug
  name:           string
  price:          number
  priceLabel:     string
  description:    string
  downloadLimit:  number   // -1 = unlimited
  seats:          number
  datasetCount:   number   // -1 = all
  apiAccess:      boolean
  customDatasets: boolean
  highlighted:    boolean
  ctaLabel:       string
  features:       string[]
}

export const PLANS: Record<TierSlug, Plan> = {
  starter: {
    slug: 'starter', name: 'Starter', price: 5, priceLabel: '$5',
    description: 'Core environmental datasets for researchers and students.',
    downloadLimit: 20, seats: 1, datasetCount: 5,
    apiAccess: false, customDatasets: false, highlighted: false,
    ctaLabel: 'Get Starter',
    features: [
      'Administrative Boundaries, Transboundary Aquifers, Drought Index, Rainfall & Protected Areas',
      '20 downloads per month across all datasets',
      'All 54 African countries',
      'Shapefile, GeoJSON, GeoTIFF formats',
      'Email support',
    ],
  },
  pro: {
    slug: 'pro', name: 'Pro', price: 12, priceLabel: '$12',
    description: 'Expanded access including hydrology, population and infrastructure data.',
    downloadLimit: 80, seats: 1, datasetCount: 9,
    apiAccess: false, customDatasets: false, highlighted: true,
    ctaLabel: 'Get Pro',
    features: [
      'Everything in Starter',
      'Watersheds & Catchments, Population, River Networks & Roads',
      '80 downloads per month across all datasets',
      'All 54 African countries',
      'All formats + priority support',
    ],
  },
  max: {
    slug: 'max', name: 'Max', price: 20, priceLabel: '$20',
    description: 'Full catalogue — every dataset, unlimited downloads, continental bundles.',
    downloadLimit: -1, seats: 1, datasetCount: -1,
    apiAccess: false, customDatasets: false, highlighted: false,
    ctaLabel: 'Get Max',
    features: [
      'Every dataset — full catalogue',
      'Temperature, HydroRIVERS, LULC, Lakes, Soil & Wetlands included',
      'Unlimited downloads',
      'Combined continental bundle downloads',
      'All formats + priority support',
    ],
  },
  enterprise: {
    slug: 'enterprise', name: 'Enterprise', price: 75, priceLabel: '$75',
    description: 'For teams and organisations needing shared access and custom data.',
    downloadLimit: -1, seats: 3, datasetCount: -1,
    apiAccess: true, customDatasets: true, highlighted: false,
    ctaLabel: 'Get Enterprise',
    features: [
      'Everything in Max',
      'Up to 3 team seats',
      'Custom sub-country datasets',
      'Unlimited downloads + API access',
      'Commercial use licence + dedicated support',
    ],
  },
  // "For Project Teams and Businesses" (internal name: Lenga for Projects).
  // Quote-based, per-seat, provisioned manually by admin — NEVER purchasable
  // through Lipila checkout. Replaces the legacy flat $75 Enterprise tier,
  // which stays in the type system so existing rows keep resolving but is
  // delisted from every purchase surface.
  team: {
    slug: 'team', name: 'For Project Teams and Businesses', price: 45, priceLabel: '$45/seat',
    description: 'Per-seat team plan with a shared workspace. Quote-based — we provision your team.',
    downloadLimit: -1, seats: -1, datasetCount: -1,
    apiAccess: true, customDatasets: true, highlighted: false,
    ctaLabel: 'Get a quote',
    features: [
      'Every dataset, all 15, across all 54 African countries',
      'Shared team workspace and download history',
      'Owner-managed seats',
      'API access with rate limits',
      'Custom sub-country datasets',
      'Commercial use licence + direct email support',
    ],
  },
}

// Full ladder including non-self-serve tiers. Drives access comparisons
// (canAccessDataset) — team sits above enterprise so members get the full
// catalogue. Do NOT map over this for purchase UIs; use SELF_SERVE_PLAN_ORDER.
export const PLAN_ORDER: TierSlug[] = ['starter', 'pro', 'max', 'enterprise', 'team']

// What an individual can buy through checkout. Enterprise is legacy
// (delisted 2026-06: replaced by the quote-based team tier) and team is
// quote-only — neither belongs on a self-serve purchase surface.
export const SELF_SERVE_PLAN_ORDER: TierSlug[] = ['starter', 'pro', 'max']

// ─── Plan card UI ─────────────────────────────────────────────
// Shared visual tokens + copy for the pricing blocks.
// Consumed by both /pricing and /dashboard so the two never drift.

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

// PLAN_CARD_UI uses derived dataset counts — see datasetCountForTier()
// below. Hardcoding "5 / 9 / 15" used to drift the moment we added or
// renamed a layer; deriving from DATASET_MIN_TIER means the truth is in
// one place.
export const PLAN_CARD_UI: Record<TierSlug, PlanCardUI> = {
  starter: {
    bg: '#EAF3DE', border: '#97C459', nameColor: '#3B6D11', priceColor: '#27500A',
    dotColor: '#3B6D11', btnBg: '#639922', dividerColor: '#3B6D11',
    tagline: 'Core environmental layers to get you mapping.',
    count: '__derived__',
    datasets: ['Administrative Boundaries', 'Transboundary Aquifers', 'Drought Index (SPI-12)', 'Rainfall Data', 'Protected Areas & Wildlife'],
  },
  pro: {
    bg: '#E6F1FB', border: '#85B7EB', nameColor: '#185FA5', priceColor: '#0C447C',
    dotColor: '#185FA5', btnBg: '#185FA5', dividerColor: '#185FA5',
    tagline: 'Everything in Starter, plus hydrology and infrastructure.',
    count: '__derived__',
    datasets: ['Everything in Starter', 'Watersheds & Catchments', 'Population & Settlements', 'River Networks', 'Roads & Infrastructure'],
  },
  max: {
    bg: '#EEEDFE', border: '#AFA9EC', nameColor: '#534AB7', priceColor: '#3C3489',
    dotColor: '#534AB7', btnBg: '#534AB7', dividerColor: '#534AB7',
    tagline: 'The full platform — every layer we have.',
    count: '__derived__',
    datasets: ['Everything in Pro', 'Temperature Data', 'HydroRIVERS', 'Land Use / Land Cover', 'Lakes', 'Soil Classification', 'Wetlands & Floodplains'],
  },
  enterprise: {
    bg: '#FAEEDA', border: '#EF9F27', nameColor: '#854F0B', priceColor: '#633806',
    dotColor: '#854F0B', btnBg: '#854F0B', dividerColor: '#854F0B',
    tagline: 'Max, plus custom sub-country datasets and team access.',
    count: 'Everything in Max, plus',
    datasets: ['3 team seats included', 'Custom sub-country datasets', 'Priority support', 'API access'],
  },
  team: {
    bg: '#0D2B45', border: '#F5B800', nameColor: '#F5B800', priceColor: '#FFFFFF',
    dotColor: '#F5B800', btnBg: '#F5B800', dividerColor: '#F5B800',
    tagline: 'A shared workspace for GIS teams on real projects.',
    count: 'Everything in Max, plus',
    datasets: ['Per-seat team accounts', 'Shared download history', 'API access', 'Custom sub-country datasets', 'Commercial use licence'],
  },
}

// ─── Datasets ─────────────────────────────────────────────────
// Slugs match the id field in api-datasets.ts EXACTLY — do not change

export type DatasetSlug =
  | 'admin-boundaries' | 'aquifer' | 'drought-index'
  | 'rainfall' | 'protected-areas'
  | 'watersheds' | 'population' | 'rivers' | 'roads'
  | 'temperature' | 'hydrorivers' | 'lulc' | 'lakes' | 'soil' | 'wetlands'

export const DATASET_MIN_TIER: Record<DatasetSlug, TierSlug> = {
  // Starter (5)
  'admin-boundaries': 'starter',
  'aquifer':          'starter',
  'drought-index':    'starter',
  'rainfall':         'starter',
  'protected-areas':  'starter',
  // Pro adds 4 (total 9)
  'watersheds':       'pro',
  'population':       'pro',
  'rivers':           'pro',
  'roads':            'pro',
  // Max adds everything else (total 15)
  'temperature':      'max',
  'hydrorivers':      'max',
  'lulc':             'max',
  'lakes':            'max',
  'soil':             'max',
  'wetlands':         'max',
}

// ─── Derived count helpers ────────────────────────────────────
// Single source of truth for "how many datasets does X tier include?".
// Tiers stack: pro includes everything starter has, max includes
// everything pro has, enterprise = max + extras.

export function datasetCountForTier(tier: TierSlug): number {
  if (tier === 'enterprise' || tier === 'team') return datasetCountForTier('max')
  const tierIdx = PLAN_ORDER.indexOf(tier)
  return Object.values(DATASET_MIN_TIER).filter(
    (minTier) => PLAN_ORDER.indexOf(minTier) <= tierIdx,
  ).length
}

/** Resolves the `count` field on a PlanCardUI; substitutes the derived
 *  count when the static value is the `__derived__` sentinel. */
export function planCardCount(tier: TierSlug): string {
  const raw = PLAN_CARD_UI[tier].count
  if (raw !== '__derived__') return raw
  return `${datasetCountForTier(tier)} datasets`
}

// ─── Trial ────────────────────────────────────────────────────

export const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000 // 72 hours

/**
 * Maximum number of dataset downloads granted during a free trial.
 *
 * Set high enough to actually evaluate the catalogue (sample a few
 * continents, compare raster vs vector formats, test a QML in QGIS), low
 * enough that a power user can't drain the whole library before deciding
 * to pay. Enforced server-side in /api/usage/consume-download.
 */
export const TRIAL_DOWNLOAD_CAP = 10

export function getUserState(
  plan:            string | undefined | null,
  trialStartedAt:  string | undefined | null,
  planStatus:      string | undefined | null,
): UserState {
  if (planStatus === 'active' &&
      plan && ['starter', 'pro', 'max', 'enterprise', 'team'].includes(plan)) {
    return plan as TierSlug
  }
  if (trialStartedAt) {
    const elapsed = Date.now() - new Date(trialStartedAt).getTime()
    if (elapsed < TRIAL_DURATION_MS) return 'free_trial'
  }
  return 'free'
}

export function trialMsRemaining(trialStartedAt: string | undefined | null): number {
  if (!trialStartedAt) return 0
  return Math.max(0, TRIAL_DURATION_MS - (Date.now() - new Date(trialStartedAt).getTime()))
}

export function formatTrialCountdown(trialStartedAt: string | undefined | null): string {
  const ms = trialMsRemaining(trialStartedAt)
  if (ms <= 0) return 'Expired'
  const totalHours = Math.floor(ms / 3_600_000)
  const days  = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}, ${hours}h`
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  return `${hours}h ${mins}m`
}

// ─── Access helpers ───────────────────────────────────────────

export function getTierLabel(state: UserState): string {
  const labels: Record<UserState, string> = {
    free_trial:  'Free Trial',
    free:        'Free',
    starter:     'Starter',
    pro:         'Pro',
    max:         'Max',
    enterprise:  'Enterprise',
    team:        'Team',
  }
  return labels[state]
}

export function canAccessFiles(state: UserState): boolean {
  return state !== 'free'
}

export function canAccessDataset(userPlan: TierSlug, slug: DatasetSlug): boolean {
  return PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(DATASET_MIN_TIER[slug])
}

export function nextTier(userPlan: TierSlug): TierSlug | null {
  // Self-serve upgrades top out at Max. Enterprise (legacy) and team are
  // quote-based, never an automatic "next step" in checkout UIs.
  const i = SELF_SERVE_PLAN_ORDER.indexOf(userPlan)
  if (i === -1) return null
  return i < SELF_SERVE_PLAN_ORDER.length - 1 ? SELF_SERVE_PLAN_ORDER[i + 1] : null
}