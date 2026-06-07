'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  Loader2, ArrowLeft, Globe2, FileDown, ArrowUpRight, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import DownloadGateProvider from '@/contexts/DownloadGateContext'
import {
  PLANS, PLAN_CARD_UI, getUserState, formatTrialCountdown,
  TRIAL_DOWNLOAD_CAP, planCardCount,
  type TierSlug, type UserState
} from '@/lib/pricing'
import { DATASETS, LIVE_DATASET_ROUTES, sortDatasetsByTier } from '@/lib/supabase'
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

// ─── Surface palette ──────────────────────────────────────────
// Editorial cream + warm neutrals. Replaces the rainbow PLAN_STYLE
// pastels that made the dashboard read like a SaaS demo.
const SURFACE = {
  bg:        '#F5F1EA',  // page background (warm cream)
  card:      '#FAF7F1',  // card surface
  border:    '#E5DDCB',  // hairline dividers / card borders
  eyebrow:   '#8B7A5C',  // muted bronze for eyebrows + small caps
  body:      '#5b5446',  // body text on cream
  ink:       '#1a1a1a',  // primary text
  gold:      '#C9A227',  // single accent — recommended state, links on hover
} as const

// Editorial imagery per dataset id, mirrors DatasetCard's brand library
// mapping. Keeps homepage and dashboard visually coherent.
const DATASET_IMAGE: Record<number, string> = {
  1:  '/images/africa-topography.webp',
  3:  '/images/branding/river-aerial.jpg',
  4:  '/images/branding/forest.jpg',
  5:  '/images/branding/deforestation.jpg',
  6:  '/images/branding/flood.jpg',
  8:  '/images/branding/city-map.jpg',
  9:  '/images/branding/satellite-orbit.jpg',
  10: '/images/branding/flood.jpg',
  11: '/images/branding/soil.jpg',
  12: '/images/branding/hippos.jpg',
  13: '/images/branding/ocean.jpg',
  14: '/images/branding/river-aerial.jpg',
  15: '/images/branding/river-aerial.jpg',
  16: '/images/branding/satellite.jpg',
  17: '/images/branding/ocean.jpg',
}
const FALLBACK_IMAGE = '/images/branding/hero-landscape.jpg'

function tierLabel(tier: string): string {
  switch (tier) {
    case 'starter':    return 'Starter and above'
    case 'pro':        return 'Pro and above'
    case 'max':        return 'Max'
    case 'enterprise': return 'Enterprise'
    default:           return ''
  }
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
    title:    'Administrative Boundaries',
    subtitle: 'GADM v4.1 · Shapefile, GeoJSON, KML · All 54 African countries',
    component: () => <AdminBoundariesList />,
  },
  'rivers': {
    title:    'River Networks',
    subtitle: 'Natural Earth 1:10m · GeoPackage per country',
    component: () => <RiversList />,
  },
  'rainfall': {
    title:    'Rainfall',
    subtitle: 'CHIRPS v2.0 · GeoTIFF (ZIP) · 0.05° (~5 km)',
    component: () => <RainfallClimateList layerType="rainfall" />,
  },
  'temperature': {
    title:    'Temperature',
    subtitle: 'WorldClim v2.1 · GeoTIFF (ZIP) · 2.5 arc-min (~5 km)',
    component: () => <RainfallClimateList layerType="temperature" />,
  },
  'drought-index': {
    title:    'Drought Index (SPI-12)',
    subtitle: 'CHIRPS-derived SPI · GeoTIFF (ZIP) · 0.05° (~5 km)',
    component: () => <RainfallClimateList layerType="drought_index" />,
  },
  'aquifer': {
    title:    'Groundwater Aquifers',
    subtitle: 'IGRAC GGIS · GeoPackage · All 54 African countries',
    component: () => <AquiferList />,
  },
  'protected-areas': {
    title:    'Protected Areas & Wildlife',
    subtitle: 'OpenStreetMap · ODbL · Shapefile (ZIP) per country',
    component: () => <ProtectedAreasList />,
  },
  'watersheds': {
    title:    'Watersheds & Catchments',
    subtitle: 'WWF / HydroSHEDS Level 6 · GeoPackage per country',
    component: () => <WatershedsList />,
  },
  'population': {
    title:    'Population & Settlements',
    subtitle: 'HDX COD-PS (UN OCHA) · Shapefile (ZIP) · ADM1/ADM2',
    component: () => <PopulationList />,
  },
  'roads': {
    title:    'Roads & Infrastructure',
    subtitle: 'Natural Earth 1:10m · GeoPackage per country',
    component: () => <RoadsList />,
  },
  'lulc': {
    title:    'Land Use / Land Cover',
    subtitle: 'ESA WorldCover 2021 · GeoTIFF (10m) per country',
    component: () => <LulcList />,
  },
  'lakes': {
    title:    'Lakes',
    subtitle: 'HydroLAKES · Shapefile (ZIP) per country',
    component: () => <HydrologyList layerType="lakes" />,
  },
  'soil': {
    title:    'Soil Classification',
    subtitle: 'ISRIC SoilGrids v2.0 · GeoTIFF (250m) per country',
    component: () => <SoilList />,
  },
  'rivers-hydro': {
    title:    'HydroRIVERS',
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

// ─── Editorial plan card ──────────────────────────────────────
// Cream surface, serif price, hairline divider, quiet check icons. One
// accent (gold) used only on the recommended/upgrade card. Replaces the
// previous mint/blue/lilac/amber pastels that made the dashboard read
// like a SaaS template.
function PlanCard({
  eyebrow, title, hero, heroUnit, tagline, note, count, datasets,
  cta, href, current = false, recommended = false, delay = 0,
}: {
  eyebrow:     string
  title:       string
  hero:        string
  heroUnit?:   string
  tagline?:    string
  note?:       string | null
  count?:      string
  datasets?:   string[]
  cta:         string
  href?:       string
  current?:    boolean
  recommended?: boolean
  delay?:      number
}) {
  const MAX_ITEMS = 5
  const shown = datasets?.slice(0, MAX_ITEMS) ?? []
  const extra = (datasets?.length ?? 0) - shown.length

  const body = (
    <>
      {/* Eyebrow + name */}
      <p
        className="text-[10px] font-medium uppercase tracking-[0.22em]"
        style={{ color: SURFACE.eyebrow }}
      >
        {eyebrow} · {title}
      </p>

      {/* Hero (price or 'Free') */}
      <div className="mt-4 flex items-baseline gap-1.5">
        <span
          className="font-serif text-[2.2rem] leading-none font-medium"
          style={{ color: SURFACE.ink }}
        >
          {hero}
        </span>
        {heroUnit && (
          <span className="text-[0.8rem]" style={{ color: SURFACE.body }}>
            {heroUnit}
          </span>
        )}
      </div>

      {/* Tagline */}
      {tagline && (
        <p className="mt-4 text-[0.86rem] leading-relaxed" style={{ color: SURFACE.body }}>
          {tagline}
        </p>
      )}

      {/* Trial countdown / status pill */}
      {note && (
        <p
          className="mt-3 inline-block text-[11px] font-medium tracking-wide"
          style={{ color: SURFACE.ink }}
        >
          {note}
        </p>
      )}

      {(count || shown.length > 0) && (
        <>
          <div className="my-5 h-px" style={{ background: SURFACE.border }} />

          {count && (
            <p
              className="text-[10px] font-medium uppercase tracking-[0.18em] mb-3"
              style={{ color: SURFACE.eyebrow }}
            >
              {count}
            </p>
          )}

          <ul className="space-y-2 flex-1">
            {shown.map((d) => (
              <li
                key={d}
                className="flex items-start gap-2 text-[0.84rem] leading-snug"
                style={{ color: SURFACE.ink }}
              >
                <Check
                  size={12}
                  className="mt-[3px] shrink-0"
                  strokeWidth={2.25}
                  style={{ color: SURFACE.eyebrow }}
                />
                <span>{d}</span>
              </li>
            ))}
            {extra > 0 && (
              <li className="text-[0.82rem] pl-4" style={{ color: SURFACE.eyebrow }}>
                + {extra} more
              </li>
            )}
          </ul>
        </>
      )}

      {/* CTA */}
      <div className="mt-7">
        <div
          className="w-full text-center text-[0.82rem] font-medium tracking-wide py-3 transition-all"
          style={{
            background:   current     ? 'transparent'
                          : recommended ? SURFACE.ink
                          : 'transparent',
            color:        current     ? SURFACE.body
                          : recommended ? SURFACE.card
                          : SURFACE.ink,
            border:       current     ? `1px solid ${SURFACE.border}`
                          : recommended ? `1px solid ${SURFACE.ink}`
                          : `1px solid ${SURFACE.ink}33`,
          }}
        >
          {cta}
        </div>
      </div>
    </>
  )

  const cardClass = 'h-full flex flex-col p-7 transition-all duration-200'
  const cardStyle: React.CSSProperties = {
    background: SURFACE.card,
    border: recommended
      ? `1px solid ${SURFACE.gold}`
      : `1px solid ${SURFACE.border}`,
    textDecoration: 'none',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="h-full"
    >
      {href
        ? <Link href={href} className={`dash-plan-card block ${cardClass}`} style={cardStyle}>{body}</Link>
        : <div className={cardClass} style={cardStyle}>{body}</div>}
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
  const [trialUsed,      setTrialUsed]      = useState(0)
  const [userName,       setUserName]       = useState('')
  const [isAdmin,        setIsAdmin]        = useState(false)

  useEffect(() => {
    // Defensive load pattern. Three rules:
    //   1. setLoading(false) MUST run no matter what — try/catch/finally.
    //   2. No single network call can stall the page forever — each await
    //      is racing a timeout; on timeout we substitute null and carry on.
    //   3. A returning-user with a stale-but-non-expired session that the
    //      Supabase client decides to refresh in the background can't make
    //      Promise.all stall; admin check runs in parallel and times out.
    //
    // Real-world cause for "stuck on spinner": a user away for weeks whose
    // refresh-token handshake stalls, or /api/admin/me being slow during
    // a Supabase Auth blip. The old code awaited Promise.all with no
    // timeouts, so any stall = infinite spinner.
    let cancelled = false

    // Race the value against a timeout. On timeout returns null; the
    // caller treats null the same as "we got nothing useful, render the
    // safe defaults". PromiseLike (not Promise) so we can pass Supabase
    // query builders directly — they're thenable but not true Promises.
    const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> =>
      Promise.race<T | null>([
        p,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ])

    // Hard failsafe: 10 s after the page mounts, render with whatever we
    // have. Better to show 'free' UI than an eternal spinner.
    const failsafe = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 10_000)

    const load = async () => {
      try {
        const sessionRes = await withTimeout(supabase.auth.getSession(), 5_000)
        const session = sessionRes?.data.session ?? null
        if (cancelled) return
        if (!session) { router.replace('/login'); return }

        const profilePromise = supabase
          .from('profiles')
          .select('plan, plan_status, trial_started_at, trial_downloads_used, full_name')
          .eq('id', session.user.id)
          .single()

        const adminPromise = fetch('/api/admin/me')
          .then((r) => r.ok ? r.json() : { isAdmin: false })
          .catch(() => ({ isAdmin: false }))

        const [profileRes, adminRes] = await Promise.all([
          withTimeout(profilePromise, 8_000),
          withTimeout(adminPromise,   3_000),
        ])
        if (cancelled) return
        let profile = profileRes?.data ?? null

        // Self-heal: only attempt if we actually got a row back. We don't
        // want a slow profile query to also stall the self-heal calls.
        if (profile && !profile.trial_started_at && !profile.plan) {
          try {
            await withTimeout(
              fetch('/api/account/init-profile', { method: 'POST' }),
              3_000,
            )
            const retry = await withTimeout(
              supabase
                .from('profiles')
                .select('plan, plan_status, trial_started_at, trial_downloads_used, full_name')
                .eq('id', session.user.id)
                .single(),
              3_000,
            )
            if (retry?.data) profile = retry.data
          } catch { /* non-fatal — UI just shows 'free' until next visit */ }
        }
        if (cancelled) return

        setUserState(getUserState(
          profile?.plan,
          profile?.trial_started_at,
          profile?.plan_status,
        ))
        setTrialStartedAt(profile?.trial_started_at ?? null)
        setTrialUsed(profile?.trial_downloads_used ?? 0)
        setUserName(profile?.full_name || session.user.user_metadata?.full_name || '')
        setIsAdmin(Boolean(adminRes?.isAdmin))
      } catch (err) {
        // Last-ditch: log and render whatever defaults are in state. The
        // user can always navigate to /login → /dashboard to retry.
        console.error('[dashboard] load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
        clearTimeout(failsafe)
      }
    }

    load()

    return () => {
      cancelled = true
      clearTimeout(failsafe)
    }
  }, [router])

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: SURFACE.bg }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: SURFACE.eyebrow }} />
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
      <div className="min-h-screen" style={{ background: SURFACE.bg }}>
        <div className="h-20" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-[0.82rem] mb-8 transition-colors"
            style={{ color: SURFACE.body }}
          >
            <ArrowLeft size={14} />
            Back to all datasets
          </Link>

          <div className="mb-8">
            <h1
              className="font-serif text-[2.2rem] sm:text-[2.6rem] leading-[1.05] font-medium tracking-tight"
              style={{ color: SURFACE.ink }}
            >
              {sectionData.title}
            </h1>
            {sectionData.subtitle && (
              <p className="text-[0.84rem] mt-3" style={{ color: SURFACE.eyebrow }}>
                {sectionData.subtitle}
              </p>
            )}
            {/* Trial expiry + download cap — quieter inline note, no emoji */}
            {isTrial && trialStartedAt && (
              <p
                className="mt-5 text-[0.84rem]"
                style={{ color: SURFACE.body }}
              >
                <span className="font-medium" style={{ color: SURFACE.ink }}>Free trial</span>
                {' · '}{formatTrialCountdown(trialStartedAt)} left
                {' · '}{Math.max(0, TRIAL_DOWNLOAD_CAP - trialUsed)} of {TRIAL_DOWNLOAD_CAP} downloads remaining
              </p>
            )}
            {isFree && (
              <p
                className="mt-5 text-[0.84rem]"
                style={{ color: SURFACE.body }}
              >
                Your trial has ended.{' '}
                <Link
                  href="/dashboard/payment?plan=starter"
                  className="underline underline-offset-4"
                  style={{ color: SURFACE.ink }}
                >
                  Subscribe to continue downloading.
                </Link>
              </p>
            )}
          </div>

          {/* Continental bundle — Max / Enterprise only, on live datasets
              whose section key matches an API slug. */}
          {(userState === 'max' || userState === 'enterprise') && sectionKey && (
            <ContinentalBundle datasetSlug={sectionKey} />
          )}

          <div
            className="p-6 sm:p-8"
            style={{ background: SURFACE.card, border: `1px solid ${SURFACE.border}` }}
          >
            {sectionData.component()}
          </div>
        </div>
      </div>
    )
  }

  // ── Overview ──────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: SURFACE.bg }}>
      <div className="h-20" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Greeting */}
        <div className="mb-10">
          <p
            className="text-[10px] font-medium uppercase tracking-[0.22em] mb-3"
            style={{ color: SURFACE.eyebrow }}
          >
            Dashboard
          </p>
          <h1
            className="font-serif text-[2.4rem] sm:text-[2.8rem] leading-[1.05] font-medium tracking-tight"
            style={{ color: SURFACE.ink }}
          >
            {userName ? `Welcome back, ${userName.split(' ')[0]}.` : 'Welcome back.'}
          </h1>
          <p className="mt-4 text-[0.95rem]" style={{ color: SURFACE.body }}>
            15 datasets · 54 African countries · harmonised to EPSG:4326.
          </p>
        </div>

        {/* Admin link — only shown if /api/admin/me confirmed this user is
            on the server-side ADMIN_EMAILS allowlist. */}
        {isAdmin && (
          <div className="mb-8">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-4 py-2 text-[0.82rem] font-medium tracking-wide transition-colors"
              style={{ background: SURFACE.ink, color: SURFACE.card }}
            >
              Admin panel
              <ArrowUpRight size={13} />
            </Link>
          </div>
        )}

        {/* Trial / cap notice — editorial inline copy, no coloured panel,
            no emoji. Cap-hit state turns the link colour red to signal
            blocking; otherwise quiet. */}
        {isTrial && trialStartedAt && (() => {
          const remaining = Math.max(0, TRIAL_DOWNLOAD_CAP - trialUsed)
          const capHit    = remaining === 0
          return (
            <div
              className="mb-10 flex items-center justify-between gap-6 pb-6"
              style={{ borderBottom: `1px solid ${SURFACE.border}` }}
            >
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: SURFACE.eyebrow }}>
                  {capHit ? 'Trial cap reached' : 'Free trial'}
                </p>
                <p className="mt-2 text-[0.92rem]" style={{ color: SURFACE.body }}>
                  {formatTrialCountdown(trialStartedAt)} remaining ·{' '}
                  <span className="font-medium" style={{ color: SURFACE.ink }}>
                    {remaining} of {TRIAL_DOWNLOAD_CAP} downloads
                  </span>
                  {' '}left.
                </p>
              </div>
              <Link
                href="/dashboard/payment?plan=starter"
                className="shrink-0 inline-flex items-center gap-1.5 text-[0.82rem] font-medium tracking-wide px-4 py-2.5 transition-colors"
                style={{
                  background: capHit ? '#9c2718' : SURFACE.ink,
                  color: SURFACE.card,
                }}
              >
                {capHit ? 'Subscribe to continue' : 'Subscribe'}
                <ArrowUpRight size={13} />
              </Link>
            </div>
          )
        })()}

        {/* Expired-trial banner */}
        {isFree && (
          <div
            className="mb-10 flex items-center justify-between gap-6 pb-6"
            style={{ borderBottom: `1px solid ${SURFACE.border}` }}
          >
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: SURFACE.eyebrow }}>
                Trial ended
              </p>
              <p className="mt-2 text-[0.92rem]" style={{ color: SURFACE.body }}>
                Browsing remains open. Downloads require a paid plan from $5/month.
              </p>
            </div>
            <Link
              href="/dashboard/payment?plan=starter"
              className="shrink-0 inline-flex items-center gap-1.5 text-[0.82rem] font-medium tracking-wide px-4 py-2.5"
              style={{ background: SURFACE.ink, color: SURFACE.card }}
            >
              Subscribe
              <ArrowUpRight size={13} />
            </Link>
          </div>
        )}

        {/* Plan cards row — editorial, no pastel blocks */}
        <style>{`
          .dash-plan-card { transition: background-color .2s ease, border-color .2s ease, transform .2s ease; }
          .dash-plan-card:hover { transform: translateY(-2px); }
        `}</style>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px mb-16"
             style={{ background: SURFACE.border, border: `1px solid ${SURFACE.border}` }}>
          {/* Current plan */}
          <PlanCard
            current
            delay={0.05}
            eyebrow="Current plan"
            title={planLabel}
            hero={isTrial || isFree ? 'Free' : planPrice ?? ''}
            heroUnit={isTrial || isFree ? undefined : '/month'}
            tagline={
              isTrial
                ? 'Full access to every dataset during your trial.'
                : isFree
                ? 'No active plan — subscribe to download datasets.'
                : PLAN_CARD_UI[userState as TierSlug].tagline
            }
            note={isTrial && trialStartedAt ? `${formatTrialCountdown(trialStartedAt)} remaining` : null}
            count={isTrial ? planCardCount('max') : isFree ? undefined : planCardCount(userState as TierSlug)}
            datasets={isTrial ? PLAN_CARD_UI.max.datasets : isFree ? undefined : PLAN_CARD_UI[userState as TierSlug].datasets}
            cta={isTrial ? 'Trial active' : isFree ? 'Browsing only' : 'Your current plan'}
          />

          {/* Upgrade / Subscribe */}
          {nextPlan && PLANS[nextPlan] && (
            <PlanCard
              recommended
              delay={0.1}
              eyebrow={isTrial || isFree ? 'Subscribe' : 'Upgrade'}
              title={PLANS[nextPlan].name}
              hero={PLANS[nextPlan].priceLabel}
              heroUnit="/month"
              tagline={PLAN_CARD_UI[nextPlan].tagline}
              count={planCardCount(nextPlan)}
              datasets={PLAN_CARD_UI[nextPlan].datasets}
              cta={`${isTrial || isFree ? 'Subscribe' : 'Upgrade'} · ${PLANS[nextPlan].priceLabel}/mo`}
              href={`/dashboard/payment?plan=${nextPlan}`}
            />
          )}
        </div>

        {/* Dataset grid header */}
        <div className="mb-8">
          <p
            className="text-[10px] font-medium uppercase tracking-[0.22em] mb-3"
            style={{ color: SURFACE.eyebrow }}
          >
            Datasets
          </p>
          <h2
            className="font-serif text-[1.8rem] sm:text-[2rem] leading-tight font-medium tracking-tight"
            style={{ color: SURFACE.ink }}
          >
            Browse and download.
          </h2>
          <p className="mt-3 text-[0.95rem] max-w-xl" style={{ color: SURFACE.body }}>
            Click any dataset to see country-level files. Download buttons enforce your plan tier in real time.
          </p>
        </div>

        {/* Editorial dataset grid — real imagery, no emoji, no tier pill,
            no coloured top-bar. Mirrors the homepage DatasetCard. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px"
             style={{ background: SURFACE.border, border: `1px solid ${SURFACE.border}` }}>
          {sortDatasetsByTier(DATASETS).map((dataset, i) => {
            const isLive   = dataset.id in LIVE_DATASET_ROUTES
            const imageSrc = DATASET_IMAGE[dataset.id] ?? FALLBACK_IMAGE
            const tier     = tierLabel(dataset.tier)

            const cardBody = (
              <article
                className="group h-full flex flex-col overflow-hidden transition-all duration-200"
                style={{ background: SURFACE.card }}
              >
                <div className="relative aspect-[5/3] overflow-hidden" style={{ background: '#1a1a1a' }}>
                  <Image
                    src={imageSrc}
                    alt={dataset.name}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className={`object-cover transition-transform duration-700 ${isLive ? 'group-hover:scale-[1.03]' : 'opacity-60'}`}
                    unoptimized
                  />
                </div>
                <div className="flex-1 flex flex-col p-6">
                  <p
                    className="text-[10px] font-medium uppercase tracking-[0.18em]"
                    style={{ color: SURFACE.eyebrow }}
                  >
                    {dataset.category}
                  </p>
                  <h3
                    className="mt-3 font-serif text-[1.2rem] leading-tight font-medium tracking-tight"
                    style={{ color: SURFACE.ink }}
                  >
                    {dataset.name}
                  </h3>
                  <p
                    className="mt-3 text-[0.86rem] leading-relaxed line-clamp-2"
                    style={{ color: SURFACE.body }}
                  >
                    {dataset.description}
                  </p>
                  <div
                    className="mt-auto pt-5 flex items-end justify-between gap-3"
                    style={{ borderTop: `1px solid ${SURFACE.border}`, marginTop: 'auto' }}
                  >
                    <span
                      className="text-[10px] uppercase tracking-[0.14em] pt-4"
                      style={{ color: SURFACE.eyebrow }}
                    >
                      {tier}
                    </span>
                    {isLive ? (
                      <span
                        className="inline-flex items-center gap-1 text-[0.82rem] pt-4 transition-colors"
                        style={{ color: SURFACE.ink }}
                      >
                        Browse
                        <ArrowUpRight
                          size={13}
                          className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        />
                      </span>
                    ) : (
                      <span
                        className="text-[0.78rem] pt-4"
                        style={{ color: SURFACE.eyebrow }}
                      >
                        Coming soon
                      </span>
                    )}
                  </div>
                </div>
              </article>
            )

            return (
              <motion.div
                key={dataset.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="h-full"
              >
                {isLive ? (
                  <Link href={LIVE_DATASET_ROUTES[dataset.id]} className="block h-full">
                    {cardBody}
                  </Link>
                ) : (
                  cardBody
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