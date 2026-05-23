'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, Route } from 'lucide-react'
import type { RoadLayer } from '@/app/api/roads/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

interface RoadsListProps {
  userPlan?:  'basic' | 'pro' | 'max'
  hasAccess?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function RoadsList({ userPlan = 'basic', hasAccess = false }: RoadsListProps) {
  const { openGate } = useDownloadGate()
  const [layers,      setLayers]      = useState<RoadLayer[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/roads')
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const { layers: data } = await res.json()
        setLayers(data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleDownload = (layer: RoadLayer) => {
    openGate('max', () => {
      if (!layer.download_url) return
      setDownloading(layer.id)
      window.open(layer.download_url, '_blank')
      setTimeout(() => setDownloading(null), 1000)
    })
  }

  const filtered = searchQuery
    ? layers.filter(l =>
        l.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.iso3.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : layers

  if (loading) return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-700 rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading road networks…</p>
    </div>
  )
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <p className="text-red-700 text-sm">{error}</p>
    </div>
  )
  if (layers.length === 0) return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 text-center text-sm text-gray-500">
      Road network data is being processed — check back soon.
    </div>
  )

  const totalKm = layers.reduce((s, l) => s + Number(l.total_km || 0), 0)

  return (
    <div>
      {/* Metadata banner */}
      <div className="bg-orange-50 rounded-xl p-4 mb-5 text-xs text-gray-600 grid grid-cols-3 gap-3">
        <div><span className="block text-gray-400 mb-0.5">Source</span><span className="font-semibold text-navy">Natural Earth 1:10m</span></div>
        <div><span className="block text-gray-400 mb-0.5">Coverage</span><span className="font-semibold text-navy">Significant roads only</span></div>
        <div><span className="block text-gray-400 mb-0.5">License</span><span className="font-semibold text-navy">Public Domain</span></div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by country…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 placeholder:text-gray-400"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          {filtered.length} of {layers.length}
        </span>
      </div>

      {/* Country grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((layer, idx) => (
          <motion.div
            key={layer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.02, 0.3) }}
            className="bg-white border border-gray-100 hover:border-orange-200 hover:shadow-sm transition-all rounded-xl p-4 flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Route size={15} className="text-orange-600" />
                <span className="font-semibold text-navy text-sm">{layer.country}</span>
              </div>
              <div className="text-[11px] text-gray-400 space-y-0.5">
                <div>{layer.feature_count} road segments · {Number(layer.total_km).toLocaleString()} km</div>
                <div>{layer.file_size_mb} MB GeoPackage</div>
              </div>
            </div>
            <button
              onClick={() => handleDownload(layer)}
              disabled={downloading === layer.id}
              className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-colors ${
                !hasAccess
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  : downloading === layer.id
                    ? 'bg-green-100 text-green-700'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
              }`}
            >
              {!hasAccess ? '🔒 Max plan required' : downloading === layer.id ? '✓ Downloading…' : <><Download size={13} />Download .gpkg</>}
            </button>
          </motion.div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-4 justify-center text-[11px] text-gray-400">
        <span>{layers.length} countries</span>
        <span>·</span>
        <span>{Math.round(totalKm).toLocaleString()} km total road network</span>
        <span>·</span>
        <span>Natural Earth · Public Domain</span>
      </div>
    </div>
  )
}
