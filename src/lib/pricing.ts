// src/lib/pricing.ts
// Single source of truth for all pricing, tier, and trial logic.
// Every page, component, and API route imports from here.

export type TierSlug = 'starter' | 'pro' | 'max' | 'enterprise'
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
      'Administrative Boundaries, Groundwater, Drought Index, Rainfall & Protected Areas',
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
    description: 'Full catalogue — every dataset, unlimited downloads, API access.',
    downloadLimit: -1, seats: 1, datasetCount: -1,
    apiAccess: true, customDatasets: false, highlighted: false,
    ctaLabel: 'Get Max',
    features: [
      'Every dataset — full catalogue',
      'Temperature, HydroRIVERS, LULC, Lakes, Soil & Wetlands included',
      'Unlimited downloads',
      'API access',
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
}

export const PLAN_ORDER: TierSlug[] = ['starter', 'pro', 'max', 'enterprise']

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

export const PLAN_CARD_UI: Record<TierSlug, PlanCardUI> = {
  starter: {
    bg: '#EAF3DE', border: '#97C459', nameColor: '#3B6D11', priceColor: '#27500A',
    dotColor: '#3B6D11', btnBg: '#639922', dividerColor: '#3B6D11',
    tagline: 'Core environmental layers to get you mapping.',
    count: '5 datasets',
    datasets: ['Administrative Boundaries', 'Groundwater Aquifers', 'Drought Index (SPI-12)', 'Rainfall Data', 'Protected Areas & Wildlife'],
  },
  pro: {
    bg: '#E6F1FB', border: '#85B7EB', nameColor: '#185FA5', priceColor: '#0C447C',
    dotColor: '#185FA5', btnBg: '#185FA5', dividerColor: '#185FA5',
    tagline: 'Everything in Starter, plus hydrology and infrastructure.',
    count: '9 datasets',
    datasets: ['Everything in Starter', 'Watersheds & Catchments', 'Population & Settlements', 'River Networks', 'Roads & Infrastructure'],
  },
  max: {
    bg: '#EEEDFE', border: '#AFA9EC', nameColor: '#534AB7', priceColor: '#3C3489',
    dotColor: '#534AB7', btnBg: '#534AB7', dividerColor: '#534AB7',
    tagline: 'The full platform — every layer we have.',
    count: '15 datasets',
    datasets: ['Everything in Pro', 'Temperature Data', 'HydroRIVERS', 'Land Use / Land Cover', 'Lakes', 'Soil Classification', 'Wetlands & Floodplains'],
  },
  enterprise: {
    bg: '#FAEEDA', border: '#EF9F27', nameColor: '#854F0B', priceColor: '#633806',
    dotColor: '#854F0B', btnBg: '#854F0B', dividerColor: '#854F0B',
    tagline: 'Max, plus custom sub-country datasets and team access.',
    count: 'Everything in Max, plus',
    datasets: ['3 team seats included', 'Custom sub-country datasets', 'Priority support', 'API access'],
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

// ─── Trial ────────────────────────────────────────────────────

export const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000 // 72 hours

export function getUserState(
  plan:            string | undefined | null,
  trialStartedAt:  string | undefined | null,
  planStatus:      string | undefined | null,
): UserState {
  if (planStatus === 'active' &&
      plan && ['starter', 'pro', 'max', 'enterprise'].includes(plan)) {
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
  const i = PLAN_ORDER.indexOf(userPlan)
  return i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1] : null
}