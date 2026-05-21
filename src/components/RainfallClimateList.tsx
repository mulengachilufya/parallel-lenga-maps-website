'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, CloudRain, Thermometer, AlertTriangle } from 'lucide-react'
import type { RainfallClimateLayer } from '@/app/api/rainfall-climate/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

// ─── Per-type styling ───────────────────────────────────────────────────────

const TYPE_META: Record<
  string,
  { label: string; badge: string; icon: React.ReactNode; accent: string; btnColor: string }
> = {
  rainfall: {
    label: 'Rainfall',
    badge: 'bg-blue-100 text-blue-800',
    icon: <CloudRain size={15} className="text-blue-600" />,
    accent: 'bg-blue-50',
    btnColor: 'bg-blue-600 hover:bg-blue-700',
  },
  temperature: {
    label: 'Temperature',
    badge: 'bg-red-100 text-red-800',
    icon: <Thermometer size={15} className="text-red-500" />,
    accent: 'bg-red-50',
    btnColor: 'bg-red-600 hover:bg-red-700',
  },
  drought_index: {
    label: 'Drought Index',
    badge: 'bg-orange-100 text-orange-800',
    icon: <AlertTriangle size={15} className="text-orange-500" />,
    accent: 'bg-orange-50',
    btnColor: 'bg-orange-600 hover:bg-orange-700',
  },
}

// ─── GIS metadata per type ──────────────────────────────────────────────────

const GIS_META: Record<string, { source: string; units: string; resolution: string }> = {
  rainfall: {
    source: 'CHIRPS v2.0',
    units: 'mm/year',
    resolution: '0.05° (~5 km)',
  },
  temperature: {
    source: 'WorldClim v2.1',
    units: '°C (mean)',
    resolution: '2.5 arc-min (~5 km)',
  },
  drought_index: {
    source: 'CHIRPS-derived SPI',
    units: 'dimensionless (SPI-12)',
    resolution: '0.05° (~5 km)',
  },
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface RainfallClimateListProps {
  userPlan?: 'basic' | 'pro' | 'max'
  /** When set, fetches and displays ONLY this layer type */
  layerType?: 'rainfall' | 'temperature' | 'drought_index'
  /** UI hint only — Download click still routes through DownloadGate. */
  hasAccess?: boolean
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RainfallClimateList({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userPlan = 'basic',
  layerType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasAccess = false,
}: RainfallClimateListProps) {
  const { guardDownload } = useDownloadGate()
  const [layers, setLayers]             = useState<RainfallClimateLayer[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [downloading, setDownloading]   = useState<number | null>(null)
  const [searchQuery, setSearchQuery]   = useState('')

  const meta = layerType ? TYPE_META[layerType] : null
  const gisMeta = layerType ? GIS_META[layerType] : null

  useEffect(() => {
    const fetchLayers = async () => {
      try {
        setLoading(true)
        setError(null)
        const qs = new URLSearchParams({ includeUrl: 'true' })
        if (layerType) qs.set('layerType', layerType)
        const res = await fetch(`/api/rainfall-climate?${qs}`)
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
  }, [layerType])

  // ALWAYS route the click through the gate. Required tier depends on
  // layer_type (4/8/12+ model):
  //   rainfall, temperature → basic
  //   drought_index         → pro
  const handleDownload = (layer: RainfallClimateLayer) => {
    const tier = layer.layer_type === 'drought_index' ? 'pro' : 'basic'
    guardDownload(tier, () => {
      if (!layer.download_url) return
      setDownloading(layer.id)
      window.open(layer.download_url, '_blank')
      setTimeout(() => setDownloading(null), 1000)
    })
  }

  const filtered = searchQuery
    ? layers.filter((l) => l.country.toLowerCase().includes(searchQuery.toLowerCase()))
    : layers

  return (
    <div className="space-y-5">

      {/* ── Search ───────────────────────────────────────────────────────── */}
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

      {/* ── GIS info strip ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
        <span className="bg-gray-100 rounded-full px-3 py-1">CRS: EPSG:4326 (WGS 84)</span>
        <span className="bg-gray-100 rounded-full px-3 py-1">Format: GeoTIFF (ZIP)</span>
        <span className="bg-gray-100 rounded-full px-3 py-1">NoData: −9999</span>
        {gisMeta && (
          <>
            <span className="bg-gray-100 rounded-full px-3 py-1">Source: {gisMeta.source}</span>
            <span className="bg-gray-100 rounded-full px-3 py-1">Units: {gisMeta.units}</span>
            <span className="bg-gray-100 rounded-full px-3 py-1">Resolution: {gisMeta.resolution}</span>
          </>
        )}
      </div>

      {/* ── States ───────────────────────────────────────────────────────── */}
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

      {/* ── Country list ─────────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((layer, i) => {
            const rowMeta = TYPE_META[layer.layer_type] || meta
            return (
              <motion.div
                key={layer.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.35) }}
                className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg ${rowMeta?.accent || 'bg-gray-50'} flex items-center justify-center flex-shrink-0`}>
                    {rowMeta?.icon}
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-navy text-sm">{layer.country}</span>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      <span className="text-xs text-gray-400">
                        {layer.year_start}–{layer.year_end}
                      </span>
                      <span className="text-xs text-gray-400">
                        {layer.file_size_mb.toFixed(1)} MB
                      </span>
                    </div>
                  </div>
                </div>

                <motion.button
                  onClick={() => handleDownload(layer)}
                  disabled={!layer.download_url || downloading === layer.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition ${
                    downloading === layer.id
                      ? 'bg-gray-300 text-gray-500 cursor-wait'
                      : rowMeta?.btnColor || 'bg-primary hover:bg-blue-800'
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
            )
          })}

          <p className="text-xs text-gray-400 pt-1">
            {filtered.length} file{filtered.length !== 1 ? 's' : ''} shown
          </p>
        </div>
      )}

      {userPlan === 'basic' && (
        <p className="text-xs text-gray-400 mt-2">
          * Upgrade to Pro to unlock all 54 countries and full download access.
        </p>
      )}
    </div>
  )
}
