'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, Layers } from 'lucide-react'
import type { LulcLayer } from '@/app/api/lulc/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

interface LulcListProps {
  userPlan?: 'basic' | 'pro'
}

// ESA WorldCover class descriptions shown in the info banner
const LULC_CLASSES = [
  { value: 10,  label: 'Tree cover',           color: '#006400' },
  { value: 20,  label: 'Shrubland',            color: '#FFBB22' },
  { value: 30,  label: 'Grassland',            color: '#FFFF4C' },
  { value: 40,  label: 'Cropland',             color: '#F096FF' },
  { value: 50,  label: 'Built-up',             color: '#FA0000' },
  { value: 60,  label: 'Bare / sparse veg.',   color: '#B4B4B4' },
  { value: 80,  label: 'Permanent water',      color: '#0064C8' },
  { value: 90,  label: 'Herbaceous wetland',   color: '#0096A0' },
  { value: 95,  label: 'Mangroves',            color: '#00CF75' },
  { value: 100, label: 'Moss / lichen',        color: '#FAE6A0' },
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function LulcList({ userPlan = 'basic' }: LulcListProps) {
  const { guardDownload } = useDownloadGate()
  const [layers, setLayers]           = useState<LulcLayer[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchLayers = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/lulc')
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const data = await res.json()
        setLayers(data.layers || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch LULC data')
      } finally {
        setLoading(false)
      }
    }
    fetchLayers()
  }, [])

  const handleDownload = (layer: LulcLayer) => {
    if (!layer.download_url) return
    guardDownload('basic', () => {
      setDownloading(layer.id)
      const link = document.createElement('a')
      link.href = layer.download_url!
      link.download = layer.r2_key.split('/').pop() || 'lulc.tif'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => setDownloading(null), 2000)
    })
  }

  const filtered = layers.filter(
    (l) => l.country.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="w-8 h-8 border-3 border-green-200 border-t-green-700 rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Loading LULC data…</p>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700 text-sm font-medium">{error}</p>
      </div>
    )
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (layers.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center text-sm text-gray-500">
        LULC data is being processed — check back soon.
      </div>
    )
  }

  const totalSizeMb = layers.reduce((s, l) => s + (l.file_size_mb || 0), 0)

  return (
    <div>
      {/* GIS metadata banner */}
      <div className="bg-green-50 rounded-xl p-4 mb-5 text-xs text-gray-600 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <span className="block text-gray-400 mb-0.5">Source</span>
          <span className="font-semibold text-navy">ESA WorldCover 2021 v200</span>
        </div>
        <div>
          <span className="block text-gray-400 mb-0.5">Format</span>
          <span className="font-semibold text-navy">GeoTIFF (uint8, LZW)</span>
        </div>
        <div>
          <span className="block text-gray-400 mb-0.5">Resolution</span>
          <span className="font-semibold text-navy">10 m</span>
        </div>
        <div>
          <span className="block text-gray-400 mb-0.5">CRS</span>
          <span className="font-semibold text-navy">EPSG:4326</span>
        </div>
      </div>

      {/* Class legend */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={13} className="text-green-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-green-700">Land Cover Classes (uint8 pixel values)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {LULC_CLASSES.map((cls) => (
            <span
              key={cls.value}
              className="flex items-center gap-1.5 text-[10px] font-medium bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: cls.color }}
              />
              <span className="text-gray-500">{cls.value}</span>
              <span className="text-navy">{cls.label}</span>
            </span>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2.5">
          Pixel value 255 = NoData. Open in QGIS and apply a paletted/unique values renderer for instant visualization.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by country name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400
                     placeholder:text-gray-400"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          {filtered.length} of {layers.length}
        </span>
      </div>

      {/* Country grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((layer, idx) => {
          const isDownloading = downloading === layer.id

          return (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              className="bg-white border border-gray-100 hover:border-green-200 hover:shadow-sm
                         rounded-xl p-4 flex flex-col justify-between gap-3 transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🌿</span>
                    <span className="font-semibold text-navy text-sm">{layer.country}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">
                    {layer.file_size_mb ? `${layer.file_size_mb.toFixed(1)} MB` : '—'}
                  </span>
                </div>
                <div className="flex gap-3 text-[11px] text-gray-400">
                  <span>GeoTIFF · 10 m · EPSG:4326</span>
                </div>
              </div>

              <button
                onClick={() => handleDownload(layer)}
                disabled={isDownloading || !layer.download_url}
                className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-colors
                           ${isDownloading
                             ? 'bg-green-100 text-green-700'
                             : 'bg-green-600 hover:bg-green-700 text-white'}`}
              >
                {isDownloading ? (
                  <>✓ Downloading…</>
                ) : (
                  <>
                    <Download size={13} />
                    Download .tif
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
        <span>{totalSizeMb.toFixed(0)} MB total</span>
        <span>·</span>
        <span>ESA WorldCover 2021 v200 · CC BY 4.0</span>
      </div>
    </div>
  )
}
