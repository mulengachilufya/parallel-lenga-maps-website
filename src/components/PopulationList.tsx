'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, Users, ExternalLink } from 'lucide-react'
import type { PopulationSettlementsLayer } from '@/app/api/population-settlements/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

interface PopulationListProps {
  userPlan?: 'basic' | 'pro' | 'max'
  /** Pre-computed by the dashboard: pro/max OR any business plan. Use this
   *  instead of recomputing from `userPlan === 'basic'` — that recomputation
   *  silently locks Business basic users out despite their pricing promise. */
  hasFullAccess?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PopulationList({ userPlan = 'basic', hasFullAccess = false }: PopulationListProps) {
  const { guardDownload } = useDownloadGate()
  const [layers, setLayers]           = useState<PopulationSettlementsLayer[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchLayers = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/population-settlements?includeUrl=true')
        if (!res.ok) throw new Error('Failed to fetch data')
        const { layers: data } = await res.json()
        setLayers(data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchLayers()
  }, [])

  // Always go through guardDownload — even when download_url is missing.
  // Missing URL means the API didn't sign one for this user (= they don't
  // have access yet); the gate then pops up the upgrade modal. Early-
  // returning would just leave the user staring at a dead button.
  const handleDownload = (layer: PopulationSettlementsLayer) => {
    guardDownload('pro', () => {
      if (!layer.download_url) return  // gate passed but no URL: edge case, no-op
      setDownloading(layer.id)
      window.open(layer.download_url, '_blank')
      setTimeout(() => setDownloading(null), 1000)
    })
  }

  const filtered = searchQuery
    ? layers.filter((l) =>
        l.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.iso3.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : layers

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search countries…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 transition"
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
        <span className="bg-gray-100 rounded-full px-3 py-1">CRS: EPSG:4326 (WGS 84)</span>
        <span className="bg-gray-100 rounded-full px-3 py-1">Format: Shapefile (ZIP)</span>
        <span className="bg-gray-100 rounded-full px-3 py-1">Source: HDX COD-PS / COD-AB</span>
        <span className="bg-gray-100 rounded-full px-3 py-1">Level: ADM1 / ADM2</span>
        <span className="bg-gray-100 rounded-full px-3 py-1">Units: persons</span>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/30 border-t-primary" />
          <span className="ml-3 text-gray-500 text-sm">Loading data…</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-gray-500 text-sm text-center">
          {searchQuery
            ? `No countries found matching "${searchQuery}"`
            : 'No data available yet.'}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((layer, i) => (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.015, 0.35) }}
              className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Users size={15} className="text-red-600" />
                </div>
                <div className="min-w-0">
                  <span className="font-semibold text-navy text-sm">{layer.country}</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="text-xs text-gray-400">{layer.admin_level}</span>
                    <span className="text-xs text-gray-400">{layer.ref_year}</span>
                    <span className="text-xs text-gray-400">
                      pop {layer.total_population.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400">
                      {layer.feature_count} features
                    </span>
                    <span className="text-xs text-gray-400">
                      {layer.file_size_mb.toFixed(2)} MB
                    </span>
                    {layer.hdx_url && (
                      <a
                        href={layer.hdx_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink size={10} /> source
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Button stays clickable when the user lacks access — the
                  click pops up the upgrade modal via DownloadGate. Disabling
                  would hide the upgrade path. Distinct visual style for the
                  locked state so the user knows ahead of clicking. */}
              <motion.button
                onClick={() => handleDownload(layer)}
                disabled={downloading === layer.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  downloading === layer.id
                    ? 'bg-gray-300 text-gray-500 cursor-wait'
                    : !hasFullAccess
                      ? 'bg-accent/15 text-amber-800 hover:bg-accent/30'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {downloading === layer.id ? (
                  <>
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-t-transparent border-white rounded-full" />
                    Wait…
                  </>
                ) : !hasFullAccess ? (
                  <>🔒 Upgrade</>
                ) : (
                  <>
                    <Download size={12} />
                    Download
                  </>
                )}
              </motion.button>
            </motion.div>
          ))}

          <p className="text-xs text-gray-400 pt-1">
            {filtered.length} file{filtered.length !== 1 ? 's' : ''} shown
          </p>
        </div>
      )}

      {!hasFullAccess && (
        <p className="text-xs text-gray-400 mt-2">
          * Population & Settlements is Pro-only. Upgrade to unlock all 54 countries.
        </p>
      )}
    </div>
  )
}
