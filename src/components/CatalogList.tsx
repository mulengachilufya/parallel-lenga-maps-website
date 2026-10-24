'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Search, Layers } from 'lucide-react'
import type { CatalogFile } from '@/app/api/catalog/[slug]/route'
import { CATALOG } from '@/lib/catalog'
import type { DatasetSlug } from '@/lib/pricing'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

/** Per-country files of a catalog_files dataset, grouped by country. */
export default function CatalogList({ slug, hideWhenEmpty = false }: { slug: DatasetSlug; hideWhenEmpty?: boolean }) {
  const { openGate, checkAccess, consumeDownload, notifyUnavailable } = useDownloadGate()
  const hasAccess = checkAccess(slug)
  const facts = CATALOG[slug]
  const [files,       setFiles]       = useState<CatalogFile[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [query,       setQuery]       = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/catalog/${slug}`)
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        setFiles((await res.json()).files ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    })()
  }, [slug])

  const byCountry = useMemo(() => {
    const m = new Map<string, CatalogFile[]>()
    for (const f of files) {
      if (query && !f.country.toLowerCase().includes(query.toLowerCase())) continue
      m.set(f.country, [...(m.get(f.country) ?? []), f])
    }
    return [...m.entries()]
  }, [files, query])
  const countries = new Set(files.map((f) => f.country)).size

  async function handleDownload(f: CatalogFile) {
    if (!checkAccess(slug)) { openGate(slug); return }
    if (!f.download_url) { notifyUnavailable(slug); return }
    if (!(await consumeDownload(slug, f.country))) return
    setDownloading(f.id)
    window.open(f.download_url, '_blank')
    setTimeout(() => setDownloading(null), 1000)
  }

  if (loading) return hideWhenEmpty ? null : (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading files…</p>
    </div>
  )
  if (error) return hideWhenEmpty ? null : <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center"><p className="text-red-700 text-sm">{error}</p></div>
  if (files.length === 0) return hideWhenEmpty ? null : (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">These files are being uploaded. Check back soon.</div>
  )

  return (
    <div>
      {facts && (
        <>
          <div className="rounded-xl p-4 mb-3 text-xs text-gray-600 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ backgroundColor: `${facts.accent}12` }}>
            {facts.facts.map((x) => (
              <div key={x.label}><span className="block text-gray-400 mb-0.5">{x.label}</span><span className="font-semibold text-navy">{x.value}</span></div>
            ))}
          </div>
          {facts.note && <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">{facts.note}</div>}
        </>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search by country…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-20 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-400/30 placeholder:text-gray-400" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{byCountry.length} of {countries}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {byCountry.map(([country, list]) => (
          <div key={country} className="bg-white border border-gray-100 hover:shadow-sm transition-all rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Layers size={15} style={{ color: facts?.accent }} />
              <span className="font-semibold text-navy text-sm">{country}</span>
            </div>
            {list.map((f) => (
              <button key={f.id} onClick={() => handleDownload(f)} disabled={downloading === f.id}
                className={`w-full flex items-center justify-between gap-2 text-left text-xs py-2 px-3 rounded-lg transition-colors ${
                  !hasAccess ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                  : downloading === f.id ? 'bg-green-100 text-green-700'
                  : 'bg-gray-50 text-navy hover:bg-gray-100'}`}>
                <span className="min-w-0">
                  <span className="block font-semibold truncate">{f.label}</span>
                  <span className="block text-[11px] text-gray-400">{f.file_format} · {f.file_size_mb} MB</span>
                </span>
                <span className="shrink-0">{!hasAccess ? '🔒' : downloading === f.id ? '✓' : <Download size={13} />}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-4 justify-center text-[11px] text-gray-400">
        <span>{countries} countries</span>
        {facts && <><span>·</span><span>{facts.credit}</span></>}
      </div>
    </div>
  )
}
