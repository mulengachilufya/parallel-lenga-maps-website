'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { HydrologyLayer } from '@/app/api/hydrology/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

const LAYER_LABELS: Record<string, string> = {
  rivers: 'Rivers',
  lakes:  'Lakes',
}

const LAYER_COLORS: Record<string, string> = {
  rivers: 'bg-blue-100 text-blue-800',
  lakes:  'bg-cyan-100 text-cyan-800',
}

interface HydrologyListProps {
  userPlan?: 'basic' | 'pro' | 'max'
  /** Pin this list to a specific layer type. Pre-set when invoked from a
   *  dashboard section (e.g. the 'lakes' section pins layerType="lakes"). */
  layerType?: 'rivers' | 'lakes'
  /** Pre-computed by the dashboard: does the caller have an active plan
   *  that unlocks this section's tier? Cosmetic — clicking a Download
   *  button still routes through DownloadGate. */
  hasAccess?: boolean
}

export default function HydrologyList({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userPlan = 'basic',
  layerType: pinnedLayerType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasAccess = false,
}: HydrologyListProps) {
  const { guardDownload } = useDownloadGate()
  const [layers, setLayers]         = useState<HydrologyLayer[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [filterCountry, setFilterCountry] = useState('')
  const [filterType, setFilterType] = useState(pinnedLayerType ?? '')

  useEffect(() => {
    const fetch_ = async () => {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams()
        if (filterCountry) params.set('country', filterCountry)
        // If the parent pinned a layerType, that always wins over the local
        // dropdown — prevents Lakes section from accidentally returning rivers.
        const lt = pinnedLayerType ?? filterType
        if (lt) params.set('layerType', lt)
        params.set('includeUrl', 'true')

        const res = await fetch(`/api/hydrology?${params}`)
        if (!res.ok) throw new Error('Failed to fetch hydrology layers')

        const { layers: data } = await res.json()
        setLayers(data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    fetch_()
  }, [filterCountry, filterType, pinnedLayerType])

  // ALWAYS go through guardDownload — even when download_url is missing.
  // Tier required depends on layer_type: rivers=basic, lakes=pro.
  const handleDownload = (layer: HydrologyLayer) => {
    const tier = layer.layer_type === 'lakes' ? 'pro' : 'basic'
    guardDownload(tier, () => {
      if (!layer.download_url) return
      setDownloading(layer.id)
      window.open(layer.download_url, '_blank')
      setTimeout(() => setDownloading(null), 1000)
    })
  }

  const uniqueCountries = Array.from(new Set(layers.map(l => l.country))).sort()

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Country</label>
          <select
            value={filterCountry}
            onChange={e => setFilterCountry(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Countries</option>
            {uniqueCountries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Layer Type</label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Rivers &amp; Lakes</option>
            <option value="rivers">Rivers only</option>
            <option value="lakes">Lakes only</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600">Loading hydrology layers...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          ❌ {error}
        </div>
      )}

      {!loading && layers.length === 0 && !error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          ⚠️ No hydrology layers found. Try adjusting your filters.
        </div>
      )}

      {!loading && layers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-300">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Country</th>
                <th className="text-left px-4 py-3 font-semibold">Layer</th>
                <th className="text-left px-4 py-3 font-semibold">Format</th>
                <th className="text-left px-4 py-3 font-semibold">Source</th>
                <th className="text-right px-4 py-3 font-semibold">Size (MB)</th>
                <th className="text-center px-4 py-3 font-semibold">Download</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((layer, i) => (
                <motion.tr
                  key={layer.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.4) }}
                  className="border-b border-gray-200 hover:bg-gray-50 transition"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{layer.country}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${LAYER_COLORS[layer.layer_type] ?? 'bg-gray-100 text-gray-700'}`}>
                      {LAYER_LABELS[layer.layer_type] ?? layer.layer_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{layer.file_format}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{layer.source}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{layer.file_size_mb.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <motion.button
                      onClick={() => handleDownload(layer)}
                      disabled={!layer.download_url || downloading === layer.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                        downloading === layer.id
                          ? 'bg-gray-400 text-white cursor-wait'
                          : !layer.download_url
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-[#0ea5e9] text-white hover:bg-[#0284c7]'
                      }`}
                    >
                      {downloading === layer.id ? (
                        <>
                          <span className="animate-spin inline-block w-3 h-3 border-2 border-t-transparent border-white rounded-full" />
                          Downloading...
                        </>
                      ) : (
                        <>⬇️ Download</>
                      )}
                    </motion.button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 text-sm text-gray-500">
            Showing {layers.length} layer{layers.length !== 1 ? 's' : ''}
            {' '}- {layers.filter(l => l.layer_type === 'rivers').length} river files,{' '}
            {layers.filter(l => l.layer_type === 'lakes').length} lake files
          </div>
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
