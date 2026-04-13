'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, CloudRain, Thermometer, AlertTriangle } from 'lucide-react'
import type { RainfallClimateLayer } from '@/app/api/rainfall-climate/route'

// ─── Label / colour maps ────────────────────────────────────────────────────

const TYPE_META: Record<
  RainfallClimateLayer['layer_type'],
  { label: string; badge: string; icon: React.ReactNode; accent: string }
> = {
  rainfall: {
    label: 'Rainfall',
    badge: 'bg-blue-100 text-blue-800',
    icon: <CloudRain size={15} className="text-blue-600" />,
    accent: 'bg-blue-50',
  },
  temperature: {
    label: 'Temperature',
    badge: 'bg-red-100 text-red-800',
    icon: <Thermometer size={15} className="text-red-500" />,
    accent: 'bg-red-50',
  },
  drought_index: {
    label: 'Drought Index',
    badge: 'bg-orange-100 text-orange-800',
    icon: <AlertTriangle size={15} className="text-orange-500" />,
    accent: 'bg-orange-50',
  },
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface RainfallClimateListProps {
  userPlan?: 'basic' | 'pro'
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RainfallClimateList({ userPlan = 'basic' }: RainfallClimateListProps) {
  const [layers, setLayers]       = useState<RainfallClimateLayer[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter]   = useState<string>('')

  useEffect(() => {
    const fetchLayers = async () => {
      try {
        setLoading(true)
        setError(null)
        const qs = new URLSearchParams({ includeUrl: 'true' })
        if (typeFilter) qs.set('layerType', typeFilter)
        const res = await fetch(`/api/rainfall-climate?${qs}`)
        if (!res.ok) throw new Error('Failed to fetch rainfall/climate layers')
        const { layers: data } = await res.json()
        setLayers(data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchLayers()
  }, [typeFilter])

  const handleDownload = (layer: RainfallClimateLayer) => {
    if (!layer.download_url) return
    setDownloading(layer.id)
    window.open(layer.download_url, '_blank')
    setTimeout(() => setDownloading(null), 1000)
  }

  // Client-side country search on top of server-side type filter
  const filtered = searchQuery
    ? layers.filter((l) => l.country.toLowerCase().includes(searchQuery.toLowerCase()))
    : layers

  // Group by layer_type for cleaner display
  const grouped = filtered.reduce<Record<string, RainfallClimateLayer[]>>((acc, l) => {
    acc[l.layer_type] = acc[l.layer_type] ?? []
    acc[l.layer_type].push(l)
    return acc
  }, {})

  const typeOrder: RainfallClimateLayer['layer_type'][] = ['rainfall', 'temperature', 'drought_index']

  return (
    <div className="space-y-5">

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Country search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search countries…"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 transition"
          />
        </div>

        {/* Layer type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
        >
          <option value="">All types</option>
          <option value="rainfall">Rainfall</option>
          <option value="temperature">Temperature</option>
          <option value="drought_index">Drought Index</option>
        </select>
      </div>

      {/* ── GIS info strip ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
        <span className="bg-gray-100 rounded-full px-3 py-1">CRS: EPSG:4326 (WGS 84)</span>
        <span className="bg-gray-100 rounded-full px-3 py-1">Format: GeoTIFF (ZIP)</span>
        <span className="bg-gray-100 rounded-full px-3 py-1">NoData: −9999</span>
        <span className="bg-gray-100 rounded-full px-3 py-1">Resolution: 0.05° (~5 km)</span>
      </div>

      {/* ── Source & units legend ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <p className="font-semibold text-blue-800 mb-0.5">Rainfall</p>
          <p className="text-blue-600">Source: CHIRPS v2.0</p>
          <p className="text-blue-600">Units: mm/year or mm/month</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p className="font-semibold text-red-800 mb-0.5">Temperature</p>
          <p className="text-red-600">Source: WorldClim v2.1</p>
          <p className="text-red-600">Units: °C (mean / min / max)</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
          <p className="font-semibold text-orange-800 mb-0.5">Drought Index</p>
          <p className="text-orange-600">Source: CHIRPS-derived SPI</p>
          <p className="text-orange-600">Units: dimensionless (SPI-12)</p>
        </div>
      </div>

      {/* ── States ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/30 border-t-primary" />
          <span className="ml-3 text-gray-500 text-sm">Loading climate data…</span>
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
            : 'No rainfall/climate layers available yet.'}
        </div>
      )}

      {/* ── Grouped layers ───────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-6">
          {typeOrder.map((type) => {
            const group = grouped[type]
            if (!group?.length) return null
            const meta = TYPE_META[type]
            return (
              <div key={type}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-lg ${meta.accent} flex items-center justify-center`}>
                    {meta.icon}
                  </div>
                  <h3 className="text-sm font-bold text-navy">{meta.label}</h3>
                  <span className="text-xs text-gray-400">{group.length} file{group.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="space-y-2">
                  {group.map((layer, i) => (
                    <motion.div
                      key={layer.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.35) }}
                      className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors gap-4"
                    >
                      {/* Left: country + metadata */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg ${meta.accent} flex items-center justify-center flex-shrink-0`}>
                          {meta.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-navy text-sm">{layer.country}</span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${meta.badge}`}>
                              {layer.variable_name}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            <span className="text-xs text-gray-400">
                              {layer.year_start}–{layer.year_end}
                            </span>
                            <span className="text-xs text-gray-400">
                              {layer.units}
                            </span>
                            <span className="text-xs text-gray-400">
                              {layer.resolution}
                            </span>
                            <span className="text-xs text-gray-400">
                              {layer.file_size_mb.toFixed(1)} MB
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: download button */}
                      <motion.button
                        onClick={() => handleDownload(layer)}
                        disabled={!layer.download_url || downloading === layer.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          downloading === layer.id
                            ? 'bg-gray-300 text-gray-500 cursor-wait'
                            : 'bg-primary text-white hover:bg-blue-800'
                        }`}
                      >
                        {downloading === layer.id ? (
                          <>
                            <span className="animate-spin inline-block w-3 h-3 border-2 border-t-transparent border-white rounded-full" />
                            Wait…
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
                </div>
              </div>
            )
          })}

          <p className="text-xs text-gray-400 pt-1">
            {filtered.length} file{filtered.length !== 1 ? 's' : ''} shown
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
