'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Download, MapPin, Search } from 'lucide-react'
import type { AdminBoundary } from '@/app/api/admin-boundaries/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

const ADMIN_LEVEL_LABELS: Record<number, string> = {
  0: 'Country Outline',
  1: 'Provinces / Regions',
  2: 'Districts / Counties',
  3: 'Local Areas',
}

const ADMIN_LEVEL_COLORS: Record<number, string> = {
  0: 'bg-emerald-100 text-emerald-700',
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-violet-100 text-violet-700',
  3: 'bg-amber-100 text-amber-700',
}

interface AdminBoundariesListProps {
  userPlan?: 'basic' | 'pro' | 'max'
  /** Pre-computed by the dashboard: does the caller have an active plan
   *  that unlocks this section's tier? UI hint only — the per-row click
   *  still routes through DownloadGate so unauthorised users get the
   *  signup/pay/upgrade modal regardless. */
  hasAccess?: boolean
}

interface GroupedCountry {
  country: string
  countryCode: string | null | undefined
  boundaries: AdminBoundary[]
  totalSize: number
}

export default function AdminBoundariesList({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userPlan = 'basic',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasAccess = false,
}: AdminBoundariesListProps) {
  const { guardDownload } = useDownloadGate()
  const [boundaries, setBoundaries] = useState<AdminBoundary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchBoundaries = async () => {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams()
        params.set('includeUrl', 'true')

        const res = await fetch(`/api/admin-boundaries?${params.toString()}`)
        if (!res.ok) throw new Error('Failed to fetch boundaries')

        const { boundaries: data } = await res.json()
        setBoundaries(data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load boundaries')
      } finally {
        setLoading(false)
      }
    }

    fetchBoundaries()
  }, [])

  // ALWAYS go through guardDownload — even when download_url is missing.
  // A missing URL means the server didn't sign one for this user (no
  // session, no plan, or wrong tier). We WANT the gate to pop up the
  // appropriate signup/pay/upgrade modal in that case. Early-returning
  // would just make the button look broken to the user.
  const handleDownload = (boundary: AdminBoundary) => {
    guardDownload('basic', () => {
      if (!boundary.download_url) return
      setDownloading(boundary.id)
      window.open(boundary.download_url, '_blank')
      setTimeout(() => setDownloading(null), 1000)
    })
  }

  // Group boundaries by country
  const grouped: GroupedCountry[] = Object.values(
    boundaries.reduce<Record<string, GroupedCountry>>((acc, b) => {
      if (!acc[b.country]) {
        acc[b.country] = {
          country: b.country,
          countryCode: b.country_code,
          boundaries: [],
          totalSize: 0,
        }
      }
      acc[b.country].boundaries.push(b)
      acc[b.country].totalSize += b.file_size_mb
      return acc
    }, {})
  ).sort((a, b) => a.country.localeCompare(b.country))

  // Filter by search
  const filtered = searchQuery
    ? grouped.filter((g) =>
        g.country.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : grouped

  const toggleCountry = (country: string) => {
    setExpandedCountry((prev) => (prev === country ? null : country))
  }

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search countries..."
          className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 bg-gray-50 transition text-sm"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/30 border-t-primary" />
          <span className="ml-3 text-gray-500 text-sm">Loading boundaries...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && !error && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-gray-500 text-sm text-center">
          {searchQuery
            ? `No countries found matching "${searchQuery}"`
            : 'No admin boundaries available.'}
        </div>
      )}

      {/* Country accordion list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((group, i) => (
            <motion.div
              key={group.country}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.015, 0.4) }}
              className="border border-gray-200 rounded-xl overflow-hidden bg-white"
            >
              {/* Country header - clickable */}
              <button
                onClick={() => toggleCountry(group.country)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MapPin size={16} className="text-primary" />
                  </div>
                  <div>
                    <span className="font-semibold text-navy text-sm">
                      {group.country}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {group.boundaries.length} level{group.boundaries.length !== 1 ? 's' : ''}
                      {' '}&middot;{' '}
                      {group.totalSize.toFixed(1)} MB total
                    </span>
                  </div>
                </div>
                <motion.div
                  animate={{ rotate: expandedCountry === group.country ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={18} className="text-gray-400" />
                </motion.div>
              </button>

              {/* Expanded admin levels */}
              <AnimatePresence>
                {expandedCountry === group.country && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-gray-100 bg-gray-50/50">
                      {group.boundaries
                        .sort((a, b) => a.admin_level - b.admin_level)
                        .map((boundary) => (
                          <div
                            key={boundary.id}
                            className="flex items-center justify-between px-5 py-3 border-b border-gray-100 last:border-b-0 hover:bg-white/80 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                                  ADMIN_LEVEL_COLORS[boundary.admin_level] || 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {ADMIN_LEVEL_LABELS[boundary.admin_level] ||
                                  `Level ${boundary.admin_level}`}
                              </span>
                              <span className="text-xs text-gray-400">
                                {boundary.geom_type} &middot; {boundary.file_size_mb.toFixed(2)} MB
                              </span>
                            </div>
                            <motion.button
                              onClick={() => handleDownload(boundary)}
                              disabled={downloading === boundary.id}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                downloading === boundary.id
                                  ? 'bg-gray-300 text-gray-500 cursor-wait'
                                  : 'bg-primary text-white hover:bg-primary/90'
                              }`}
                            >
                              {downloading === boundary.id ? (
                                <>
                                  <span className="animate-spin inline-block w-3 h-3 border-2 border-t-transparent border-white rounded-full" />
                                  Wait...
                                </>
                              ) : (
                                <>
                                  <Download size={12} />
                                  Download
                                </>
                              )}
                            </motion.button>
                          </div>
                        ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}

          {/* Summary */}
          <p className="text-xs text-gray-400 pt-2">
            {filtered.length} countries &middot; {boundaries.length} total boundary files
          </p>
        </div>
      )}
    </div>
  )
}
