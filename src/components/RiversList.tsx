'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { HydrologyLayer } from '@/app/api/hydrology/route'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

interface RiversListProps {
  userPlan?: 'basic' | 'pro' | 'max'
  /** UI hint only — Download click still routes through DownloadGate. */
  hasAccess?: boolean
}

export default function RiversList({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userPlan = 'basic',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasAccess = false,
}: RiversListProps) {
  const { guardDownload } = useDownloadGate()
  const [rivers, setRivers]           = useState<HydrologyLayer[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [filterCountry, setFilterCountry] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const params = new URLSearchParams({ layerType: 'rivers', includeUrl: 'true' })
        if (filterCountry) params.set('country', filterCountry)
        const res = await fetch(`/api/hydrology?${params}`)
        if (!res.ok) throw new Error('Failed to fetch river data')
        const { layers } = await res.json()
        setRivers(layers ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filterCountry])

  // ALWAYS route the click through the gate. Missing download_url means
  // the server didn't sign one for this caller (anon / no plan / wrong
  // tier) — guardDownload's modal is exactly what should happen then.
  const handleDownload = (river: HydrologyLayer) => {
    guardDownload('basic', () => {
      if (!river.download_url) return
      setDownloading(river.id)
      window.open(river.download_url, '_blank')
      setTimeout(() => setDownloading(null), 1000)
    })
  }

  const allCountries = Array.from(new Set(rivers.map(r => r.country))).sort()

  return (
    <div className="space-y-6">
      {/* Country filter */}
      <div className="max-w-xs">
        <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Country</label>
        <select
          value={filterCountry}
          onChange={e => setFilterCountry(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">All Countries ({allCountries.length})</option>
          {allCountries.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-12 justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          <span className="text-gray-500">Loading river data...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          ❌ {error}
        </div>
      )}

      {!loading && !error && rivers.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          ⚠️ No river files found for the selected country.
        </div>
      )}

      {!loading && rivers.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Country</th>
                  <th className="text-left px-4 py-3 font-semibold">Format</th>
                  <th className="text-left px-4 py-3 font-semibold">Source</th>
                  <th className="text-right px-4 py-3 font-semibold">Size (MB)</th>
                  <th className="text-center px-4 py-3 font-semibold">Download</th>
                </tr>
              </thead>
              <tbody>
                {rivers.map((river, i) => (
                  <motion.tr
                    key={river.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.012, 0.35) }}
                    className="border-b border-gray-200 hover:bg-gray-50 transition"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{river.country}</td>
                    <td className="px-4 py-3 text-gray-600">{river.file_format}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{river.source}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{river.file_size_mb.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <motion.button
                        onClick={() => handleDownload(river)}
                        disabled={!river.download_url || downloading === river.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                          downloading === river.id
                            ? 'bg-gray-400 text-white cursor-wait'
                            : !river.download_url
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-[#0ea5e9] text-white hover:bg-[#0284c7]'
                        }`}
                      >
                        {downloading === river.id ? (
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
          </div>

          <div className="text-sm text-gray-500">
            Showing {rivers.length} countr{rivers.length !== 1 ? 'ies' : 'y'}
          </div>
        </>
      )}

      {userPlan === 'basic' && (
        <p className="text-xs text-gray-400 mt-2">
          * Upgrade to Pro to unlock all 50 countries and unlimited downloads.
        </p>
      )}
    </div>
  )
}
