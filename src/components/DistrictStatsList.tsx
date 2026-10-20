'use client'

/**
 * Dashboard list for the district-statistics datasets (crop-production,
 * forest-loss, soil-fertility): one card per country GeoPackage, with the
 * same download gate and download counting as every other dataset, and the
 * source credits the CC BY 4.0 licences require.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, Map as MapIcon, Info } from 'lucide-react'
import type { DistrictStatsLayer } from '@/lib/district-stats'
import type { DatasetSlug } from '@/lib/pricing'
import { useDownloadGate } from '@/contexts/DownloadGateContext'
import { DISTRICT_STATS, GEOBOUNDARIES_CREDIT } from './district-stats-config'

export default function DistrictStatsList({ dataset }: { dataset: DatasetSlug }) {
  const cfg = DISTRICT_STATS[dataset]!
  const { openGate, checkAccess, consumeDownload, notifyUnavailable } = useDownloadGate()
  const [layers,      setLayers]      = useState<DistrictStatsLayer[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const res = await fetch(cfg.api)
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const data = await res.json()
        setLayers(data.layers || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to fetch ${cfg.noun}`)
      } finally {
        setLoading(false)
      }
    })()
  }, [cfg.api, cfg.noun])

  // Always go through the gate: without access it opens the upgrade modal.
  const handleDownload = async (layer: DistrictStatsLayer) => {
    if (!checkAccess(dataset)) { openGate(dataset); return }
    if (!layer.download_url) { notifyUnavailable(dataset); return }
    if (!(await consumeDownload(dataset, layer.country))) return
    setDownloading(layer.id)
    const link = document.createElement('a')
    link.href     = layer.download_url
    link.download = layer.r2_key.split('/').pop() || `${dataset}.gpkg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => setDownloading(null), 2000)
  }

  const filtered = layers.filter(
    (l) => l.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
           l.iso3.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const credits = (
    <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4 text-[11px] leading-relaxed text-gray-500">
      <p className="mb-1.5 font-semibold text-navy">Sources and credits</p>
      <ul className="space-y-1">
        {[...cfg.credits, GEOBOUNDARIES_CREDIT].map((c) => (
          <li key={c.name}>
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-medium text-navy hover:underline">{c.name}</a>
            {' '}· {c.by} ·{' '}
            <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.licence}</a>
          </li>
        ))}
      </ul>
      <p className="mt-1.5">Each file carries the full citation, licence and the unit of every column in its metadata. District outline licences vary by country and are shown on each card.</p>
    </div>
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="w-8 h-8 border-3 border-gray-200 border-t-navy rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Loading {cfg.noun}…</p>
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
      <div>
        <div className={`${cfg.tone.banner} border rounded-xl p-6 text-center text-sm text-gray-500`}>
          {cfg.noun[0].toUpperCase() + cfg.noun.slice(1)} is being processed. Check back soon.
        </div>
        {credits}
      </div>
    )
  }

  const totalDistricts = layers.reduce((s, l) => s + (l.district_count || 0), 0)
  const locked = !checkAccess(dataset)

  return (
    <div>
      <div className={`${cfg.tone.banner} rounded-xl p-4 mb-3 text-xs text-gray-600 grid grid-cols-3 gap-3`}>
        <div>
          <span className="block text-gray-400 mb-0.5">Source</span>
          <span className="font-semibold text-navy">{cfg.source}</span>
        </div>
        <div>
          <span className="block text-gray-400 mb-0.5">Unit</span>
          <span className="font-semibold text-navy">District (ADM2)</span>
        </div>
        <div>
          <span className="block text-gray-400 mb-0.5">Format · CRS</span>
          <span className="font-semibold text-navy">GeoPackage · EPSG:4326</span>
        </div>
      </div>
      {cfg.note && (
        <p className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Info size={14} className="mt-0.5 shrink-0" /> {cfg.note}
        </p>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by country or ISO-3…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 ${cfg.tone.ring} placeholder:text-gray-400`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          {filtered.length} of {layers.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((layer, idx) => {
          const isDownloading = downloading === layer.id
          return (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              className={`bg-white border border-gray-100 ${cfg.tone.hover} hover:shadow-sm transition-all rounded-xl p-4 flex flex-col justify-between gap-3`}
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapIcon size={15} className={cfg.tone.icon} />
                  <span className="font-semibold text-navy text-sm">{layer.country}</span>
                </div>
                <div className="flex flex-col gap-0.5 text-[11px] text-gray-500">
                  <span>
                    {layer.district_count?.toLocaleString() ?? '–'} {layer.admin_level === 1 ? 'regions (ADM1)' : 'districts'}
                    {' '}· {Number(layer.file_size_mb).toFixed(1)} MB
                  </span>
                  {cfg.facts(layer).map((f) => <span key={f}>{f}</span>)}
                  {layer.boundary_license && (
                    <span className="text-gray-400 truncate" title={`District outlines: ${layer.boundary_license}`}>
                      Outlines: {layer.boundary_license}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleDownload(layer)}
                disabled={isDownloading}
                className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-colors
                           ${locked
                             ? 'bg-accent/15 text-amber-800 hover:bg-accent/30'
                             : isDownloading
                               ? 'bg-green-100 text-green-700'
                               : cfg.tone.button}`}
              >
                {locked ? <>🔒 Unlock to download</>
                  : isDownloading ? <>✓ Downloading…</>
                  : <><Download size={13} /> Download .gpkg</>}
              </button>
            </motion.div>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-4 justify-center text-[11px] text-gray-400">
        <span>{layers.length} countries</span>
        <span>·</span>
        <span>{totalDistricts.toLocaleString()} districts</span>
        <span>·</span>
        <span>{cfg.source}</span>
      </div>
      {credits}
    </div>
  )
}
