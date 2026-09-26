/**
 * GET /api/workspace/catalog               — datasets that can be added to a map
 * GET /api/workspace/catalog?dataset=slug  — every file of that dataset
 *                                            (one or more per country)
 */
import { NextRequest, NextResponse } from 'next/server'
import { DATASETS, findDataset, listFilesForDataset } from '@/lib/api-datasets'
import { fileVariant } from '@/lib/workspace/catalog'
import { datasetMeta } from '@/lib/teams'
import { jsonError, requireWorkspace } from '@/lib/workspace/server'
import type { CatalogDataset, CatalogFile } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied

  const slug = req.nextUrl.searchParams.get('dataset')
  if (!slug) {
    const datasets: CatalogDataset[] = DATASETS.map((d) => ({
      id:       d.id,
      name:     d.name,
      category: d.category,
      raster:   datasetMeta(d.id)?.raster ?? /tif/i.test(d.id),
    })).sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ datasets })
  }

  const spec = findDataset(slug)
  if (!spec) return jsonError('unknown_dataset', 404)

  try {
    const files = await listFilesForDataset(spec)
    const out: CatalogFile[] = files.map((f) => ({
      country:      f.country_name,
      country_iso3: f.country_iso3,
      r2_key:       f.r2_key,
      file_size_mb: f.file_size_mb,
      file_format:  f.file_format,
      variant:      fileVariant(f),
    }))
    return NextResponse.json({ files: out })
  } catch (err) {
    console.error('[workspace/catalog]', err)
    return jsonError('catalog_failed', 500)
  }
}
