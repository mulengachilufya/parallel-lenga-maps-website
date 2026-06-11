'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, Layers } from 'lucide-react'
import type { SoilLayer } from '@/app/api/soil/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

interface SoilListProps {
  userPlan?:  string
  hasAccess?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function SoilList({ userPlan = 'starter' }: SoilListProps) {
  const { openGate, checkAccess, consumeDownload } = useDownloadGate()
  // Live access from the gate. The old `hasAccess` PROP defaulted to false
  // and the dashboard never passed it, so the button read "locked" for
  // everyone, including trial and Max/Enterprise users. Derive from checkAccess.
  const hasAccess = checkAccess('soil')
  const [layers,      setLayers]      = useState<SoilLayer[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/soil')
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

  const handleDownload = async (layer: SoilLayer) => {
  if (!checkAccess('soil')) { openGate('soil'); return }
  if (!layer.download_url) { openGate('soil'); return }
  if (!(await consumeDownload('soil', layer.country))) return
  setDownloading(layer.id)
  window.open(layer.download_url, '_blank')
  setTimeout(() => setDownloading(null), 1000)
}

  const filtered = searchQuery
    ? layers.filter(l => l.country.toLowerCase().includes(searchQuery.toLowerCase()))
    : layers

  if (loading) return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="w-8 h-8 border-3 border-amber-200 border-t-amber-700 rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading soil classification…</p>
    </div>
  )
  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center"><p className="text-red-700 text-sm">{error}</p></div>
  if (layers.length === 0) return <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-sm text-gray-500">Soil data is being processed — check back soon.</div>

  return (
    <div>
      <div className="bg-amber-50 rounded-xl p-4 mb-5 text-xs text-gray-600 grid grid-cols-3 gap-3">
        <div><span className="block text-gray-400 mb-0.5">Source</span><span className="font-semibold text-navy">ISRIC SoilGrids v2.0</span></div>
        <div><span className="block text-gray-400 mb-0.5">Classification</span><span className="font-semibold text-navy">WRB Most-Probable</span></div>
        <div><span className="block text-gray-400 mb-0.5">Resolution</span><span className="font-semibold text-navy">250 m</span></div>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-700">
        GeoTIFFs include an embedded colormap for the WRB Reference Soil Groups. Open in QGIS/ArcGIS and click any pixel to see the soil class name — no lookup table needed.
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search by country…" value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-gray-400" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{filtered.length} of {layers.length}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((layer, idx) => (
          <motion.div key={layer.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.02, 0.3) }}
            className="bg-white border border-gray-100 hover:border-amber-200 hover:shadow-sm transition-all rounded-xl p-4 flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Layers size={15} className="text-amber-600" />
                <span className="font-semibold text-navy text-sm">{layer.country}</span>
              </div>
              <p className="text-[11px] text-gray-400">{layer.resolution_m}m WRB classification · {layer.file_size_mb} MB GeoTIFF</p>
            </div>
            <button onClick={() => handleDownload(layer)} disabled={downloading === layer.id}
              className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-colors ${
                !hasAccess ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                : downloading === layer.id ? 'bg-green-100 text-green-700'
                : 'bg-amber-600 hover:bg-amber-700 text-white'}`}>
              {!hasAccess ? '🔒 Max plan required'
                : downloading === layer.id ? '✓ Downloading…'
                : <><Download size={13} />Download .tif</>}
            </button>
          </motion.div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-4 justify-center text-[11px] text-gray-400">
        <span>{layers.length} countries</span><span>·</span>
        <span>SoilGrids v2.0 · CC BY 4.0 · ISRIC</span>
      </div>
    </div>
  )
}
