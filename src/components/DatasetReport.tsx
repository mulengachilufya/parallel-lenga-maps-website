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

/** The PDF summary: a quiet second option under a country's GIS file, which stays the main download. */
export function ReportButton({ slug, report }: { slug: DatasetSlug; report?: CatalogFile }) {
  const { openGate, checkAccess, consumeDownload, notifyUnavailable } = useDownloadGate()
  const [busy, setBusy] = useState(false)
  if (!report) return null
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
      className="self-start inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-800 hover:underline px-1">
      {!hasAccess ? '🔒' : busy ? '✓' : <FileText size={11} />} Or a PDF summary · {report.file_size_mb} MB
    </button>
  )
}
