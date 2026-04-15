'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, Droplets, AlertTriangle, CheckCircle } from 'lucide-react'
import type { AquiferLayer } from '@/app/api/aquifer/route'

interface AquiferListProps {
  userPlan?: 'basic' | 'pro'
}

export default function AquiferList({ userPlan = 'basic' }: AquiferListProps) {
  const [layers, setLayers]           = useState<AquiferLayer[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchLayers = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/aquifer')
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const data = await res.json()
        setLayers(data.layers || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch aquifer data')
      } finally {
        setLoading(false)
      }
    }
    fetchLayers()
  }, [])

  const handleDownload = async (layer: AquiferLayer) => {
    if (!layer.download_url) return
    setDownloading(layer.id)
    try {
      const link = document.createElement('a')
      link.href = layer.download_url
      link.download = layer.r2_key.split('/').pop() || 'aquifer.gpkg'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } finally {
      setTimeout(() => setDownloading(null), 2000)
    }
  }

  const filtered = layers.filter(
    (l) => l.country.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="w-8 h-8 border-3 border-sky-200 border-t-sky-700 rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Loading aquifer data…</p>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700 text-sm font-medium">{error}</p>
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (layers.length === 0) {
    return (
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-6 text-center text-sm text-gray-500">
        Aquifer data is being processed — check back soon.
      </div>
    )
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalFeatures  = layers.reduce((s, l) => s + (l.feature_count || 0), 0)
  const totalConflicts = layers.reduce((s, l) => s + (l.conflict_count || 0), 0)

  return (
    <div>
      {/* GIS metadata banner */}
      <div className="bg-sky-50 rounded-xl p-4 mb-5 text-xs text-gray-600 grid grid-cols-3 gap-3">
        <div>
          <span className="block text-gray-400 mb-0.5">Source</span>
          <span className="font-semibold text-navy">IGRAC GGIS</span>
        </div>
        <div>
          <span className="block text-gray-400 mb-0.5">Format</span>
          <span className="font-semibold text-navy">GeoPackage</span>
        </div>
        <div>
          <span className="block text-gray-400 mb-0.5">CRS</span>
          <span className="font-semibold text-navy">EPSG:4326</span>
        </div>
      </div>

      {/* Conflict info */}
      {totalConflicts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">{totalConflicts.toLocaleString()}</span> features have source
            conflicts flagged in the <code className="bg-amber-100 px-1 rounded">source_conflict</code> field.
            These are not errors — they indicate where institutions disagree. Check{' '}
            <code className="bg-amber-100 px-1 rounded">conflict_notes</code> for details.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by country name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400
                     placeholder:text-gray-400"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          {filtered.length} of {layers.length}
        </span>
      </div>

      {/* Country grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((layer, idx) => {
          const isPro = userPlan !== 'pro'
          const isDownloading = downloading === layer.id
          const hasConflicts = (layer.conflict_count || 0) > 0

          return (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              className={`bg-white border rounded-xl p-4 flex flex-col justify-between gap-3
                         ${isPro ? 'border-gray-100 opacity-60' : 'border-gray-100 hover:border-sky-200 hover:shadow-sm transition-all'}`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Droplets size={15} className="text-sky-600" />
                    <span className="font-semibold text-navy text-sm">{layer.country}</span>
                  </div>
                  {hasConflicts ? (
                    <span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 font-medium px-1.5 py-0.5 rounded-full">
                      <AlertTriangle size={10} />
                      {layer.conflict_count} conflict{layer.conflict_count !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] bg-green-50 text-green-700 font-medium px-1.5 py-0.5 rounded-full">
                      <CheckCircle size={10} />
                      Clean
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-[11px] text-gray-400">
                  <span>{layer.feature_count?.toLocaleString() || '—'} features</span>
                </div>
              </div>

              <button
                onClick={() => handleDownload(layer)}
                disabled={isPro || isDownloading || !layer.download_url}
                className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-colors
                           ${isPro
                             ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                             : isDownloading
                               ? 'bg-green-100 text-green-700'
                               : 'bg-sky-600 hover:bg-sky-700 text-white'}`}
              >
                {isPro ? (
                  <>🔒 Pro Only</>
                ) : isDownloading ? (
                  <>✓ Downloading…</>
                ) : (
                  <>
                    <Download size={13} />
                    Download .gpkg
                  </>
                )}
              </button>
            </motion.div>
          )
        })}
      </div>

      {/* Stats footer */}
      <div className="mt-5 flex flex-wrap gap-4 justify-center text-[11px] text-gray-400">
        <span>{layers.length} countries</span>
        <span>·</span>
        <span>{totalFeatures.toLocaleString()} total features</span>
        <span>·</span>
        <span>IGRAC GGIS — CC BY 4.0</span>
      </div>
    </div>
  )
}
