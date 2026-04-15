'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Mountain, Search } from 'lucide-react'
import type { DEMLayer } from '@/app/api/dems/route'

interface DEMListProps {
  userPlan?: 'basic' | 'pro'
}

export default function DEMList({ userPlan = 'basic' }: DEMListProps) {
  const [layers, setLayers] = useState<DEMLayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchLayers = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/dems?includeUrl=true')
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

  const filtered = searchQuery
    ? layers.filter((l) => l.country.toLowerCase().includes(searchQuery.toLowerCase()))
    : layers

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

      {/* Country list - one row per country */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((layer, i) => (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.015, 0.4) }}
              className="flex items-center justify-between px-5 py-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Mountain size={16} className="text-emerald-600" />
                </div>
                <div>
                  <span className="font-semibold text-navy text-sm">{layer.country}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {layer.resolution} &middot; {layer.file_size_mb.toFixed(1)} MB
                  </span>
                </div>
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
            </motion.div>
          ))}

          <p className="text-xs text-gray-400 pt-2">
            {filtered.length} countries
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
