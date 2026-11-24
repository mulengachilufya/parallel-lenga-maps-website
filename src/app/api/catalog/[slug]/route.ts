import { NextRequest, NextResponse } from 'next/server'
import { withDatasetDownloads } from '@/lib/dataset-access'
import { readCatalogFiles } from '@/lib/api-datasets'
import { CATALOG } from '@/lib/catalog'
import type { DatasetSlug } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

const REPORT_ONLY = new Set(['soil', 'temperature'])

export type { CatalogFile } from '@/lib/api-datasets'

/**
 * GET /api/catalog/:slug
 * Per-country files of a dataset in catalog_files (src/lib/catalog.ts).
 * Download links only for callers who may download the dataset.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // soil and temperature list their GIS files elsewhere; here they only carry PDF data reports.
  if (!Object.hasOwn(CATALOG, slug) && !REPORT_ONLY.has(slug)) return NextResponse.json({ error: 'unknown dataset' }, { status: 404 })

  try {
    const rows = await readCatalogFiles(slug)
    const files = await withDatasetDownloads(rows, true, slug as DatasetSlug, { fileName: (file) => file.file_name })
    return NextResponse.json({ count: files.length, files })
  } catch (error) {
    console.error('[catalog] lookup failed', { slug, error })
    return NextResponse.json({ error: 'catalogue lookup failed' }, { status: 500 })
  }
}
