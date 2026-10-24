'use client'

import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import type { CatalogFile } from '@/app/api/catalog/[slug]/route'
import type { DatasetSlug } from '@/lib/pricing'
import { useDownloadGate } from '@/contexts/DownloadGateContext'

/** A catalog_files row that is the PDF data report of a GIS dataset (not the GIS file itself). */
export function isDatasetReport(f: CatalogFile) {
  return f.file_format === 'PDF' && f.slug !== 'country-profiles'
}

/** Start a download in place: the link carries Content-Disposition: attachment,
 *  so the browser saves the file instead of opening an empty tab. */
export function startDownload(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** iso3 (lower case) from an R2 key laid out as datasets/<iso3>/<folder>/<file>. */
export function isoFromKey(key: string) {
  return key.split('/')[1]?.toLowerCase() ?? ''
}

/** PDF data reports of a dataset, keyed by lower case iso3. */
export function useDatasetReports(slug: DatasetSlug) {
  const [reports, setReports] = useState<Map<string, CatalogFile>>(new Map())
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/catalog/${slug}`)
        if (!res.ok) return
        const files: CatalogFile[] = (await res.json()).files ?? []
        setReports(new Map(files.filter(isDatasetReport).map((f) => [f.iso3.toLowerCase(), f])))
      } catch { /* reports are optional; the GIS list still works */ }
    })()
  }, [slug])
  return reports
}

/** "Download PDF version" line shown directly under a country's GIS file. */
export function ReportButton({ slug, report }: { slug: DatasetSlug; report?: CatalogFile }) {
  const { openGate, checkAccess, consumeDownload, notifyUnavailable } = useDownloadGate()
  const [busy, setBusy] = useState(false)
  if (!report) return (
    <div className="w-full flex items-center gap-2 text-[11px] py-1.5 px-3 rounded-lg bg-gray-50/60 text-gray-400">
      <FileText size={12} /> PDF version coming soon
    </div>
  )
  const hasAccess = checkAccess(slug)
  async function open() {
    if (!report) return
    if (!checkAccess(slug)) { openGate(slug); return }
    if (!report.download_url) { notifyUnavailable(slug); return }
    if (!(await consumeDownload(slug, report.country))) return
    setBusy(true)
    startDownload(report.download_url)
    setTimeout(() => setBusy(false), 1000)
  }
  return (
    <button onClick={open} disabled={busy}
      className={`w-full flex items-center justify-between gap-2 text-left text-xs py-2 px-3 rounded-lg transition-colors ${
        !hasAccess ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
        : busy ? 'bg-green-100 text-green-700'
        : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100'}`}>
      <span className="min-w-0">
        <span className="block font-semibold">Download PDF version</span>
        <span className="block text-[11px] text-gray-500">Includes insights and notes · PDF · {report.file_size_mb} MB</span>
      </span>
      <span className="shrink-0">{!hasAccess ? '🔒' : busy ? '✓' : <FileText size={13} />}</span>
    </button>
  )
}
