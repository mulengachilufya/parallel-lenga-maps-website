'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Loader2, ArrowLeft, Globe2, FileDown, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import DownloadGateProvider from '@/contexts/DownloadGateContext'
import {
  PLANS, PLAN_ORDER, PLAN_CARD_UI, DATASET_MIN_TIER, getUserState, formatTrialCountdown,
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

// ─── Plan style tokens ────────────────────────────────────────
const PLAN_STYLE: Record<string, {
  bg: string; border: string; nameColor: string;
  priceColor: string; btnBg: string;
}> = {
  starter:    { bg: '#EAF3DE', border: '#97C459', nameColor: '#3B6D11', priceColor: '#27500A', btnBg: '#639922' },
  pro:        { bg: '#E6F1FB', border: '#85B7EB', nameColor: '#185FA5', priceColor: '#0C447C', btnBg: '#185FA5' },
  max:        { bg: '#EEEDFE', border: '#AFA9EC', nameColor: '#534AB7', priceColor: '#3C3489', btnBg: '#534AB7' },
  enterprise: { bg: '#FAEEDA', border: '#EF9F27', nameColor: '#854F0B', priceColor: '#633806', btnBg: '#854F0B' },
  team:       { bg: '#0D2B45', border: '#F5B800', nameColor: '#F5B800', priceColor: '#FFFFFF', btnBg: '#F5B800' },
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
    subtitle: 'HydroSHEDS HydroRIVERS v1.0 · detailed network · GeoPackage per country',
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
    title: '💧 Transboundary Aquifers',
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
    subtitle: 'WWF / HydroSHEDS HydroBASINS Level 8 · detailed sub-catchments · GeoPackage per country',
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
    subtitle: 'HydroLAKES · GeoPackage per country',
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
// Visible to EVERYONE on a dataset section page (it drives upgrades), but the
// download itself is Max/Enterprise-only. Non-Max users who click get a popup
// explaining it's a Max feature; Max/Enterprise users get the real file —
// ONE combined GeoPackage that merges all 54 countries into a single layer
// with attribute tables embedded, ready to drop straight into QGIS. The
// combined file is pre-built offline and served as a presigned URL by
// /api/datasets/:id/bundle. We use the same anchor-download pattern as the
// per-country buttons (R2 serves the .gpkg with a binary content type).
// Datasets that have a pre-built Africa-wide bundle in R2. Vector layers merge
// into one GeoPackage; the coarse (~5 km) climate rasters mosaic into one COG.
// LULC (10 m), soil (250 m) and lakes are deliberately excluded — the first two
// are too large to host as a single continental file (per-country only), and
// lakes has no source data yet.
const BUNDLE_DATASETS = new Set<string>([
  'admin-boundaries', 'aquifer', 'population', 'protected-areas',
  'rivers', 'roads', 'watersheds', 'lakes',
  'rainfall', 'temperature', 'drought-index',
])

function ContinentalBundle({ datasetSlug, userState }: { datasetSlug: string; userState: UserState }) {
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [notReady, setNotReady] = useState(false)
  const [result,   setResult]   = useState<{ file_count: number; size_mb: number; format: string } | null>(null)
  const [showGate, setShowGate] = useState(false)

  const isMax = userState === 'max' || userState === 'enterprise' || userState === 'team'

  async function handleClick() {
    // Everyone can see the card; only Max/Enterprise can download it.
    if (!isMax) {
      track('continental_bundle_gated', { dataset: datasetSlug, user_state: userState })
      setShowGate(true)
      return
    }

    setBusy(true); setError(''); setNotReady(false); setResult(null)
    track('continental_bundle_requested', { dataset: datasetSlug })
    try {
      const res  = await fetch(`/api/datasets/${datasetSlug}/bundle`)
      const body = await res.json().catch(() => ({}))

      if (res.status === 403) { setShowGate(true); return }                       // server backstop
      if (res.status === 404 && body.error === 'bundle_not_ready') { setNotReady(true); return }
      if (!res.ok) {
        setError(body.message || body.error || `Bundle failed (HTTP ${res.status})`)
        return
      }

      // Trigger the real file download (presigned R2 URL → cross-origin .gpkg).
      const link    = document.createElement('a')
      link.href     = body.bundle.download_url
      link.download = body.bundle.filename ?? `${datasetSlug}_africa.gpkg`
      document.body.appendChild(link); link.click(); link.remove()

      setResult({
        file_count: body.dataset?.file_count ?? 0,
        size_mb:    body.bundle?.total_size_mb ?? 0,
        format:     body.bundle?.format ?? 'GeoPackage',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
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
              All 54 countries merged into one file — attribute tables included, ready to drop straight into QGIS. No more downloading countries one at a time.
            </p>
            {result && (
              <p className="text-xs text-green-700 mt-2 font-medium">
                ✓ {result.format} downloading · {result.file_count} countries · ~{result.size_mb.toLocaleString()} MB
              </p>
            )}
            {notReady && (
              <p className="text-xs text-amber-700 mt-2 font-medium">
                This combined file is being prepared — per-country downloads are available below in the meantime.
              </p>
            )}
            {error && (
              <p className="text-xs text-red-700 mt-2 font-medium">{error}</p>
            )}
          </div>
          <button
            onClick={handleClick}
            disabled={busy}
            className="shrink-0 inline-flex items-center gap-1.5 bg-[#534AB7] hover:bg-[#3C3489] disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
            {busy ? 'Preparing…' : 'Download bundle'}
          </button>
        </div>
      </div>

      {showGate && (
        <BundleMaxGate datasetSlug={datasetSlug} onClose={() => setShowGate(false)} />
      )}
    </>
  )
}

// Max-only popup for the continental bundle. This gate is tier-specific to Max
// — distinct from the per-dataset PaywallModal, because the dataset itself may
// sit on a lower tier (a Starter user can download rainfall country-by-country)
// while the whole-of-Africa bundle is always a Max/Enterprise feature.
function BundleMaxGate({ datasetSlug, onClose }: { datasetSlug: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0D2B45] border border-blue-900/60 rounded-2xl max-w-md w-full p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#534AB7]/25 flex items-center justify-center text-[#AFA9EC] shrink-0">
              <Lock size={17} />
            </div>
            <h2 className="text-lg font-bold text-white leading-tight">
              Continental bundle is a Max feature
            </h2>
          </div>
          <button onClick={onClose} className="text-blue-500 hover:text-white transition-colors ml-3 text-xl leading-none">✕</button>
        </div>

        <p className="text-blue-300 text-sm leading-relaxed mb-5">
          Downloading all 54 countries as one ready-for-QGIS file is available on{' '}
          <span className="text-white font-semibold">Max</span> and{' '}
          <span className="text-white font-semibold">Enterprise</span>. You can still download
          countries individually on your current plan.
        </p>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/payment?plan=max"
            onClick={() => { track('continental_bundle_upgrade_clicked', { dataset: datasetSlug }); onClose() }}
            className="flex-1 text-center bg-[#534AB7] hover:bg-[#3C3489] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            Upgrade to Max · {PLANS.max.priceLabel}/mo
          </Link>
          <button onClick={onClose} className="text-blue-400 hover:text-white text-sm transition-colors px-2">
            Not now
          </button>
        </div>
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

  // The verified user id this dashboard's data belongs to. Used by the auth
  // listener below to detect an account switch (e.g. a different account
  // signed in on another tab) and force a clean refetch so we never render
  // account A's chrome with account B's plan.
  const loadedUserIdRef = useRef<string | null>(null)

  // React to auth changes anywhere (this tab or another). This is what makes
  // sign-out and account-switching feel instant and safe instead of leaving
  // stale UI behind:
  //   - SIGNED_OUT              → hard-redirect home (full state wipe)
  //   - signed in as a NEW user → hard-reload so all data refetches for them
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        window.location.href = '/'
        return
      }
      const newId = session?.user?.id ?? null
      const knownId = loadedUserIdRef.current
      // Only act once we've loaded (knownId set) and the id actually changed.
      if (newId && knownId && newId !== knownId) {
        window.location.reload()
      }
    })
    return () => subscription.unsubscribe()
  }, [])

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
        // getUser() — server-VERIFIED identity, not getSession()'s unverified
        // cookie decode. This guarantees the profile below is fetched for the
        // real signed-in account, never a stale/swapped session's id.
        const userRes = await withTimeout(supabase.auth.getUser(), 5_000)
        const user = userRes?.data.user ?? null
        if (cancelled) return
        loadedUserIdRef.current = user?.id ?? null
        if (!user) {
          // NEVER redirect from here. Middleware (src/middleware.ts) is the
          // authoritative auth gate for /dashboard. If middleware allowed the
          // route, a transient null session client-side is a cookie race, not
          // a real sign-out — the /login page's own auto-redirect-when-signed-
          // in would then bounce us straight back, and we'd loop 3× per second
          // (the "screen goes back to login, then dashboard, then login again"
          // production bug reported 2026-06-18). Render safe defaults and bail.
          setUserState('free')
          setTrialStartedAt(null)
          setTrialUsed(0)
          setUserName('')
          setIsAdmin(false)
          return
        }

        const profilePromise = supabase
          .from('profiles')
          .select('plan, plan_status, trial_started_at, trial_downloads_used, full_name')
          .eq('id', user.id)
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
                .eq('id', user.id)
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
        setUserName(profile?.full_name || user.user_metadata?.full_name || '')
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  const isTrial   = userState === 'free_trial'
  const isFree    = userState === 'free'
  const planLabel = isTrial ? 'Free Trial' : isFree ? 'Free' : PLANS[userState as TierSlug]?.name ?? ''
  const planPrice = (!isTrial && !isFree) ? PLANS[userState as TierSlug]?.priceLabel : null
  // Self-serve upgrades stop at Max. Team plans are quote-based via
  // /projects, never an automatic upsell target here.
  const nextPlan  = isFree || isTrial ? 'starter' :
                    userState === 'starter' ? 'pro' :
                    userState === 'pro'     ? 'max' : null

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
            {/* Trial expiry + download cap warning inside section */}
            {isTrial && trialStartedAt && (
              <div className="mt-3 inline-flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-sm text-yellow-800">
                ⏱ Free trial — {formatTrialCountdown(trialStartedAt)} left ·{' '}
                {Math.max(0, TRIAL_DOWNLOAD_CAP - trialUsed)} / {TRIAL_DOWNLOAD_CAP} downloads remaining
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

          {/* Continental bundle — visible to everyone (drives upgrades); the
              download itself is Max/Enterprise-only, enforced in the component
              and again server-side in the bundle route.
              Only shown for datasets that actually have a pre-built Africa-wide
              file: the vector layers + the coarse climate rasters. LULC (10 m)
              and soil (250 m) are per-country only — an Africa-wide mosaic at
              native resolution is far too large to host/download — so we don't
              tease a bundle that will never exist for them. */}
          {sectionKey && BUNDLE_DATASETS.has(sectionKey) && (
            <ContinentalBundle datasetSlug={sectionKey} userState={userState} />
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

      {/* Thin satellite banner — same orbit visual as the landing page,
          so the brand story doesn't end at sign-in. Sits below the navbar
          and above the greeting; subtle dark gradient keeps the welcome
          text readable on top. */}
      <div className="relative h-[180px] sm:h-[220px] overflow-hidden border-b border-gray-100">
        <Image
          src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=2400&q=80"
          alt="Earth from orbit — Africa visible"
          fill
          priority
          className="object-cover brightness-[0.55] saturate-[1.1]"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a121c]/85 via-[#0a121c]/50 to-[#0a121c]/15" />
        <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-7 h-0.5 bg-gold" />
            <span className="text-[0.66rem] font-bold tracking-[0.22em] text-gold uppercase">
              Dashboard
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            {userName ? `Welcome back, ${userName.split(' ')[0]}.` : 'Welcome back.'}
          </h1>
          <p className="text-white/70 text-sm mt-1.5">
            54 African countries · 15 datasets · harmonised to EPSG:4326
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

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

        {/* Trial banner — time + download cap. Once the cap is reached the
            user is effectively in 'expired trial' mode for downloads even
            if hours remain on the clock. */}
        {isTrial && trialStartedAt && (() => {
          const remaining = Math.max(0, TRIAL_DOWNLOAD_CAP - trialUsed)
          const capHit    = remaining === 0
          return (
            <div className={`mb-6 ${capHit ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'} border rounded-2xl px-5 py-4 flex items-center justify-between gap-4`}>
              <div>
                <p className={`font-semibold text-sm ${capHit ? 'text-red-800' : 'text-yellow-800'}`}>
                  {capHit ? '🔒 Trial download cap reached' : '⏱ Free trial active'}
                </p>
                <p className={`text-xs mt-0.5 ${capHit ? 'text-red-700' : 'text-yellow-700'}`}>
                  {formatTrialCountdown(trialStartedAt)} left ·{' '}
                  {remaining} / {TRIAL_DOWNLOAD_CAP} downloads remaining
                </p>
              </div>
              <Link
                href="/dashboard/payment?plan=starter"
                className={`shrink-0 text-xs font-bold text-white px-4 py-2 rounded-lg transition-colors ${capHit ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-800 hover:bg-yellow-900'}`}
              >
                {capHit ? 'Subscribe to continue' : 'Subscribe now'}
              </Link>
            </div>
          )
        })()}

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
            count={isTrial ? planCardCount('max') : isFree ? undefined : planCardCount(userState as TierSlug)}
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
              count={planCardCount(nextPlan)}
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
          {sortDatasetsByTier(DATASETS).map((dataset, i) => {
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