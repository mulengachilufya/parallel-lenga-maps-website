'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Download, Lock, LogOut, User, Package, ChevronRight, Star, AlertCircle } from 'lucide-react'
import { supabase, DATASETS } from '@/lib/supabase'

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
  const [downloading, setDownloading] = useState<number | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser({
        email: session.user.email || '',
        name: session.user.user_metadata?.full_name || 'User',
        plan: (session.user.user_metadata?.plan || 'basic') as UserPlan,
      })
      setLoading(false)
    }
    getUser()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleDownload = async (datasetId: number, datasetName: string, isPro: boolean) => {
    if (isPro && user?.plan !== 'pro') return

    setDownloading(datasetId)
    // Simulate download — in production, fetch from Cloudflare R2
    await new Promise((r) => setTimeout(r, 1500))
    setDownloading(null)

    // Create a placeholder download
    const blob = new Blob(
      [`# ${datasetName}\nDataset placeholder — actual files are stored in Cloudflare R2.\nPlan: ${user?.plan}\nDownloaded: ${new Date().toISOString()}`],
      { type: 'text/plain' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${datasetName.toLowerCase().replace(/\s+/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
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

  if (!user) return null

  const accessibleDatasets = DATASETS.filter(
    (d) => user.plan === 'pro' || d.tier === 'basic'
  )
  const lockedDatasets = DATASETS.filter(
    (d) => user.plan !== 'pro' && d.tier === 'pro'
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <svg viewBox="0 0 40 40" className="w-8 h-8">
              <circle cx="20" cy="20" r="18" fill="#1E5F8E" />
              <ellipse cx="20" cy="20" rx="8" ry="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
              <line x1="2" y1="20" x2="38" y2="20" stroke="#F5B800" strokeWidth="1.5" />
              <circle cx="20" cy="20" r="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
            </svg>
            <span className="font-bold text-navy">LENGA <span className="text-accent">MAPS</span></span>
          </Link>

          <div className="flex items-center gap-4">
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
            Welcome back, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-gray-500 mt-1">Manage your GIS data downloads.</p>
        </motion.div>

        {/* Stats Cards */}
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

        {/* Upgrade Banner (Basic only) */}
        {user.plan !== 'pro' && (
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

        {/* Available Datasets */}
        <div className="mb-8">
          <h2 className="text-lg font-black text-navy mb-4">Your Datasets</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {DATASETS.map((dataset, i) => {
              const isLocked = user.plan !== 'pro' && dataset.tier === 'pro'
              return (
                <motion.div
                  key={dataset.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`flex items-center justify-between p-4 border-b border-gray-100 last:border-0 transition-colors ${
                    isLocked ? 'opacity-50 bg-gray-50/50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-2xl flex-shrink-0">{dataset.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-navy text-sm">{dataset.name}</span>
                        {isLocked && (
                          <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                            <Lock size={10} /> Pro
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{dataset.category} · {dataset.format}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <span className="hidden sm:block text-xs text-gray-400">{dataset.resolution}</span>
                    {isLocked ? (
                      <Link
                        href="/pricing"
                        className="flex items-center gap-1 text-xs font-semibold text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
                      >
                        <Lock size={12} />
                        Unlock
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleDownload(dataset.id, dataset.name, dataset.tier === 'pro')}
                        disabled={downloading === dataset.id}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-70"
                      >
                        {downloading === dataset.id ? (
                          <>
                            <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                            <span className="hidden sm:inline">Preparing...</span>
                          </>
                        ) : (
                          <>
                            <Download size={12} />
                            <span className="hidden sm:inline">Download</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })}
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
