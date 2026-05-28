'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Loader2, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DownloadGateProvider } from '@/contexts/DownloadGateContext'
import {
  PLANS, PLAN_ORDER, DATASET_MIN_TIER, getUserState, formatTrialCountdown,
  type TierSlug, type UserState
} from '@/lib/pricing'
import { DATASETS, LIVE_DATASET_ROUTES } from '@/lib/supabase'

// Dataset section components
import AdminBoundariesList  from '@/components/AdminBoundariesList'
import HydrologyList        from '@/components/HydrologyList'
import RiversList           from '@/components/RiversList'
import WatershedsList       from '@/components/WatershedsList'
import RainfallClimateList  from '@/components/RainfallClimateList'
import AquiferList          from '@/components/AquiferList'
import LulcList             from '@/components/LulcList'
import PopulationList       from '@/components/PopulationList'
import ProtectedAreasList   from '@/components/ProtectedAreasList'
import RoadsList            from '@/components/RoadsList'
import SoilList             from '@/components/SoilList'

// ─── Plan style tokens ────────────────────────────────────────
const PLAN_STYLE: Record<string, {
  bg: string; border: string; nameColor: string;
  priceColor: string; btnBg: string;
}> = {
  starter:    { bg: '#EAF3DE', border: '#97C459', nameColor: '#3B6D11', priceColor: '#27500A', btnBg: '#639922' },
  pro:        { bg: '#E6F1FB', border: '#85B7EB', nameColor: '#185FA5', priceColor: '#0C447C', btnBg: '#185FA5' },
  max:        { bg: '#EEEDFE', border: '#AFA9EC', nameColor: '#534AB7', priceColor: '#3C3489', btnBg: '#534AB7' },
  enterprise: { bg: '#FAEEDA', border: '#EF9F27', nameColor: '#854F0B', priceColor: '#633806', btnBg: '#854F0B' },
  free_trial: { bg: '#EEEDFE', border: '#AFA9EC', nameColor: '#534AB7', priceColor: '#3C3489', btnBg: '#534AB7' },
  free:       { bg: '#F1EFE8', border: '#B4B2A9', nameColor: '#5F5E5A', priceColor: '#444441', btnBg: '#5F5E5A' },
}

// ─── Section registry ─────────────────────────────────────────
// Every live dataset section maps to a component.
// The component always renders — access control happens inside
// each component's download button via DownloadGateContext.
const SECTIONS: Record<string, {
  title: string
  subtitle?: string
  component: () => React.ReactNode
}> = {
  'admin-boundaries': {
    title: '🗺️ Administrative Boundaries',
    subtitle: 'GADM v4.1 · Shapefile, GeoJSON, KML · All 54 African countries',
    component: () => <AdminBoundariesList />,
  },
  'rivers': {
    title: '🌊 River Networks',
    subtitle: 'Natural Earth 1:10m · GeoPackage per country',
    component: () => <RiversList />,
  },
  'rainfall': {
    title: '🌧️ Rainfall Data',
    subtitle: 'CHIRPS v2.0 · GeoTIFF (ZIP) · 0.05° (~5 km)',
    component: () => <RainfallClimateList layerType="rainfall" />,
  },
  'temperature': {
    title: '🌡️ Temperature Data',
    subtitle: 'WorldClim v2.1 · GeoTIFF (ZIP) · 2.5 arc-min (~5 km)',
    component: () => <RainfallClimateList layerType="temperature" />,
  },
  'drought-index': {
    title: '🔥 Drought Index (SPI-12)',
    subtitle: 'CHIRPS-derived SPI · GeoTIFF (ZIP) · 0.05° (~5 km)',
    component: () => <RainfallClimateList layerType="drought_index" />,
  },
  'aquifer': {
    title: '💧 Groundwater Aquifers',
    subtitle: 'IGRAC GGIS · GeoPackage · All 54 African countries',
    component: () => <AquiferList />,
  },
  'protected-areas': {
    title: '🐘 Protected Areas & Wildlife',
    subtitle: 'OpenStreetMap · ODbL · Shapefile (ZIP) per country',
    component: () => <ProtectedAreasList />,
  },
  'watersheds': {
    title: '🗺️ Watersheds & Catchments',
    subtitle: 'WWF / HydroSHEDS Level 6 · GeoPackage per country',
    component: () => <WatershedsList />,
  },
  'population': {
    title: '🏘️ Population & Settlements',
    subtitle: 'HDX COD-PS (UN OCHA) · Shapefile (ZIP) · ADM1/ADM2',
    component: () => <PopulationList />,
  },
  'roads': {
    title: '🛣️ Roads & Infrastructure',
    subtitle: 'Natural Earth 1:10m · GeoPackage per country',
    component: () => <RoadsList />,
  },
  'lulc': {
    title: '🌿 Land Use / Land Cover',
    subtitle: 'ESA WorldCover 2021 · GeoTIFF (10m) per country',
    component: () => <LulcList />,
  },
  'lakes': {
    title: '🏞️ Lakes',
    subtitle: 'HydroLAKES · Shapefile (ZIP) per country',
    component: () => <HydrologyList layerType="lakes" />,
  },
  'soil': {
    title: '🌾 Soil Classification',
    subtitle: 'ISRIC SoilGrids v2.0 · GeoTIFF (250m) per country',
    component: () => <SoilList />,
  },
  'rivers-hydro': {
    title: '🌊 HydroRIVERS',
    subtitle: 'WWF / HydroSHEDS · GeoPackage, GeoJSON per country',
    component: () => <HydrologyList layerType="rivers" />,
  },
}

// Map LIVE_DATASET_ROUTES section params to SECTIONS keys
const ROUTE_TO_SECTION: Record<string, string> = {
  'admin-boundaries': 'admin-boundaries',
  'rivers':           'rivers',
  'lulc':             'lulc',
  'drought-index':    'drought-index',
  'aquifer':          'aquifer',
  'population':       'population',
  'roads':            'roads',
  'soil':             'soil',
  'protected-areas':  'protected-areas',
  'watersheds':       'watersheds',
  'rainfall':         'rainfall',
  'temperature':      'temperature',
  'lakes':            'lakes',
}

// ─── Main page ────────────────────────────────────────────────

function DashboardContent() {
  const router      = useRouter()
  const params      = useSearchParams()
  const sectionKey  = params.get('section')
  const sectionData = sectionKey ? SECTIONS[ROUTE_TO_SECTION[sectionKey] ?? sectionKey] : null

  const [loading,        setLoading]        = useState(true)
  const [userState,      setUserState]      = useState<UserState>('free')
  const [trialStartedAt, setTrialStartedAt] = useState<string | null>(null)
  const [userName,       setUserName]       = useState('')
  const [userEmail,      setUserEmail]      = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, plan_status, trial_started_at, full_name')
        .eq('id', session.user.id)
        .single()

      setUserState(getUserState(
        profile?.plan,
        profile?.trial_started_at,
        profile?.plan_status,
      ))
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

  const style     = PLAN_STYLE[userState] ?? PLAN_STYLE.free
  const isTrial   = userState === 'free_trial'
  const isFree    = userState === 'free'
  const planLabel = isTrial ? 'Free Trial' : isFree ? 'Free' : PLANS[userState as TierSlug]?.name ?? ''
  const planPrice = (!isTrial && !isFree) ? PLANS[userState as TierSlug]?.priceLabel : null
  const nextPlan  = isFree || isTrial ? 'starter' :
                    userState === 'starter' ? 'pro' :
                    userState === 'pro'     ? 'max' :
                    userState === 'max'     ? 'enterprise' : null

  // ── Section view ──────────────────────────────────────────
  if (sectionData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="h-20" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors mb-6"
          >
            <ArrowLeft size={15} />
            Back to all datasets
          </Link>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-navy">{sectionData.title}</h1>
            {sectionData.subtitle && (
              <p className="text-xs text-gray-400 mt-1">{sectionData.subtitle}</p>
            )}
            {/* Trial expiry warning inside section */}
            {isTrial && trialStartedAt && (
              <div className="mt-3 inline-flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-sm text-yellow-800">
                ⏱ Free trial — {formatTrialCountdown(trialStartedAt)} remaining · Full access active
              </div>
            )}
            {isFree && (
              <div className="mt-3 inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">
                🔒 Your trial has ended — subscribe to download files
                <Link href="/dashboard/payment?plan=starter" className="font-semibold underline ml-1">
                  Subscribe
                </Link>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            {sectionData.component()}
          </div>
        </div>
      </div>
    )
  }

  // ── Overview ──────────────────────────────────────────────
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

        {/* Admin link */}
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

        {/* Trial banner */}
        {isTrial && trialStartedAt && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-yellow-800 text-sm">⏱ Free trial active</p>
              <p className="text-yellow-700 text-xs mt-0.5">
                Full access to all datasets · {formatTrialCountdown(trialStartedAt)} remaining
              </p>
            </div>
            <Link
              href="/dashboard/payment?plan=starter"
              className="shrink-0 text-xs font-bold bg-yellow-800 text-white px-4 py-2 rounded-lg hover:bg-yellow-900 transition-colors"
            >
              Subscribe now
            </Link>
          </div>
        )}

        {/* Free user banner */}
        {isFree && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-red-800 text-sm">Your free trial has ended</p>
              <p className="text-red-600 text-xs mt-0.5">Subscribe to download datasets. Browsing is still free.</p>
            </div>
            <Link
              href="/dashboard/payment?plan=starter"
              className="shrink-0 text-xs font-bold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Subscribe from $5/mo
            </Link>
          </div>
        )}

        {/* Plan cards row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          {/* Current plan */}
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
            {isTrial && trialStartedAt && (
              <div style={{ fontSize: '13px', color: style.nameColor, background: '#fff', border: `1px solid ${style.border}`, borderRadius: '8px', padding: '6px 12px', display: 'inline-block' }}>
                {formatTrialCountdown(trialStartedAt)} remaining · Full access
              </div>
            )}
            {isFree && (
              <p style={{ fontSize: '13px', color: '#888' }}>No active plan. Subscribe to download datasets.</p>
            )}
            {!isTrial && !isFree && (
              <p style={{ fontSize: '13px', color: style.nameColor }}>
                {PLANS[userState as TierSlug]?.description}
              </p>
            )}
          </motion.div>

          {/* Upgrade card */}
          {nextPlan && PLANS[nextPlan] && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Link
                href={`/dashboard/payment?plan=${nextPlan}`}
                style={{ background: PLAN_STYLE[nextPlan]?.bg, border: `1px solid ${PLAN_STYLE[nextPlan]?.border}`, borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%', textDecoration: 'none' }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: PLAN_STYLE[nextPlan]?.nameColor, marginBottom: '0.4rem' }}>
                  {isTrial || isFree ? 'Subscribe now' : 'Upgrade to'}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '32px', fontWeight: 700, lineHeight: 1, color: PLAN_STYLE[nextPlan]?.priceColor }}>{PLANS[nextPlan].name}</span>
                  <span style={{ fontSize: '14px', color: '#555' }}>{PLANS[nextPlan].priceLabel}/mo</span>
                </div>
                <p style={{ fontSize: '13px', color: '#555', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {PLANS[nextPlan].description}
                </p>
                <div style={{ marginTop: 'auto', background: PLAN_STYLE[nextPlan]?.btnBg, color: '#fff', borderRadius: '10px', padding: '10px 0', textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>
                  {isTrial || isFree ? `Subscribe · ${PLANS[nextPlan].priceLabel}/mo` : `Upgrade · ${PLANS[nextPlan].priceLabel}/mo`}
                </div>
              </Link>
            </motion.div>
          )}
        </div>

        {/* Dataset grid */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-navy mb-1">Browse & Download Datasets</h2>
          <p className="text-sm text-gray-500">
            Click any dataset to browse country files. Download buttons enforce your plan tier in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {DATASETS.map((dataset, i) => {
            const isLive = dataset.id in LIVE_DATASET_ROUTES

            const ID_TO_SLUG: Record<number, import('@/lib/pricing').DatasetSlug> = {
              1: 'admin-boundaries', 3: 'rivers',    4: 'lulc',
              5: 'drought-index',   6: 'aquifer',    8: 'population',
              9: 'roads',           11: 'soil',      12: 'protected-areas',
              13: 'rivers',         14: 'watersheds', 15: 'rainfall',
              16: 'temperature',    17: 'lakes',
            }
            const datasetSlug = ID_TO_SLUG[dataset.id]
            const minTier     = datasetSlug ? DATASET_MIN_TIER[datasetSlug] : null

            return (
              <motion.div
                key={dataset.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
              >
                {isLive ? (
                  // All live datasets are openable by everyone
                  // Access control is inside each component's download button
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
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: dataset.color }}>{dataset.category}</div>
                          <h3 className="text-sm font-bold text-navy group-hover:text-primary transition-colors leading-tight">{dataset.name}</h3>
                        </div>
                        {minTier && (
                          <span style={{ fontSize: '10px', fontWeight: 600, background: PLAN_STYLE[minTier]?.bg ?? '#f3f4f6', color: PLAN_STYLE[minTier]?.nameColor ?? '#555', border: `1px solid ${PLAN_STYLE[minTier]?.border ?? '#ddd'}`, borderRadius: '20px', padding: '2px 7px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {minTier.charAt(0).toUpperCase() + minTier.slice(1)}+
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{dataset.description}</p>
                    </div>
                  </Link>
                ) : (
                  // Not yet populated — still visible, not clickable
                  <div className="block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full opacity-50">
                    <div className="h-1.5 w-full" style={{ backgroundColor: dataset.color }} />
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: `${dataset.color}15` }}>
                          {dataset.icon}
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: dataset.color }}>{dataset.category}</div>
                          <h3 className="text-sm font-bold text-navy leading-tight">{dataset.name}</h3>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{dataset.description}</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>

      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <DownloadGateProvider>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      }>
        <DashboardContent />
      </Suspense>
    </DownloadGateProvider>
  )
}