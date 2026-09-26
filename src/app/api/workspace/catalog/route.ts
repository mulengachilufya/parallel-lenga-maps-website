/**
 * GET /api/workspace/catalog                         — datasets that can be added
 * GET /api/workspace/catalog?dataset=rivers,lakes    — every file of those datasets
 * GET /api/workspace/catalog?countries=ZMB,KEN       — every file, any dataset,
 *                                                      for those countries
 * Both filters combine. Listings are cached for a minute per instance.
 */
import { NextRequest, NextResponse } from 'next/server'
import { DATASETS, findDataset, listFilesForDataset } from '@/lib/api-datasets'
import { fileVariant } from '@/lib/workspace/catalog'
import { datasetMeta } from '@/lib/teams'
import { jsonError, requireWorkspace } from '@/lib/workspace/server'
import type { CatalogDataset, CatalogFile } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

const cache = new Map<string, { at: number; files: CatalogFile[] }>()
const TTL = 60_000

async function filesFor(slug: string): Promise<CatalogFile[]> {
  const hit = cache.get(slug)
  if (hit && Date.now() - hit.at < TTL) return hit.files
  const spec = findDataset(slug)
  if (!spec) return []
  const files = (await listFilesForDataset(spec)).map((f): CatalogFile => ({
    dataset_slug: spec.id,
    country:      f.country_name,
    country_iso3: f.country_iso3,
    r2_key:       f.r2_key,
    file_size_mb: f.file_size_mb,
    file_format:  f.file_format,
    variant:      fileVariant(f),
  }))
  cache.set(slug, { at: Date.now(), files })
  return files
}

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied

  const sp = req.nextUrl.searchParams
  const slugs = (sp.get('dataset') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const countries = new Set((sp.get('countries') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))

  if (!slugs.length && !countries.size) {
    const datasets: CatalogDataset[] = DATASETS.map((d) => ({
      id:       d.id,
      name:     d.name,
      category: d.category,
      raster:   datasetMeta(d.id)?.raster ?? /tif/i.test(d.id),
    })).sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ datasets })
  }

  const wanted = slugs.length ? slugs.filter((s) => findDataset(s)) : DATASETS.map((d) => d.id)
  if (!wanted.length) return jsonError('unknown_dataset', 404)

  try {
    const lists = await Promise.all(wanted.map(filesFor))
    let files = lists.flat()
    if (countries.size) files = files.filter((f) => countries.has(f.country_iso3.toUpperCase()))
    return NextResponse.json({ files })
  } catch (err) {
    console.error('[workspace/catalog]', err)
    return jsonError('catalog_failed', 500)
  }
}
