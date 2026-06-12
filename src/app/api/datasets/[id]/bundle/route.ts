/**
 * GET /api/datasets/:id/bundle
 *
 * Cookie-authenticated continental bundle for the in-app dashboard.
 * Mirrors /api/v1/datasets/:id/bundle (which uses bearer keys), but for
 * the browser session — so a Max/Enterprise subscriber can click "Download
 * all 54 countries" without first issuing an API key.
 *
 * Access rules:
 *   - must be signed in
 *   - must have an active plan that grants this specific dataset
 *   - must additionally be on Max or Enterprise — the continental bundle is a
 *     premium feature; Starter/Pro download per-country
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
import { getUserState } from '@/lib/pricing'
import type { DatasetSlug } from '@/lib/pricing'
import { callerCanDownloadDataset } from '@/lib/dataset-access'

export const dynamic = 'force-dynamic'

// Bulk download is a premium feature — only these tiers see the button.
const BULK_TIERS = new Set(['max', 'enterprise'])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Resolve plan / status / trial so we can gate on tier in addition to
  // the per-dataset minimum.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, plan_status, plan_expires_at, trial_started_at')
    .eq('id', user.id)
    .single()
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 403 })
  }
  if (profile.plan_expires_at &&
      new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'plan_expired' }, { status: 403 })
  }

  const userState = getUserState(
    profile.plan,
    profile.trial_started_at,
    profile.plan_status,
  )
  if (!BULK_TIERS.has(userState)) {
    return NextResponse.json(
      {
        error: 'bulk_requires_max',
        message: 'Continental bundle downloads are available on Max and Enterprise plans. Per-country downloads remain available on your current plan.',
        required_tier: 'max',
      },
      { status: 403 },
    )
  }

  // Also enforce the per-dataset minimum (no gaming the gate by submitting
  // a bundle request for a Pro-tier dataset from a Max account that
  // somehow had its plan downgraded mid-flight, etc.).
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
