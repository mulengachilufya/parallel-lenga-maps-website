'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Download, LogOut, User, Package, ChevronRight, Star, AlertCircle, ArrowLeft } from 'lucide-react'
import { supabase, DATASETS, PLAN_PRICING, type AccountType } from '@/lib/supabase'
import AdminBoundariesList from '@/components/AdminBoundariesList'
import HydrologyList from '@/components/HydrologyList'
import DEMList from '@/components/DEMList'
import RiversList from '@/components/RiversList'
import WatershedsList from '@/components/WatershedsList'
import RainfallClimateList from '@/components/RainfallClimateList'
import AquiferList from '@/components/AquiferList'

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
  'dems': {
    title: '⛰️ Digital Elevation Models',
    tier: 'basic',
    component: (plan) => <DEMList userPlan={plan} />,
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
    title: '🌊 HydroRIVERS - River Networks',
    subtitle: 'WWF / HydroSHEDS v10 · CC BY 4.0 · GeoPackage per country',
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
}

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  // Which section to show - null means show the overview (all sections listed as cards)
  const section = searchParams.get('section')

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUser({
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || 'User',
          plan: (session.user.user_metadata?.plan || 'basic') as UserPlan,
          accountType: (session.user.user_metadata?.account_type || 'student') as AccountType,
        })
      }
      setLoading(false)
    }
    getUser()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
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
                {user ? `Welcome back, ${user.name.split(' ')[0]} 👋` : 'Download GIS Data'}
              </h1>
              <p className="text-gray-500 mt-1">
                {user ? 'Choose a dataset below to browse and download files.' : 'Browse and download GIS datasets for Africa.'}
              </p>
            </motion.div>

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
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
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
  )
}
