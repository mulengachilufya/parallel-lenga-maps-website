'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Download, LogOut, User, Package, ChevronRight, Star, AlertCircle, ArrowLeft, Trash2, X, Clock, Shield, CalendarClock, KeyRound } from 'lucide-react'
import { supabase, DATASETS, PLAN_PRICING, hasFullDatasetAccess, isPlanActive, type AccountType, type PlanStatus } from '@/lib/supabase'
import { DownloadGateProvider } from '@/contexts/DownloadGateContext'
import AdminBoundariesList from '@/components/AdminBoundariesList'
import HydrologyList from '@/components/HydrologyList'
import RiversList from '@/components/RiversList'
import WatershedsList from '@/components/WatershedsList'
import RainfallClimateList from '@/components/RainfallClimateList'
import AquiferList from '@/components/AquiferList'
import LulcList from '@/components/LulcList'
import PopulationList from '@/components/PopulationList'

type UserPlan = 'basic' | 'pro' | 'max'

// Label + description shown in the "Current Plan" card.
const PLAN_LABELS: Record<UserPlan, string> = { basic: 'Basic', pro: 'Pro', max: 'Max' }
const PLAN_BLURBS: Record<UserPlan, string> = {
  basic: 'Core access',
  pro: 'Full access',
  max: 'Maximum access',
}
// Note: this is now a thin wrapper around the shared helper. Always pass
// account_type — Business at any plan level (basic OR pro) gets full data
// access per the pricing page ("Everything in Max" on Business basic).

interface UserData {
  email: string
  name: string
  // null = user has not picked / paid for any plan yet. The dashboard MUST
  // check this and not display a stale "Basic plan K25/month" before they
  // actually paid for anything.
  plan: UserPlan | null
  planStatus: PlanStatus
  planExpiresAt: string | null
  accountType: AccountType
}

// ── Section registry ────────────────────────────────────────────────────────
// Maps URL section param → component, title, subtitle, tier.
// `component` receives:
//   plan          — the user's plan tier (basic/pro/max)
//   hasFullAccess — pre-computed boolean: pro/max OR any business plan
// Inside list components, prefer `hasFullAccess` over recomputing from plan
// alone, because that recomputation will silently miss Business basic users.
const SECTIONS: Record<string, {
  title: string
  subtitle?: string
  tier: 'basic' | 'pro'
  component: (plan: UserPlan, hasFullAccess: boolean) => React.ReactNode
}> = {
  'admin-boundaries': {
    title: '📍 Administrative Boundaries',
    tier: 'basic',
    component: (plan) => <AdminBoundariesList userPlan={plan} />,
  },
  'hydrology': {
    title: '🌊 River Networks & Lakes',
    tier: 'basic',
    component: (plan) => <HydrologyList userPlan={plan} />,
  },
  'drought-index': {
    title: '🔥 Drought Index (SPI-12)',
    subtitle: 'CHIRPS-derived SPI · EPSG:4326 · GeoTIFF (ZIP) · 0.05° (~5 km)',
    tier: 'basic',
    component: (plan) => <RainfallClimateList userPlan={plan} layerType="drought_index" />,
  },
  'rainfall': {
    title: '🌧️ Rainfall Data',
    subtitle: 'CHIRPS v2.0 · EPSG:4326 · GeoTIFF (ZIP) · 0.05° (~5 km)',
    tier: 'basic',
    component: (plan) => <RainfallClimateList userPlan={plan} layerType="rainfall" />,
  },
  'temperature': {
    title: '🌡️ Temperature Data',
    subtitle: 'WorldClim v2.1 · EPSG:4326 · GeoTIFF (ZIP) · 2.5 arc-min (~5 km)',
    tier: 'basic',
    component: (plan) => <RainfallClimateList userPlan={plan} layerType="temperature" />,
  },
  'rivers': {
    title: '🌊 River Networks',
    subtitle: 'HydroSHEDS / FAO · EPSG:4326 · ZIP (Shapefile) per country',
    tier: 'basic',
    component: (plan) => <RiversList userPlan={plan} />,
  },
  'watersheds': {
    title: '🗺️ HydroBASINS - Watershed Boundaries',
    subtitle: 'WWF / HydroSHEDS Level 6 v1c · CC BY 4.0 · GeoPackage per country',
    tier: 'basic',
    component: (plan) => <WatershedsList userPlan={plan} />,
  },
  'aquifer': {
    title: '💧 Groundwater Aquifers',
    subtitle: 'IGRAC GGIS · CC BY 4.0 · EPSG:4326 · GeoPackage per country',
    tier: 'pro',
    component: (plan, hasFullAccess) => <AquiferList userPlan={plan} hasFullAccess={hasFullAccess} />,
  },
  'lulc': {
    title: '🌿 Land Use / Land Cover',
    subtitle: 'ESA WorldCover 2021 v200 · CC BY 4.0 · EPSG:4326 · GeoTIFF (10 m) per country',
    tier: 'basic',
    component: (plan) => <LulcList userPlan={plan} />,
  },
  'population': {
    title: '🏘️ Population & Settlements',
    subtitle: 'HDX COD-PS (UN OCHA + national census offices) · EPSG:4326 · Shapefile (ZIP) · ADM1/ADM2',
    tier: 'pro',
    component: (plan, hasFullAccess) => <PopulationList userPlan={plan} hasFullAccess={hasFullAccess} />,
  },
}

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteMessage, setDeleteMessage] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteSuccess, setDeleteSuccess] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  // Admin-only: number of manual_payments rows with status='pending'. Polled
  // every 30s so a new submission shows up as a red badge on the Admin button
  // without the operator needing to open /admin/payments. This is the single
  // most reliable signal — even if every notification channel silently fails,
  // the badge appears the next time the dashboard polls.
  const [pendingCount, setPendingCount] = useState(0)

  // Which section to show - null means show the overview (all sections listed as cards)
  const section = searchParams.get('section')

  useEffect(() => {
    const getUser = async () => {
      // Anonymous users are allowed to browse — they'll hit the DownloadGate
      // modal only when they actually click a Download button on a file.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, plan_status, plan_expires_at, account_type, full_name')
        .eq('id', session.user.id)
        .single()
      setUser({
        email: session.user.email || '',
        name: profile?.full_name || session.user.user_metadata?.full_name || 'User',
        // Crucial: do NOT fall back to 'basic'. A null plan means the user
        // hasn't paid yet — the dashboard renders "No active plan" for that
        // case. Coercing to 'basic' would re-introduce the bug that made
        // free signups display as paying Basic customers.
        plan: (profile?.plan as UserPlan | null) ?? null,
        // Default to 'free' if the column is missing so we never silently grant access.
        planStatus: (profile?.plan_status || 'free') as PlanStatus,
        planExpiresAt: (profile?.plan_expires_at as string | null) ?? null,
        accountType: (profile?.account_type || session.user.user_metadata?.account_type || 'student') as AccountType,
      })
      setLoading(false)

      // Single combined check: admin status + pending payment count.
      // /api/admin/pending-count returns isAdmin AND count in one round-trip
      // and never errors (returns count=0 for non-admins).
      try {
        const res = await fetch('/api/admin/pending-count', { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          setIsAdmin(!!json.isAdmin)
          setPendingCount(Number(json.count) || 0)
        }
      } catch { /* ignore — non-admins never see the link anyway */ }
    }
    getUser()
  }, [router])

  // Admin-only: poll the pending count every 30s while the dashboard is open.
  // This is what makes new payments unmissable — even with email + WhatsApp
  // + Telegram all dead, the badge will appear within 30s.
  useEffect(() => {
    if (!isAdmin) return
    const tick = async () => {
      try {
        const res = await fetch('/api/admin/pending-count', { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          setPendingCount(Number(json.count) || 0)
        }
      } catch { /* transient — try again next tick */ }
    }
    const interval = setInterval(tick, 30_000)
    return () => clearInterval(interval)
  }, [isAdmin])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleDeleteRequest = async () => {
    setDeleteError('')
    if (!deleteReason) { setDeleteError('Please select a reason.'); return }
    setDeleteLoading(true)
    try {
      const res = await fetch('/api/account/delete-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason:      deleteReason,
          message:     deleteMessage,
          userName:    user?.name,
          userEmail:   user?.email,
          userId:      (await supabase.auth.getSession()).data.session?.user.id,
          plan:        user?.plan,
          accountType: user?.accountType,
          isPaid:      false,
        }),
      })
      if (!res.ok) { const d = await res.json(); setDeleteError(d.error || 'Failed to send request.'); return }
      setDeleteSuccess(true)
    } catch {
      setDeleteError('Something went wrong. Please try again.')
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const userPlan        = user?.plan ?? null
  const userAccountType = user?.accountType || 'student'
  // True only when the user has BOTH an active plan AND a tier that grants
  // access. A free-tier signup (plan === null) hits the false branch and the
  // dashboard will hide all the "you can download X of Y" stats.
  const isPlanLive = isPlanActive(user?.planStatus ?? 'free', user?.planExpiresAt)
  const userHasFullAccess = isPlanLive && hasFullDatasetAccess(userPlan, userAccountType)
  const accessibleDatasets = DATASETS.filter(
    (d) => userHasFullAccess || d.tier === 'basic'
  )

  // ── Single-section view ─────────────────────────────────────────────────
  const sectionData = section ? SECTIONS[section] : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/branding/logo.png"
              alt="Lenga Maps"
              width={36}
              height={36}
              className="object-contain"
            />
            <span className="font-bold text-navy">LENGA <span className="text-accent">MAPS</span></span>
          </Link>

          <div className="flex items-center gap-4">
            {user ? (
              <>
                {isAdmin && (
                  <Link
                    href="/admin/payments"
                    className={`relative hidden sm:inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                      pendingCount > 0
                        ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                        : 'bg-navy text-white hover:bg-primary'
                    }`}
                  >
                    <Shield size={13} />
                    Admin
                    {pendingCount > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full bg-white text-red-600 text-[11px] font-black px-1.5">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                )}
                {/* Business-tier perk: API keys live behind a separate page so
                    the dashboard stays focused on browsing datasets. */}
                {user.accountType === 'business' && (
                  <Link
                    href="/dashboard/api-keys"
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-dark transition-colors"
                  >
                    <KeyRound size={13} />
                    API keys
                  </Link>
                )}
                <div className="hidden sm:flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
                  <User size={14} className="text-gray-500" />
                  <span className="text-sm text-gray-700">{user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="text-sm font-medium text-primary hover:text-accent transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ════════════════════════════════════════════════════════════════
            SINGLE SECTION VIEW - when ?section=rainfall-climate etc.
            Only that one dataset is shown. Nothing else.
           ════════════════════════════════════════════════════════════════ */}
        {sectionData ? (
          <>
            {/* Back button */}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors mb-6"
            >
              <ArrowLeft size={16} />
              Back to all datasets
            </Link>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <h1 className="text-2xl font-black text-navy">{sectionData.title}</h1>
              {sectionData.subtitle && (
                <p className="text-xs text-gray-400 mt-1">{sectionData.subtitle}</p>
              )}
            </motion.div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              {/* Coerce the plan to 'basic' purely for the list-component
                  prop signatures — those components don't actually read
                  this anymore (they use hasFullAccess for tier decisions),
                  it's just a passthrough kept around for backward compat. */}
              {sectionData.component(userPlan ?? 'basic', userHasFullAccess)}
            </div>
          </>
        ) : (
          <>
            {/* ════════════════════════════════════════════════════════════
                OVERVIEW - shows welcome, stats, and clickable cards
                for each dataset section. No raw data exposed here.
               ════════════════════════════════════════════════════════════ */}

            {/* Welcome */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <h1 className="text-2xl font-black text-navy">
                {user
                  ? (searchParams.get('welcome') === 'new'
                      ? `Welcome to Lenga Maps, ${user.name.split(' ')[0]} 👋`
                      : `Welcome back, ${user.name.split(' ')[0]} 👋`)
                  : 'Download GIS Data'}
              </h1>
              <p className="text-gray-500 mt-1">
                {user ? 'Choose a dataset below to browse and download files.' : 'Browse and download GIS datasets for Africa.'}
              </p>
            </motion.div>

            {/* First-time welcome banner. Honest copy: free to browse, pay
                only when they actually click Download. No claim that they
                are "on Basic" — they aren't, they're on no plan at all. */}
            {searchParams.get('welcome') === 'new' && user && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-2xl p-5 sm:p-6"
              >
                <h2 className="text-lg font-black text-navy mb-1">Welcome to Lenga Maps 👋</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  You can browse every dataset and every country for free. When you&apos;re ready to
                  download your first file, you&apos;ll be prompted to pick a plan — see{' '}
                  <Link href="/pricing" className="text-primary font-semibold hover:underline">Pricing</Link>{' '}
                  for what each tier covers.
                </p>
              </motion.div>
            )}

            {/* Plan-expired banner — active+past-expiry → treated as lapsed.
                Points them at /dashboard/payment to renew. */}
            {user?.planStatus === 'active' && user.planExpiresAt &&
              new Date(user.planExpiresAt).getTime() <= Date.now() && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 bg-red-50 border border-red-300 rounded-2xl p-5 sm:p-6 flex items-start gap-4"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-red-200 flex items-center justify-center">
                  <CalendarClock size={20} className="text-red-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-black text-navy mb-1">Your plan has expired</h2>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Your <strong className="capitalize">{user.plan}</strong> access period
                    has ended. Renew anytime to pick up where you left off — same quick
                    MTN / Airtel flow.
                  </p>
                </div>
                <Link
                  href={`/dashboard/payment?plan=${user.plan}`}
                  className="shrink-0 self-center bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                >
                  Renew now
                </Link>
              </motion.div>
            )}

            {/* Plan-expires-soon banner — active and within 7 days of expiry.
                Heads-up so renewals don't fall off a cliff. */}
            {user?.planStatus === 'active' && user.planExpiresAt &&
              (() => {
                const msLeft = new Date(user.planExpiresAt).getTime() - Date.now()
                const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
                return msLeft > 0 && daysLeft <= 7
              })() && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 bg-amber-50 border border-amber-300 rounded-2xl p-5 sm:p-6 flex items-start gap-4"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center">
                  <CalendarClock size={20} className="text-amber-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-black text-navy mb-1">Your plan renews soon</h2>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Your <strong className="capitalize">{user.plan}</strong> plan expires on{' '}
                    <strong>{new Date(user.planExpiresAt!).toLocaleDateString()}</strong>.
                    Renew early to avoid any download interruption.
                  </p>
                </div>
                <Link
                  href={`/dashboard/payment?plan=${user.plan}`}
                  className="shrink-0 self-center bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap"
                >
                  Renew
                </Link>
              </motion.div>
            )}

            {/* Payment-under-review banner — shown whenever a user has
                submitted a manual payment but it hasn't been verified yet.
                Surfaces the status outside the DownloadGate modal so they
                don't have to click Download to see we're processing it. */}
            {user?.planStatus === 'pending' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 bg-yellow-50 border border-yellow-300 rounded-2xl p-5 sm:p-6 flex items-start gap-4"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-yellow-200 flex items-center justify-center">
                  <Clock size={20} className="text-yellow-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-black text-navy mb-1">Payment under review</h2>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Thanks for submitting your <strong className="capitalize">{user.plan}</strong>{' '}
                    payment — we usually confirm within a few hours. You&apos;ll get an email as soon as
                    your plan is active, and you can still browse free datasets in the meantime.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Stats Cards. Two completely different shapes depending on
                whether the user has an active paid plan:
                  · isPlanLive: show the actual plan, price, accessible datasets,
                    countries — i.e. what they paid for.
                  · NOT live (free / pending / expired): show a "No active
                    plan" card prompting them to pick one, plus the count of
                    browsable datasets (everyone can browse, downloads are
                    gated). NEVER print a plan label or a price they didn't
                    pay for. */}
            {user && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {isPlanLive && user.plan ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className={`rounded-2xl p-6 text-white ${
                      user.plan === 'max' ? 'bg-purple-600' :
                      user.plan === 'pro' ? 'bg-accent' :
                      'gradient-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold opacity-80 uppercase tracking-wider">Current Plan</span>
                      {user.plan === 'pro' && <Star size={16} fill="currentColor" />}
                      {user.plan === 'max' && <Star size={16} fill="currentColor" />}
                    </div>
                    <div className="text-3xl font-black mb-1">{PLAN_LABELS[user.plan]}</div>
                    <p className="text-sm opacity-80">
                      {(() => { const p = PLAN_PRICING[user.accountType]?.[user.plan!]; return p ? `K${p.zmw ?? p.usd}` : '—' })()}/month - {PLAN_BLURBS[user.plan]}
                    </p>
                    <p className="text-xs opacity-60 mt-0.5 capitalize">
                      {user.accountType} rate
                    </p>
                    {user.plan === 'basic' && user.accountType !== 'business' && (
                      <Link
                        href="/pricing"
                        className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-accent hover:underline"
                      >
                        Upgrade to Pro <ChevronRight size={12} />
                      </Link>
                    )}
                    {user.plan === 'pro' && user.accountType !== 'business' && (
                      <Link
                        href="/pricing"
                        className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-white hover:underline"
                      >
                        Upgrade to Max <ChevronRight size={12} />
                      </Link>
                    )}
                  </motion.div>
                ) : (
                  /* No active plan: prompt to pick one. No fake "Basic" label,
                     no fake price. */
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-2xl p-6 bg-white border-2 border-dashed border-gray-300"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Current Plan</span>
                    </div>
                    <div className="text-2xl font-black text-navy mb-1">No active plan</div>
                    <p className="text-sm text-gray-500">
                      Free to browse. Pick a plan when you&apos;re ready to download your first file.
                    </p>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-primary hover:underline"
                    >
                      See pricing <ChevronRight size={12} />
                    </Link>
                  </motion.div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Package size={18} className="text-primary" />
                    <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                      {isPlanLive ? 'Datasets Available' : 'Datasets to Browse'}
                    </span>
                  </div>
                  <div className="text-3xl font-black text-navy">
                    {isPlanLive ? accessibleDatasets.length : DATASETS.length}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {isPlanLive
                      ? `of ${DATASETS.length} total datasets`
                      : 'Pick a plan to download'}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Download size={18} className="text-green-600" />
                    <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Countries</span>
                  </div>
                  <div className="text-3xl font-black text-navy">
                    {!isPlanLive ? '54' : userHasFullAccess ? '54' : '3'}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {!isPlanLive
                      ? 'Browse all of Africa'
                      : userHasFullAccess
                        ? 'All of Africa'
                        : 'Choose any 3'}
                  </p>
                </motion.div>
              </div>
            )}

            {/* Upgrade-to-Pro banner. Only for users on an ACTIVE Basic plan
                (and only Student/Professional accounts — Business basic
                already has full data access by design). Free / pending /
                expired users see no upgrade prompt here; they get the
                "No active plan" card above instead. */}
            {user && isPlanLive && user.plan === 'basic' && user.accountType !== 'business' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Upgrade to Pro for full access</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Unlock all 54 countries, 15+ datasets, and unlimited downloads from just K{PLAN_PRICING[user.accountType]?.pro?.zmw ?? PLAN_PRICING[user.accountType]?.pro?.usd}/month.
                    </p>
                  </div>
                </div>
                <Link
                  href="/pricing"
                  className="flex-shrink-0 bg-accent text-navy text-xs font-bold px-4 py-2 rounded-lg hover:bg-yellow-400 transition-colors whitespace-nowrap"
                >
                  Upgrade Now
                </Link>
              </motion.div>
            )}

            {/* Dataset cards. Every visitor can open every card and browse
                its file list — paywalling at the card level was wrong UX
                ("looks like I bought a ghost dataset"). The actual gate is
                the per-file Download button via DownloadGateContext: clicking
                a Pro-tier file as a Basic user pops up the upgrade modal,
                clicking ANY file as a free user pops up the pay modal.
                Pro-only datasets get a small "Pro" badge so the user knows
                which downloads will require an upgrade before they click. */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(SECTIONS).map(([key, sec], i) => {
                const isProTier = sec.tier === 'pro'
                const showProBadge = isProTier && !userHasFullAccess

                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.06, 0.4) }}
                  >
                    <Link
                      href={`/dashboard?section=${key}`}
                      replace
                      className="group block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 p-6 relative"
                    >
                      {showProBadge && (
                        <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-accent/15 text-accent font-bold px-2 py-1 rounded-full">
                          Pro
                        </span>
                      )}
                      <h3 className="text-lg font-bold text-navy group-hover:text-primary transition-colors mb-1 pr-12">
                        {sec.title}
                      </h3>
                      {sec.subtitle && <p className="text-xs text-gray-400 mb-3">{sec.subtitle}</p>}
                      <div className="flex items-center gap-2 text-sm font-semibold text-primary group-hover:text-accent transition-colors">
                        <Download size={14} />
                        Browse &amp; Download
                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </>
        )}

        {/* Support */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 bg-navy rounded-2xl p-6 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div>
            <h3 className="font-bold mb-1">Need help?</h3>
            <p className="text-blue-200 text-sm">Our team is here for you.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="mailto:lengamaps@gmail.com"
              className="text-xs bg-white/10 hover:bg-white/20 transition-colors px-4 py-2 rounded-lg font-medium"
            >
              Email Support
            </a>
            <a
              href="https://wa.me/260965699359"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-accent text-navy font-bold px-4 py-2 rounded-lg hover:bg-yellow-400 transition-colors"
            >
              WhatsApp
            </a>
          </div>
        </motion.div>

        {/* Delete account */}
        {user && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors inline-flex items-center gap-1"
            >
              <Trash2 size={12} /> Request account deletion
            </button>
          </div>
        )}

        {/* ── Delete Account Modal ─────────────────────────────────────── */}
        {showDeleteModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => { if (!deleteLoading) setShowDeleteModal(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-1.5 w-full bg-red-500" />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center">
                    <Trash2 size={20} className="text-red-500" />
                  </div>
                  {!deleteLoading && (
                    <button onClick={() => setShowDeleteModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                      <X size={17} />
                    </button>
                  )}
                </div>

                {deleteSuccess ? (
                  <div className="text-center py-4">
                    <div className="text-4xl mb-3">💌</div>
                    <h2 className="text-xl font-black text-navy mb-2">Request received</h2>
                    <p className="text-gray-500 text-sm mb-1">
                      We&apos;ve received your deletion request and will be in touch within <strong>24–48 hours</strong>.
                    </p>
                    <p className="text-gray-400 text-xs">
                      We&apos;re sorry to see you go, {user?.name?.split(' ')[0] ?? 'you'}. Thank you for being part of Lenga Maps.
                    </p>
                    <button
                      onClick={() => setShowDeleteModal(false)}
                      className="mt-5 text-sm text-primary font-semibold hover:underline"
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-black text-navy mb-1">Before you go…</h2>
                    <p className="text-gray-500 text-sm mb-5">
                      We&apos;ll process your deletion request within 24–48 hours. If you&apos;re on a paid plan, please contact us about a refund.
                    </p>

                    {deleteError && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl mb-4 text-sm">
                        <AlertCircle size={15} /> {deleteError}
                      </div>
                    )}

                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-navy mb-2">Why are you leaving?</label>
                      <div className="space-y-2">
                        {[
                          { id: 'too_expensive',    label: 'Price is too expensive' },
                          { id: 'not_using',        label: "Not using it enough" },
                          { id: 'missing_features', label: 'Missing features I need' },
                          { id: 'switching_tools',  label: 'Switching to another tool' },
                          { id: 'project_ended',    label: 'My project has ended' },
                          { id: 'other',            label: 'Other' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setDeleteReason(opt.id)}
                            className={`w-full text-left px-3.5 py-2.5 rounded-xl border-2 text-sm transition-all ${
                              deleteReason === opt.id
                                ? 'border-red-400 bg-red-50 text-red-700 font-semibold'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-5">
                      <label className="block text-sm font-semibold text-navy mb-2">
                        Anything else you&apos;d like us to know? <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        value={deleteMessage}
                        onChange={(e) => setDeleteMessage(e.target.value)}
                        rows={3}
                        placeholder="Your feedback helps us improve…"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
                      />
                    </div>

                    <button
                      onClick={handleDeleteRequest}
                      disabled={deleteLoading || !deleteReason}
                      className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      {deleteLoading ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending request…</>
                      ) : (
                        'Submit deletion request'
                      )}
                    </button>
                    <p className="text-center text-xs text-gray-400 mt-3">
                      Your account stays active until we process this request.
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <DownloadGateProvider>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Loading dashboard...</p>
          </div>
        </div>
      }>
        <DashboardContent />
      </Suspense>
    </DownloadGateProvider>
  )
}
