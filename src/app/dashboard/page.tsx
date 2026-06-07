'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Loader2, ArrowLeft, Globe2, FileDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import DownloadGateProvider from '@/contexts/DownloadGateContext'
import {
  PLANS, PLAN_ORDER, PLAN_CARD_UI, DATASET_MIN_TIER, getUserState, formatTrialCountdown,
  type TierSlug, type UserState
} from '@/lib/pricing'
import { DATASETS, LIVE_DATASET_ROUTES } from '@/lib/supabase'
import { track } from '@/lib/analytics'

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

// ─── Pricing-style plan card ──────────────────────────────────
// Same look as the /pricing blocks (shared colours via PLAN_CARD_UI),
// just more compact for the dashboard. Clickable when `href` is set.
function PlanCard({
  eyebrow, title, hero, heroUnit, ui, tagline, note, count, datasets,
  cta, href, current = false, delay = 0,
}: {
  eyebrow:   string
  title:     string
  hero:      string
  heroUnit?: string
  ui: {
    bg: string; border: string; nameColor: string; priceColor: string
    dotColor: string; btnBg: string; dividerColor: string
  }
  tagline?:  string
  note?:     string | null
  count?:    string
  datasets?: string[]
  cta:       string
  href?:     string
  current?:  boolean
  delay?:    number
}) {
  const MAX_ITEMS = 5
  const shown = datasets?.slice(0, MAX_ITEMS) ?? []
  const extra = (datasets?.length ?? 0) - shown.length

  const body = (
    <>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: ui.nameColor, marginBottom: '0.5rem' }}>
        {eyebrow} · {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '0.6rem' }}>
        <span style={{ fontSize: '40px', lineHeight: 1, fontWeight: 400, color: ui.priceColor }}>{hero}</span>
        {heroUnit && <span style={{ fontSize: '12px', color: '#555' }}>{heroUnit}</span>}
      </div>
      {tagline && <p style={{ fontSize: '12.5px', color: '#444', margin: '0 0 0.75rem', lineHeight: 1.5 }}>{tagline}</p>}
      {note && (
        <div style={{ fontSize: '12px', color: ui.nameColor, background: '#fff', border: `1px solid ${ui.border}`, borderRadius: '8px', padding: '6px 10px', marginBottom: '0.85rem', display: 'inline-block' }}>
          {note}
        </div>
      )}
      {(count || shown.length > 0) && (
        <>
          <div style={{ height: '0.5px', background: ui.dividerColor, opacity: 0.2, margin: '0 0 0.75rem' }} />
          {count && (
            <div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#444', marginBottom: '0.5rem' }}>
              {count}
            </div>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
            {shown.map((d) => (
              <li key={d} style={{ fontSize: '12px', color: '#1a1a1a', padding: '2.5px 0', display: 'flex', alignItems: 'flex-start', gap: '7px', lineHeight: 1.4 }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: ui.dotColor, flexShrink: 0, marginTop: '5px', display: 'inline-block' }} />
                {d}
              </li>
            ))}
            {extra > 0 && (
              <li style={{ fontSize: '12px', color: ui.nameColor, fontWeight: 500, padding: '2.5px 0 2.5px 12px' }}>
                + {extra} more
              </li>
            )}
          </ul>
        </>
      )}
      <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
        <div style={{
          width: '100%', padding: '9px 0', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600, textAlign: 'center',
          background: current ? 'transparent' : ui.btnBg,
          color:      current ? ui.nameColor : '#fff',
          border:     current ? `1px solid ${ui.border}` : '1px solid transparent',
        }}>
          {cta}
        </div>
      </div>
    </>
  )

  const cardStyle: React.CSSProperties = {
    background: ui.bg, border: `1px solid ${ui.border}`, borderRadius: '16px',
    padding: '1.25rem', display: 'flex', flexDirection: 'column', height: '100%', textDecoration: 'none',
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      {href
        ? <Link href={href} className="dash-plan-card" style={cardStyle}>{body}</Link>
        : <div style={cardStyle}>{body}</div>}
    </motion.div>
  )
}

// ─── Continental bundle CTA ───────────────────────────────────
// Visible only to Max / Enterprise users on a section page. Hits the
// cookie-auth bundle endpoint and downloads the resulting manifest as a
// JSON file the user can pipe into wget/curl/python-requests. We
// intentionally don't spawn 54 browser downloads — it triggers permission
// prompts and dies on rate-limited connections. A manifest is what a real
// GIS workflow wants.
function ContinentalBundle({ datasetSlug }: { datasetSlug: string }) {
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')
  const [result, setResult] = useState<{ file_count: number; size_mb: number } | null>(null)

  async function fetchBundle() {
    setBusy(true); setError(''); setResult(null)
    track('continental_bundle_requested', { dataset: datasetSlug })
    try {
      const res = await fetch(`/api/datasets/${datasetSlug}/bundle`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message || body.error || `Bundle failed (HTTP ${res.status})`)
        return
      }

      const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${datasetSlug}-africa-bundle.json`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)

      setResult({
        file_count: body.dataset?.file_count ?? 0,
        size_mb:    body.bundle?.total_size_mb ?? 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-100 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 shrink-0">
          <Globe2 size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-navy">
            Continental bundle <span className="text-[10px] uppercase tracking-wider text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded ml-1">Max</span>
          </p>
          <p className="text-xs text-gray-600 leading-snug mt-0.5">
            Download presigned URLs for every country in one JSON manifest — feed it straight to wget, curl, or your Python pipeline.
          </p>
          {result && (
            <p className="text-xs text-green-700 mt-2 font-medium">
              ✓ Manifest saved · {result.file_count} files · ~{result.size_mb.toLocaleString()} MB total
            </p>
          )}
          {error && (
            <p className="text-xs text-red-700 mt-2 font-medium">{error}</p>
          )}
        </div>
        <button
          onClick={fetchBundle}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
          {busy ? 'Building…' : 'Get bundle'}
        </button>
      </div>
    </div>
  )
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
  const [isAdmin,        setIsAdmin]        = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }

      // Profile + admin check in parallel — admin is server-checked
      // against ADMIN_EMAILS, NOT a hardcoded email in this client bundle.
      const [profileRes, adminRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('plan, plan_status, trial_started_at, full_name')
          .eq('id', session.user.id)
          .single(),
        fetch('/api/admin/me').then(r => r.ok ? r.json() : { isAdmin: false })
          .catch(() => ({ isAdmin: false })),
      ])
      let profile = profileRes.data

      // Self-heal: if a fresh signup is missing trial_started_at (init-profile
      // didn't run or failed), call it now and re-read. Keeps the user out
      // of the "stuck on free" trap permanently.
      if (profile && !profile.trial_started_at && !profile.plan) {
        try {
          await fetch('/api/account/init-profile', { method: 'POST' })
          const retry = await supabase
            .from('profiles')
            .select('plan, plan_status, trial_started_at, full_name')
            .eq('id', session.user.id)
            .single()
          if (retry.data) profile = retry.data
        } catch { /* non-fatal — UI just shows 'free' until next visit */ }
      }

      setUserState(getUserState(
        profile?.plan,
        profile?.trial_started_at,
        profile?.plan_status,
      ))
      setTrialStartedAt(profile?.trial_started_at ?? null)
      setUserName(profile?.full_name || session.user.user_metadata?.full_name || '')
      setIsAdmin(Boolean(adminRes?.isAdmin))
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

          {/* Continental bundle — Max / Enterprise only, on live datasets
              whose section key matches an API slug. */}
          {(userState === 'max' || userState === 'enterprise') && sectionKey && (
            <ContinentalBundle datasetSlug={sectionKey} />
          )}

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

        {/* Admin link — only shown if /api/admin/me confirmed this user is
            on the server-side ADMIN_EMAILS allowlist. Adding a new admin
            now means editing one env var, no code change. */}
        {isAdmin && (
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

        {/* Plan cards row — pricing-style blocks (shared look with /pricing) */}
        <style>{`
          .dash-plan-card { transition: transform .18s ease, box-shadow .18s ease, filter .18s ease; }
          .dash-plan-card:hover { transform: translateY(-4px); box-shadow: 0 12px 28px rgba(0,0,0,0.1); filter: brightness(1.02); }
          .dash-plan-card:active { transform: scale(.98); }
        `}</style>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          {/* Current plan */}
          <PlanCard
            current
            delay={0.05}
            eyebrow="Current plan"
            title={planLabel}
            ui={
              isTrial
                ? PLAN_CARD_UI.max
                : isFree
                ? { ...PLAN_STYLE.free, dotColor: PLAN_STYLE.free.nameColor, dividerColor: PLAN_STYLE.free.nameColor }
                : PLAN_CARD_UI[userState as TierSlug]
            }
            hero={isTrial || isFree ? 'Free' : planPrice ?? ''}
            heroUnit={isTrial || isFree ? undefined : '/month'}
            tagline={
              isTrial
                ? 'Full access to every dataset during your trial.'
                : isFree
                ? 'No active plan — subscribe to download datasets.'
                : PLAN_CARD_UI[userState as TierSlug].tagline
            }
            note={isTrial && trialStartedAt ? `${formatTrialCountdown(trialStartedAt)} remaining · Full access` : null}
            count={isTrial ? PLAN_CARD_UI.max.count : isFree ? undefined : PLAN_CARD_UI[userState as TierSlug].count}
            datasets={isTrial ? PLAN_CARD_UI.max.datasets : isFree ? undefined : PLAN_CARD_UI[userState as TierSlug].datasets}
            cta={isTrial ? 'Trial active' : isFree ? 'Browsing only' : '✓ Your current plan'}
          />

          {/* Upgrade / Subscribe */}
          {nextPlan && PLANS[nextPlan] && (
            <PlanCard
              delay={0.1}
              eyebrow={isTrial || isFree ? 'Subscribe now' : 'Upgrade to'}
              title={PLANS[nextPlan].name}
              ui={PLAN_CARD_UI[nextPlan]}
              hero={PLANS[nextPlan].priceLabel}
              heroUnit="/month"
              tagline={PLAN_CARD_UI[nextPlan].tagline}
              count={PLAN_CARD_UI[nextPlan].count}
              datasets={PLAN_CARD_UI[nextPlan].datasets}
              cta={`${isTrial || isFree ? 'Subscribe' : 'Upgrade'} · ${PLANS[nextPlan].priceLabel}/mo`}
              href={`/dashboard/payment?plan=${nextPlan}`}
            />
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