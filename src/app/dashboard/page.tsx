'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Download, LogOut, User, Package, ChevronRight, Star, AlertCircle } from 'lucide-react'
import { supabase, DATASETS } from '@/lib/supabase'
import AdminBoundariesList from '@/components/AdminBoundariesList'
import HydrologyList from '@/components/HydrologyList'
import DEMList from '@/components/DEMList'
import RiversList from '@/components/RiversList'
import WatershedsList from '@/components/WatershedsList'
import RainfallClimateList from '@/components/RainfallClimateList'

type UserPlan = 'basic' | 'pro'

interface UserData {
  email: string
  name: string
  plan: UserPlan
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUser({
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || 'User',
          plan: (session.user.user_metadata?.plan || 'basic') as UserPlan,
        })
      }
      setLoading(false)

      // Scroll to hash anchor after content renders
      if (window.location.hash) {
        setTimeout(() => {
          const id = window.location.hash.slice(1)
          const el = document.getElementById(id)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 300)
      }
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

  const accessibleDatasets = DATASETS.filter(
    (d) => (user?.plan === 'pro') || d.tier === 'basic'
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const lockedDatasets = DATASETS.filter(
    (d) => user?.plan !== 'pro' && d.tier === 'pro'
  )

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
            {user ? 'Manage your GIS data downloads.' : 'Browse and download administrative boundary datasets for Africa.'}
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
                {user.plan === 'pro' ? 'K75/month — Full access' : 'K25/month — Core access'}
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
                  Unlock all 54 countries, 12 datasets, and unlimited downloads for just K75/month.
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

        {/* Admin Boundaries Section */}
        <div className="mb-8">
          <h2 className="text-lg font-black text-navy mb-4">📍 Administrative Boundaries</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <AdminBoundariesList userPlan={user?.plan || 'basic'} />
          </div>
        </div>

        {/* Digital Elevation Model Section */}
        <div id="dems" className="mb-8">
          <h2 className="text-lg font-black text-navy mb-4">⛰️ Digital Elevation Models</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <DEMList userPlan={user?.plan || 'basic'} />
          </div>
        </div>

        {/* River Networks & Lakes Section */}
        <div className="mb-8">
          <h2 className="text-lg font-black text-navy mb-4">🌊 River Networks &amp; Lakes</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <HydrologyList userPlan={user?.plan || 'basic'} />
          </div>
        </div>

        {/* Rainfall & Climate Section */}
        <div id="rainfall-climate" className="mb-8">
          <h2 className="text-lg font-black text-navy mb-1">🌧️ Rainfall, Temperature &amp; Drought</h2>
          <p className="text-xs text-gray-400 mb-4">
            CHIRPS v2.0 &amp; WorldClim v2.1 &middot; EPSG:4326 &middot; GeoTIFF (ZIP) &middot; 0.05° (~5 km)
          </p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <RainfallClimateList userPlan={user?.plan || 'basic'} />
          </div>
        </div>

        {/* HydroRIVERS Section */}
        <div id="rivers" className="mb-8">
          <h2 className="text-lg font-black text-navy mb-1">🌊 HydroRIVERS — River Networks</h2>
          <p className="text-xs text-gray-400 mb-4">
            WWF / HydroSHEDS v10 &middot; CC BY 4.0 &middot; GeoPackage per country
          </p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <RiversList userPlan={user?.plan || 'basic'} />
          </div>
        </div>

        {/* HydroBASINS Section */}
        <div id="watersheds" className="mb-8">
          <h2 className="text-lg font-black text-navy mb-1">🗺️ HydroBASINS — Watershed Boundaries</h2>
          <p className="text-xs text-gray-400 mb-4">
            WWF / HydroSHEDS Level 6 v1c &middot; CC BY 4.0 &middot; GeoPackage per country
          </p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <WatershedsList userPlan={user?.plan || 'basic'} />
          </div>
        </div>

        {/* Support */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-navy rounded-2xl p-6 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
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
              href="https://wa.me/260779187025"
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
