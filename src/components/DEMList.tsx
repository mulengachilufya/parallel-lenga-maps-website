'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Download, Mountain, Search } from 'lucide-react'
import type { DEMLayer } from '@/app/api/dems/route'

const LAYER_LABELS: Record<string, string> = {
  dem:   'Elevation (DEM)',
  slope: 'Slope',
}

const LAYER_COLORS: Record<string, string> = {
  dem:   'bg-emerald-100 text-emerald-700',
  slope: 'bg-orange-100 text-orange-700',
}

interface DEMListProps {
  userPlan?: 'basic' | 'pro'
}

interface GroupedCountry {
  country: string
  layers: DEMLayer[]
  totalSize: number
}

export default function DEMList({ userPlan = 'basic' }: DEMListProps) {
  const [layers, setLayers] = useState<DEMLayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchLayers = async () => {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams()
        params.set('includeUrl', 'true')

        const res = await fetch(`/api/dems?${params.toString()}`)
        if (!res.ok) throw new Error('Failed to fetch DEM layers')

        const { layers: data } = await res.json()
        setLayers(data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load DEM layers')
      } finally {
        setLoading(false)
      }
    }

    fetchLayers()
  }, [])

  const handleDownload = (layer: DEMLayer) => {
    if (!layer.download_url) return
    setDownloading(layer.id)
    window.open(layer.download_url, '_blank')
    setTimeout(() => setDownloading(null), 1000)
  }

  // Group by country
  const grouped: GroupedCountry[] = Object.values(
    layers.reduce<Record<string, GroupedCountry>>((acc, l) => {
      if (!acc[l.country]) {
        acc[l.country] = { country: l.country, layers: [], totalSize: 0 }
      }
      acc[l.country].layers.push(l)
      acc[l.country].totalSize += l.file_size_mb
      return acc
    }, {})
  ).sort((a, b) => a.country.localeCompare(b.country))

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
          <span className="ml-3 text-gray-500 text-sm">Loading DEM layers...</span>
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
            : 'No DEM layers available.'}
        </div>
      )}

      {/* Country accordion */}
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
              {/* Country header */}
              <button
                onClick={() => toggleCountry(group.country)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Mountain size={16} className="text-emerald-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-navy text-sm">
                      {group.country}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {group.layers.length} file{group.layers.length !== 1 ? 's' : ''}
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

              {/* Expanded layers */}
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
                      {group.layers
                        .sort((a, b) => a.layer_type.localeCompare(b.layer_type))
                        .map((layer) => (
                          <div
                            key={layer.id}
                            className="flex items-center justify-between px-5 py-3 border-b border-gray-100 last:border-b-0 hover:bg-white/80 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                                  LAYER_COLORS[layer.layer_type] || 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {LAYER_LABELS[layer.layer_type] || layer.layer_type}
                              </span>
                              <span className="text-xs text-gray-400">
                                {layer.file_format} &middot; {layer.resolution} &middot; {layer.file_size_mb.toFixed(2)} MB
                              </span>
                            </div>
                            <motion.button
                              onClick={() => handleDownload(layer)}
                              disabled={downloading === layer.id}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                downloading === layer.id
                                  ? 'bg-gray-300 text-gray-500 cursor-wait'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                              }`}
                            >
                              {downloading === layer.id ? (
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

          <p className="text-xs text-gray-400 pt-2">
            {filtered.length} countries &middot; {layers.length} total DEM files
          </p>
        </div>
      )}

      {userPlan !== 'pro' && (
        <p className="text-xs text-gray-400 mt-2">
          * Upgrade to Pro to unlock all 54 countries and full download access.
        </p>
      )}
    </div>
  )
}
