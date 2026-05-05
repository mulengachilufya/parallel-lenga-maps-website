'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, TreePine, Waves } from 'lucide-react'
import type { ProtectedAreasLayer } from '@/app/api/protected-areas/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

interface ProtectedAreasListProps {
  userPlan?: 'basic' | 'pro' | 'max'
  /** Pre-computed by the dashboard: pro/max OR any business plan. We rely
   *  on this rather than rederiving from userPlan, so Business basic users
   *  (who get full data access despite plan='basic') aren't wrongly locked. */
  hasFullAccess?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ProtectedAreasList({ userPlan = 'basic', hasFullAccess = false }: ProtectedAreasListProps) {
  const { guardDownload } = useDownloadGate()
  const [layers,      setLayers]      = useState<ProtectedAreasLayer[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchLayers = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/protected-areas')
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const data = await res.json()
        setLayers(data.layers || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch protected areas data')
      } finally {
        setLoading(false)
      }
    }
    fetchLayers()
  }, [])

  // Always go through guardDownload — even for users without access. That's
  // the entire point of the gate: when the server didn't sign a URL for
  // this user (insufficient plan), the gate pops up the upgrade modal.
  const handleDownload = (layer: ProtectedAreasLayer) => {
    guardDownload('pro', () => {
      if (!layer.download_url) return  // gate already passed, but URL missing — silently no-op
      setDownloading(layer.id)
      const link = document.createElement('a')
      link.href     = layer.download_url
      link.download = layer.r2_key.split('/').pop() || 'protected-areas.zip'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => setDownloading(null), 2000)
    })
  }

  const filtered = layers.filter(
    (l) => l.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
           l.iso3.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // ── Loading / error / empty ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Loading protected-areas data…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700 text-sm font-medium">{error}</p>
      </div>
    )
  }
  if (layers.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center text-sm text-gray-500">
        Protected-areas data is being processed — check back soon.
      </div>
    )
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  const totalFeatures = layers.reduce((s, l) => s + (l.feature_count || 0), 0)
  const totalAreaKm2  = layers.reduce((s, l) => s + (Number(l.total_area_km2) || 0), 0)
  const sourceVersion = layers[0]?.source_version ?? ''

  return (
    <div>
      {/* GIS metadata banner */}
      <div className="bg-emerald-50 rounded-xl p-4 mb-5 text-xs text-gray-600 grid grid-cols-3 gap-3">
        <div>
          <span className="block text-gray-400 mb-0.5">Source</span>
          <span className="font-semibold text-navy">OpenStreetMap · ODbL</span>
        </div>
        <div>
          <span className="block text-gray-400 mb-0.5">Snapshot</span>
          <span className="font-semibold text-navy">{sourceVersion || '—'}</span>
        </div>
        <div>
          <span className="block text-gray-400 mb-0.5">CRS</span>
          <span className="font-semibold text-navy">EPSG:4326</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by country or ISO-3…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400
                     placeholder:text-gray-400"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          {filtered.length} of {layers.length}
        </span>
      </div>

      {/* Country grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((layer, idx) => {
          const isPro         = !hasFullAccess
          const isDownloading = downloading === layer.id
          const isMarineHeavy = (layer.marine_area_km2 ?? 0) > 0

          return (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              className="bg-white border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TreePine size={15} className="text-emerald-600" />
                    <span className="font-semibold text-navy text-sm">{layer.country}</span>
                  </div>
                  {isMarineHeavy && (
                    <span className="flex items-center gap-1 text-[10px] bg-sky-50 text-sky-700 font-medium px-1.5 py-0.5 rounded-full">
                      <Waves size={10} /> marine
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 text-[11px] text-gray-500">
                  <span>{layer.feature_count?.toLocaleString() ?? '-'} protected areas</span>
                  <span>
                    {Number(layer.total_area_km2).toLocaleString(undefined, { maximumFractionDigits: 0 })} km² total
                  </span>
                  {layer.designation_summary && (
                    <span className="text-gray-400 truncate" title={layer.designation_summary}>
                      {layer.designation_summary}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleDownload(layer)}
                disabled={isDownloading}
                className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-colors
                           ${isPro
                             ? 'bg-accent/15 text-amber-800 hover:bg-accent/30'
                             : isDownloading
                               ? 'bg-green-100 text-green-700'
                               : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
              >
                {isPro ? (
                  <>🔒 Upgrade to download</>
                ) : isDownloading ? (
                  <>✓ Downloading…</>
                ) : (
                  <>
                    <Download size={13} />
                    Download .zip
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
        <span>{totalFeatures.toLocaleString()} total protected areas</span>
        <span>·</span>
        <span>{Math.round(totalAreaKm2).toLocaleString()} km²</span>
        <span>·</span>
        <span>OpenStreetMap · ODbL</span>
      </div>
    </div>
  )
}
