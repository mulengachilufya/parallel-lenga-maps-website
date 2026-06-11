'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, Map } from 'lucide-react'
import type { HydrologyLayer } from '@/app/api/hydrology/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

interface WatershedsListProps {
  userPlan?:  string
  hasAccess?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function WatershedsList({ userPlan = 'starter' }: WatershedsListProps) {
  const { openGate, checkAccess, consumeDownload } = useDownloadGate()
  // Live access from the gate. The old `hasAccess` PROP defaulted to false
  // and the dashboard never passed it, so the button read "locked" for
  // everyone. Watersheds is a Pro-tier dataset; derive from checkAccess.
  const hasAccess = checkAccess('watersheds')
  const [layers,      setLayers]      = useState<HydrologyLayer[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/hydrology?layerType=watersheds&includeUrl=true')
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const { layers: data } = await res.json()
        setLayers(data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleDownload = async (river: HydrologyLayer) => {
  if (!checkAccess('watersheds')) { openGate('watersheds'); return }
  if (!river.download_url) { openGate('watersheds'); return }
  if (!(await consumeDownload('watersheds', river.country))) return
  setDownloading(river.id)
  window.open(river.download_url, '_blank')
  setTimeout(() => setDownloading(null), 1000)
}

  const filtered = searchQuery
    ? layers.filter(l => l.country.toLowerCase().includes(searchQuery.toLowerCase()))
    : layers

  if (loading) return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-700 rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading watershed basins…</p>
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <p className="text-red-700 text-sm">{error}</p>
    </div>
  )

  if (layers.length === 0) return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-6 text-center text-sm text-gray-500">
      HydroBASINS watershed data is being processed — check back soon.
    </div>
  )

  return (
    <div>
      {/* Metadata banner */}
      <div className="bg-teal-50 rounded-xl p-4 mb-5 text-xs text-gray-600 grid grid-cols-3 gap-3">
        <div><span className="block text-gray-400 mb-0.5">Source</span><span className="font-semibold text-navy">WWF / HydroSHEDS</span></div>
        <div><span className="block text-gray-400 mb-0.5">Level</span><span className="font-semibold text-navy">6 (~2,000–10,000 km²)</span></div>
        <div><span className="block text-gray-400 mb-0.5">CRS</span><span className="font-semibold text-navy">EPSG:4326</span></div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by country…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 placeholder:text-gray-400"
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
            className="bg-white border border-gray-100 hover:border-teal-200 hover:shadow-sm transition-all rounded-xl p-4 flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Map size={15} className="text-teal-600" />
                <span className="font-semibold text-navy text-sm">{layer.country}</span>
              </div>
              <p className="text-[11px] text-gray-400">
                {layer.file_size_mb} MB · HydroBASINS Level 6
              </p>
            </div>
            <button
              onClick={() => handleDownload(layer)}
              disabled={downloading === layer.id}
              className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-colors ${
                !hasAccess
                  ? 'bg-accent/15 text-amber-800 hover:bg-accent/30'
                  : downloading === layer.id
                    ? 'bg-green-100 text-green-700'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
              }`}
            >
              {!hasAccess ? '🔒 Upgrade to download' : downloading === layer.id ? '✓ Downloading…' : <><Download size={13} />Download .gpkg</>}
            </button>
          </motion.div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-4 justify-center text-[11px] text-gray-400">
        <span>{layers.length} countries</span>
        <span>·</span>
        <span>HydroBASINS v1c · HydroSHEDS</span>
      </div>
    </div>
  )
}
