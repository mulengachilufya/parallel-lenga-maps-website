'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  PLANS, PLAN_ORDER, DATASET_MIN_TIER, getUserState, formatTrialCountdown,
  type TierSlug, type UserState
} from '@/lib/pricing'
import { DATASETS, LIVE_DATASET_ROUTES } from '@/lib/supabase'

// ─── Plan colour tokens (matches pricing page) ─────────────────
const PLAN_STYLE: Record<string, {
  bg: string; border: string; nameColor: string;
  priceColor: string; dotColor: string; btnBg: string;
}> = {
  starter:    { bg: '#EAF3DE', border: '#97C459',  nameColor: '#3B6D11', priceColor: '#27500A', dotColor: '#3B6D11', btnBg: '#639922' },
  pro:        { bg: '#E6F1FB', border: '#85B7EB',  nameColor: '#185FA5', priceColor: '#0C447C', dotColor: '#185FA5', btnBg: '#185FA5' },
  max:        { bg: '#EEEDFE', border: '#AFA9EC',  nameColor: '#534AB7', priceColor: '#3C3489', dotColor: '#534AB7', btnBg: '#534AB7' },
  enterprise: { bg: '#FAEEDA', border: '#EF9F27',  nameColor: '#854F0B', priceColor: '#633806', dotColor: '#854F0B', btnBg: '#854F0B' },
  free_trial: { bg: '#EEEDFE', border: '#AFA9EC',  nameColor: '#534AB7', priceColor: '#3C3489', dotColor: '#534AB7', btnBg: '#534AB7' },
  free:       { bg: '#F1EFE8', border: '#B4B2A9',  nameColor: '#5F5E5A', priceColor: '#444441', dotColor: '#888780', btnBg: '#5F5E5A' },
}

// ─── Datasets per plan ─────────────────────────────────────────
const PLAN_DATASETS: Record<string, string[]> = {
  starter:    ['Administrative Boundaries', 'Groundwater Aquifers', 'Drought Index (SPI-12)', 'Rainfall Data', 'Protected Areas & Wildlife'],
  pro:        ['Administrative Boundaries', 'Groundwater Aquifers', 'Drought Index (SPI-12)', 'Rainfall Data', 'Protected Areas & Wildlife', 'Watersheds & Catchments', 'Population & Settlements', 'River Networks', 'Roads & Infrastructure'],
  max:        ['Administrative Boundaries', 'Groundwater Aquifers', 'Drought Index (SPI-12)', 'Rainfall Data', 'Protected Areas & Wildlife', 'Watersheds & Catchments', 'Population & Settlements', 'River Networks', 'Roads & Infrastructure', 'Temperature Data', 'HydroRIVERS', 'Land Use / Land Cover', 'Lakes', 'Soil Classification', 'Wetlands & Floodplains'],
  enterprise: ['Administrative Boundaries', 'Groundwater Aquifers', 'Drought Index (SPI-12)', 'Rainfall Data', 'Protected Areas & Wildlife', 'Watersheds & Catchments', 'Population & Settlements', 'River Networks', 'Roads & Infrastructure', 'Temperature Data', 'HydroRIVERS', 'Land Use / Land Cover', 'Lakes', 'Soil Classification', 'Wetlands & Floodplains', 'Custom Sub-country Datasets'],
  free_trial: ['Administrative Boundaries', 'Groundwater Aquifers', 'Drought Index (SPI-12)', 'Rainfall Data', 'Protected Areas & Wildlife', 'Watersheds & Catchments', 'Population & Settlements', 'River Networks', 'Roads & Infrastructure', 'Temperature Data', 'HydroRIVERS', 'Land Use / Land Cover', 'Lakes', 'Soil Classification', 'Wetlands & Floodplains'],
  free:       [],
}

const NEXT_PLAN: Record<string, TierSlug | null> = {
  free:       'starter',
  free_trial: 'starter',
  starter:    'pro',
  pro:        'max',
  max:        'enterprise',
  enterprise: null,
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading,         setLoading]         = useState(true)
  const [userState,       setUserState]       = useState<UserState>('free')
  const [trialStartedAt,  setTrialStartedAt]  = useState<string | null>(null)
  const [userName,        setUserName]        = useState('')
  const [userEmail,       setUserEmail]       = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, plan_status, trial_started_at, full_name')
        .eq('id', session.user.id)
        .single()

      setUserState(getUserState(profile?.plan, profile?.trial_started_at, profile?.plan_status))
      setTrialStartedAt(profile?.trial_started_at ?? null)
      setUserName(profile?.full_name || session.user.user_metadata?.full_name || '')
      setUserEmail(session.user.email || '')
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  const style      = PLAN_STYLE[userState] ?? PLAN_STYLE.free
  const datasets   = PLAN_DATASETS[userState] ?? []
  const nextPlan   = NEXT_PLAN[userState]
  const isTrial    = userState === 'free_trial'
  const isFree     = userState === 'free'
  const planLabel  = isTrial ? 'Free Trial' : isFree ? 'Free' : PLANS[userState as TierSlug]?.name ?? ''
  const planPrice  = (!isTrial && !isFree) ? PLANS[userState as TierSlug]?.priceLabel : null
  const nextStyle  = nextPlan ? PLAN_STYLE[nextPlan] : null
  const nextPlanData = nextPlan ? PLANS[nextPlan] : null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-20" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy">
            {userName ? `Welcome back, ${userName.split(' ')[0]}` : 'Your dashboard'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">All 54 African countries · 15 datasets</p>
        </div>

{userEmail === 'cmulenga672@gmail.com' && (
  <div className="mb-6">
    <Link
      href="/admin"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#1a1a1a', color: '#fff', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
    >
      Admin panel
    </Link>
  </div>
)}

        {/* Top row: current plan + upgrade */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">

          {/* Current plan card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: '16px', padding: '1.5rem' }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: style.nameColor, marginBottom: '0.4rem' }}>
              Current plan
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, lineHeight: 1, color: style.priceColor }}>{planLabel}</span>
              {planPrice && <span style={{ fontSize: '14px', color: '#555' }}>{planPrice}/mo</span>}
            </div>

            {isTrial && (
              <div style={{ fontSize: '13px', color: style.nameColor, background: '#fff', border: `1px solid ${style.border}`, borderRadius: '8px', padding: '6px 12px', display: 'inline-block', marginBottom: '1rem' }}>
                {formatTrialCountdown(trialStartedAt)} remaining · Full Max access
              </div>
            )}

            {datasets.length > 0 ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888', marginBottom: '0.5rem' }}>
                  Your datasets ({datasets.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {datasets.map(d => (
                    <span key={d} style={{ fontSize: '12px', background: '#fff', border: `1px solid ${style.border}`, borderRadius: '20px', padding: '3px 10px', color: style.nameColor, fontWeight: 500 }}>
                      {d}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ fontSize: '13px', color: '#888' }}>No active plan. Subscribe to access datasets.</p>
            )}
          </motion.div>

          {/* Upgrade card */}
          {nextPlan && nextPlanData && nextStyle ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Link
                href={`/dashboard/payment?plan=${nextPlan}`}
                style={{ background: nextStyle.bg, border: `1px solid ${nextStyle.border}`, borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%', textDecoration: 'none', transition: 'transform 0.18s ease, box-shadow 0.18s ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 28px rgba(0,0,0,0.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: nextStyle.nameColor, marginBottom: '0.4rem' }}>
                  {isTrial || isFree ? 'Subscribe now' : 'Upgrade to'}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '32px', fontWeight: 700, lineHeight: 1, color: nextStyle.priceColor }}>{nextPlanData.name}</span>
                  <span style={{ fontSize: '14px', color: '#555' }}>{nextPlanData.priceLabel}/mo</span>
                </div>
                <p style={{ fontSize: '13px', color: '#555', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {nextPlanData.description}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '1.25rem' }}>
                  {PLAN_DATASETS[nextPlan]?.slice(0, 6).map(d => (
                    <span key={d} style={{ fontSize: '12px', background: '#fff', border: `1px solid ${nextStyle.border}`, borderRadius: '20px', padding: '3px 10px', color: nextStyle.nameColor, fontWeight: 500 }}>
                      {d}
                    </span>
                  ))}
                  {(PLAN_DATASETS[nextPlan]?.length ?? 0) > 6 && (
                    <span style={{ fontSize: '12px', background: nextStyle.btnBg, borderRadius: '20px', padding: '3px 10px', color: '#fff', fontWeight: 500 }}>
                      +{(PLAN_DATASETS[nextPlan]?.length ?? 0) - 6} more
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 'auto', background: nextStyle.btnBg, color: '#fff', borderRadius: '10px', padding: '10px 0', textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>
                  {isTrial || isFree ? `Subscribe · ${nextPlanData.priceLabel}/mo` : `Upgrade · ${nextPlanData.priceLabel}/mo`}
                </div>
              </Link>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              style={{ background: '#FAEEDA', border: '1px solid #EF9F27', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#854F0B', marginBottom: '0.5rem' }}>Enterprise</div>
              <p style={{ fontSize: '14px', color: '#633806', fontWeight: 500, marginBottom: '0.5rem' }}>You're on the highest plan.</p>
              <p style={{ fontSize: '13px', color: '#888' }}>Need custom sub-country datasets or additional seats? Contact us.</p>
              <Link href="/contact" style={{ marginTop: '1rem', background: '#854F0B', color: '#fff', borderRadius: '10px', padding: '10px 0', textAlign: 'center', fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'block' }}>
                Contact us
              </Link>
            </motion.div>
          )}
        </div>

        {/* Datasets section */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-navy mb-1">Browse & Download Datasets</h2>
          <p className="text-sm text-gray-500">Click any dataset to explore country-level files.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {DATASETS.map((dataset, i) => {
            const isLive = dataset.id in LIVE_DATASET_ROUTES
            const ID_TO_SLUG: Record<number, import('@/lib/pricing').DatasetSlug> = {
  1:  'admin-boundaries',
  3:  'rivers',
  4:  'lulc',
  5:  'drought-index',
  6:  'aquifer',
  8:  'population',
  9:  'roads',
  11: 'soil',
  12: 'protected-areas',
  13: 'rivers',
  14: 'watersheds',
  15: 'rainfall',
  16: 'temperature',
  17: 'lakes',
}
            const datasetSlug = ID_TO_SLUG[dataset.id]
            const minTier = datasetSlug ? DATASET_MIN_TIER[datasetSlug] : null
            const userTier = (!isTrial && !isFree) ? (userState as TierSlug) : isTrial ? 'max' : null
            const hasAccess = isLive && (
              isTrial ||
              (userTier !== null && minTier !== null &&
                PLAN_ORDER.indexOf(userTier) >= PLAN_ORDER.indexOf(minTier))
            )

            return (
              <motion.div
                key={dataset.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
              >
                {hasAccess ? (
                  <Link
                    href={LIVE_DATASET_ROUTES[dataset.id]}
                    className="group block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 overflow-hidden h-full"
                  >
                    <div className="h-1.5 w-full" style={{ backgroundColor: dataset.color }} />
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: `${dataset.color}15` }}>
                          {dataset.icon}
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: dataset.color }}>{dataset.category}</div>
                          <h3 className="text-sm font-bold text-navy group-hover:text-primary transition-colors leading-tight">{dataset.name}</h3>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{dataset.description}</p>
                    </div>
                  </Link>
                ) : (
                  <LockedDatasetCard
                    dataset={dataset}
                    isLive={isLive}
                    minTier={minTier}
                    userState={userState}
                  />
                )}
              </motion.div>
            )
          })}
        </div>

      </div>
    </div>
  )
}

// ─── Locked dataset card + modal ──────────────────────────────
const TIER_NAMES: Record<string, string> = {
  starter:    'Starter ($5/mo)',
  pro:        'Pro ($12/mo)',
  max:        'Max ($20/mo)',
  enterprise: 'Enterprise ($75/mo)',
}

function isFreeState(state: string) {
  return state === 'free' || state === 'free_trial'
}

function LockedDatasetCard({
  dataset, isLive, minTier, userState,
}: {
  dataset: { id: number; icon: string; color: string; category: string; name: string; description: string }
  isLive: boolean
  minTier: string | null
  userState: string
}) {
  const [open, setOpen] = useState(false)
  const showUpgrade = isLive && userState !== 'enterprise'
  const upgradePlan = minTier ?? 'starter'
  const message = !isLive
    ? 'This dataset is coming soon.'
    : isFreeState(userState)
      ? `This dataset requires the ${TIER_NAMES[minTier ?? 'starter']} plan or higher.`
      : `Your current plan doesn't include this dataset. It requires the ${TIER_NAMES[minTier ?? 'starter']} plan.`

  return (
    <>
      <button
        onClick={() => isLive && setOpen(true)}
        className="group w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full transition-all duration-200 hover:shadow-md"
        style={{ cursor: isLive ? 'pointer' : 'default' }}
      >
        <div className="h-1.5 w-full" style={{ backgroundColor: dataset.color }} />
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 opacity-50" style={{ backgroundColor: `${dataset.color}15` }}>
              {dataset.icon}
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: dataset.color }}>{dataset.category}</div>
              <h3 className="text-sm font-bold text-navy leading-tight">{dataset.name}</h3>
            </div>
            {isLive && minTier && (
              <span style={{ fontSize: '11px', fontWeight: 600, background: PLAN_STYLE[minTier]?.bg ?? '#f3f4f6', color: PLAN_STYLE[minTier]?.nameColor ?? '#555', border: `1px solid ${PLAN_STYLE[minTier]?.border ?? '#ddd'}`, borderRadius: '20px', padding: '2px 8px', flexShrink: 0 }}>
                {minTier.charAt(0).toUpperCase() + minTier.slice(1)}+
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{dataset.description}</p>
          {!isLive
            ? <span className="inline-block mt-3 text-[10px] bg-gray-100 text-gray-500 font-semibold px-2 py-1 rounded-full">Coming soon</span>
            : <span className="inline-block mt-3 text-[10px] bg-gray-100 text-gray-500 font-semibold px-2 py-1 rounded-full">Locked — tap to upgrade</span>
          }
        </div>
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: '16px', padding: '2rem', maxWidth: '380px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '22px', marginBottom: '0.75rem' }}>{dataset.icon}</div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a2e', marginBottom: '0.5rem' }}>{dataset.name}</h3>
            <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.6, marginBottom: '1.25rem' }}>{message}</p>
            {minTier && (
              <div style={{ background: PLAN_STYLE[minTier]?.bg, border: `1px solid ${PLAN_STYLE[minTier]?.border}`, borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: PLAN_STYLE[minTier]?.nameColor, marginBottom: '2px' }}>Required plan</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: PLAN_STYLE[minTier]?.priceColor }}>{TIER_NAMES[minTier]}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              {showUpgrade && (
                <Link
                  href={`/dashboard/payment?plan=${upgradePlan}`}
                  style={{ flex: 1, background: PLAN_STYLE[upgradePlan]?.btnBg ?? '#1a1a1a', color: '#fff', borderRadius: '10px', padding: '10px 0', textAlign: 'center', fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'block' }}
                  onClick={() => setOpen(false)}
                >
                  Upgrade now
                </Link>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{ flex: showUpgrade ? '0 0 auto' : 1, background: '#f3f4f6', color: '#555', borderRadius: '10px', padding: '10px 16px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}