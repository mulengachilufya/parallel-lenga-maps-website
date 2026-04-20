'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Download, LogOut, User, Package, ChevronRight, Star, AlertCircle, ArrowLeft, Trash2, X } from 'lucide-react'
import { supabase, DATASETS, PLAN_PRICING, type AccountType } from '@/lib/supabase'
import { DownloadGateProvider } from '@/contexts/DownloadGateContext'
import AdminBoundariesList from '@/components/AdminBoundariesList'
import HydrologyList from '@/components/HydrologyList'
import RiversList from '@/components/RiversList'
import WatershedsList from '@/components/WatershedsList'
import RainfallClimateList from '@/components/RainfallClimateList'
import AquiferList from '@/components/AquiferList'
import LulcList from '@/components/LulcList'
import PopulationList from '@/components/PopulationList'

type UserPlan = 'basic' | 'pro'

interface UserData {
  email: string
  name: string
  plan: UserPlan
  accountType: AccountType
}

// ── Section registry ────────────────────────────────────────────────────────
// Maps URL section param → component, title, subtitle, tier
const SECTIONS: Record<string, {
  title: string
  subtitle?: string
  tier: 'basic' | 'pro'
  component: (plan: UserPlan) => React.ReactNode
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
    component: (plan) => <AquiferList userPlan={plan} />,
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
    component: (plan) => <PopulationList userPlan={plan} />,
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

  // Which section to show - null means show the overview (all sections listed as cards)
  const section = searchParams.get('section')

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Preserve the dashboard path + section so they land back here after login.
        const here = window.location.pathname + window.location.search
        router.replace(`/login?next=${encodeURIComponent(here)}`)
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, account_type, full_name')
        .eq('id', session.user.id)
        .single()
      setUser({
        email: session.user.email || '',
        name: profile?.full_name || session.user.user_metadata?.full_name || 'User',
        plan: (profile?.plan || session.user.user_metadata?.plan || 'basic') as UserPlan,
        accountType: (profile?.account_type || session.user.user_metadata?.account_type || 'student') as AccountType,
      })
      setLoading(false)
    }
    getUser()
  }, [router])

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

  const userPlan = user?.plan || 'basic'
  const accessibleDatasets = DATASETS.filter(
    (d) => (userPlan === 'pro') || d.tier === 'basic'
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
              {sectionData.component(userPlan)}
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

            {/* First-time welcome banner */}
            {searchParams.get('welcome') === 'new' && user && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-2xl p-5 sm:p-6"
              >
                <h2 className="text-lg font-black text-navy mb-1">You&apos;re on the free Basic plan 🎉</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Start by downloading any of the free datasets below — no payment needed. When you&apos;re ready for
                  more countries, more datasets, or unlimited downloads, upgrade anytime from{' '}
                  <Link href="/pricing" className="text-primary font-semibold hover:underline">Pricing</Link>.
                </p>
              </motion.div>
            )}

            {/* Stats Cards - only show for logged in users */}
            {user && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className={`rounded-2xl p-6 text-white ${
                    user.plan === 'pro' ? 'bg-accent' : 'gradient-primary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold opacity-80 uppercase tracking-wider">Current Plan</span>
                    {user.plan === 'pro' && <Star size={16} fill="currentColor" />}
                  </div>
                  <div className="text-3xl font-black mb-1">{user.plan === 'pro' ? 'Pro' : 'Basic'}</div>
                  <p className="text-sm opacity-80">
                    {(() => { const p = PLAN_PRICING[user.accountType]?.[user.plan]; return p ? `K${p.zmw ?? p.usd}` : '—' })()}/month - {user.plan === 'pro' ? 'Full access' : 'Core access'}
                  </p>
                  <p className="text-xs opacity-60 mt-0.5 capitalize">
                    {user.accountType} rate
                  </p>
                  {user.plan !== 'pro' && (
                    <Link
                      href="/pricing"
                      className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-accent hover:underline"
                    >
                      Upgrade to Pro <ChevronRight size={12} />
                    </Link>
                  )}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Package size={18} className="text-primary" />
                    <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Datasets Available</span>
                  </div>
                  <div className="text-3xl font-black text-navy">{accessibleDatasets.length}</div>
                  <p className="text-sm text-gray-400 mt-1">of {DATASETS.length} total datasets</p>
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
                    {user.plan === 'pro' ? '54' : '3'}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {user.plan === 'pro' ? 'All of Africa' : 'Choose any 3'}
                  </p>
                </motion.div>
              </div>
            )}

            {/* Upgrade Banner (Basic only) */}
            {user && user.plan !== 'pro' && (
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

            {/* Dataset cards - each links to its own isolated view */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(SECTIONS).map(([key, sec], i) => {
                const isProLocked = sec.tier === 'pro' && userPlan !== 'pro'

                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.06, 0.4) }}
                  >
                    {isProLocked ? (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 opacity-60">
                        <h3 className="text-lg font-bold text-navy mb-1">{sec.title}</h3>
                        {sec.subtitle && <p className="text-xs text-gray-400 mb-3">{sec.subtitle}</p>}
                        <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary font-semibold px-2 py-1 rounded-full">
                          🔒 Pro Only
                        </span>
                      </div>
                    ) : (
                      <Link
                        href={`/dashboard?section=${key}`}
                        replace
                        className="group block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 p-6"
                      >
                        <h3 className="text-lg font-bold text-navy group-hover:text-primary transition-colors mb-1">
                          {sec.title}
                        </h3>
                        {sec.subtitle && <p className="text-xs text-gray-400 mb-3">{sec.subtitle}</p>}
                        <div className="flex items-center gap-2 text-sm font-semibold text-primary group-hover:text-accent transition-colors">
                          <Download size={14} />
                          Browse &amp; Download
                          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </div>
                      </Link>
                    )}
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
