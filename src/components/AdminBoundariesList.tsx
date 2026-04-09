'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { AdminBoundary } from '@/app/api/admin-boundaries/route'

const ADMIN_LEVEL_LABELS: Record<number, string> = {
  0: 'Country Outline',
  1: 'Provinces/Regions',
  2: 'Districts/Counties',
  3: 'Local Areas',
}

interface AdminBoundariesListProps {
  userPlan?: 'basic' | 'pro'
}

export default function AdminBoundariesList({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userPlan = 'basic',
}: AdminBoundariesListProps) {
  const [boundaries, setBoundaries] = useState<AdminBoundary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [filterCountry, setFilterCountry] = useState('')
  const [filterAdminLevel, setFilterAdminLevel] = useState<string>('')

  // Fetch boundaries on mount and when filters change
  useEffect(() => {
    const fetchBoundaries = async () => {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams()
        if (filterCountry) params.set('country', filterCountry)
        if (filterAdminLevel) params.set('adminLevel', filterAdminLevel)
        params.set('includeUrl', 'true')

        const res = await fetch(`/api/admin-boundaries?${params.toString()}`)
        if (!res.ok) {
          throw new Error('Failed to fetch boundaries')
        }

        const { boundaries: data } = await res.json()
        setBoundaries(data || [])
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load boundaries'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchBoundaries()
  }, [filterCountry, filterAdminLevel])

  const handleDownload = async (boundary: AdminBoundary) => {
    if (!boundary.download_url) return

    try {
      setDownloading(boundary.id)
      // Open download URL in new tab
      window.open(boundary.download_url, '_blank')
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setDownloading(boundary.id)
      // Reset after 1 second
      setTimeout(() => setDownloading(null), 1000)
    }
  }

  const uniqueCountries = Array.from(
    new Set(boundaries.map((b) => b.country))
  ).sort()

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Country
          </label>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Countries</option>
            {uniqueCountries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Admin Level
          </label>
          <select
            value={filterAdminLevel}
            onChange={(e) => setFilterAdminLevel(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Levels</option>
            {[0, 1, 2, 3].map((level) => (
              <option key={level} value={level}>
                {ADMIN_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading boundaries...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          ❌ {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && boundaries.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          ⚠️ No admin boundaries found. Try adjusting your filters.
        </div>
      )}

      {/* Boundaries table */}
      {!loading && boundaries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-300">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Country</th>
                <th className="text-left px-4 py-3 font-semibold">Admin Level</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-right px-4 py-3 font-semibold">Size (MB)</th>
                <th className="text-center px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {boundaries.map((boundary, index) => (
                <motion.tr
                  key={boundary.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.5) }}
                  className="border-b border-gray-200 hover:bg-gray-50 transition"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {boundary.country}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {ADMIN_LEVEL_LABELS[boundary.admin_level] ||
                        `Level ${boundary.admin_level}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {boundary.geom_type}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {boundary.file_size_mb.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <motion.button
                      onClick={() => handleDownload(boundary)}
                      disabled={downloading === boundary.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`inline-flex items-center px-3 py-2 rounded-lg font-medium transition ${
                        downloading === boundary.id
                          ? 'bg-gray-400 text-white cursor-wait'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {downloading === boundary.id ? (
                        <>
                          <span className="animate-spin inline-block w-4 h-4 mr-2 border-2 border-t-transparent border-white rounded-full"></span>
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

          {/* Summary */}
          <div className="mt-4 text-sm text-gray-600">
            Showing {boundaries.length} admin boundaries
          </div>
        </div>
      )}
    </div>
  )
}
