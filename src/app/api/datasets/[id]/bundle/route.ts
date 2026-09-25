/**
 * GET /api/datasets/:id/bundle
 *
 * Cookie-authenticated continental bundle for the in-app dashboard.
 * Mirrors /api/v1/datasets/:id/bundle (which uses bearer keys), but for
 * the browser session — so a paid subscriber can click "Download all 54
 * countries" without first issuing an API key.
 *
 * Once-off model: bulk bundles are no longer a Max/Enterprise-only
 * premium feature — every paid account (individual or team) gets
 * unlimited downloads and the full catalogue, so any active plan can
 * pull the continental bundle.
 *
 * Access rules:
 *   - must be signed in
 *   - must have an active plan (individual or team)
 *
 * We return a presigned URL to ONE pre-built combined file (a GeoPackage that
 * merges all 54 countries into a single layer, attribute tables embedded) so
 * the user can drop the whole dataset straight into QGIS — no more downloading
 * countries one by one. The combined files are built offline
 * (scripts/combine-vector.py) and registered in the dataset_bundles table; if a
 * dataset hasn't been built yet we answer "bundle_not_ready" (404).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { findDataset, getDatasetBundle, hasSymbology } from '@/lib/api-datasets'
import { getDownloadUrl } from '@/lib/r2'
import type { DatasetSlug } from '@/lib/pricing'
import { callerCanDownloadDataset } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // No per-tier gate anymore — any active plan (individual or team) can
  // pull any bundle.
  const slug = id as DatasetSlug
  const canDownload = await callerCanDownloadDataset(slug).catch(() => false)
  if (!canDownload) {
    return NextResponse.json({ error: 'dataset_not_allowed' }, { status: 403 })
  }

  const spec = findDataset(id)
  if (!spec) {
    return NextResponse.json(
      { error: 'dataset_not_found', message: `No dataset with id "${id}".` },
      { status: 404 },
    )
  }

  // One pre-built combined file per dataset (built offline, stored in R2).
  const bundle = await getDatasetBundle(spec.id)
  if (!bundle) {
    return NextResponse.json(
      {
        error:   'bundle_not_ready',
        message: `The combined Africa-wide file for "${spec.name}" is being prepared. Per-country downloads are available now.`,
      },
      { status: 404 },
    )
  }

  const download_url = await getDownloadUrl(bundle.r2_key, 3600)

  const symbologyHint = hasSymbology(spec.id)
    ? { symbology_endpoint: `/api/v1/datasets/${spec.id}/symbology` }
    : null

  return NextResponse.json({
    dataset: {
      id:         spec.id,
      name:       spec.name,
      file_count: bundle.file_count,
    },
    bundle: {
      format:              bundle.file_format,
      total_size_mb:       bundle.file_size_mb,
      feature_count:       bundle.feature_count,
      layers:              bundle.layers,
      filename:            bundle.r2_key.split('/').pop(),
      download_url,
      download_expires_in: 3600,
      ...symbologyHint,
    },
  })
}