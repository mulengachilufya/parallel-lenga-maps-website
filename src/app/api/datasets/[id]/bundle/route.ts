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
 *   - must additionally be on Max or Enterprise — bulk pulls are a
 *     premium feature; Starter/Pro download per-country
 *
 * Like the API version, we return a JSON manifest of presigned URLs rather
 * than a single concatenated ZIP. The dashboard kicks them off in parallel.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import {
  findDataset, listFilesForDataset, signAll, totalBytes, hasSymbology,
} from '@/lib/api-datasets'
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

  const files = await listFilesForDataset(spec, null)
  if (files.length === 0) {
    return NextResponse.json(
      { error: 'empty_dataset', message: `Dataset "${spec.id}" has no files yet.` },
      { status: 404 },
    )
  }

  const bytes = totalBytes(files)
  const signed = await signAll(files, 3600)

  const symbologyHint = hasSymbology(spec.id)
    ? { symbology_endpoint: `/api/v1/datasets/${spec.id}/symbology` }
    : null

  return NextResponse.json({
    dataset: {
      id:         spec.id,
      name:       spec.name,
      file_count: signed.length,
    },
    bundle: {
      total_size_mb:       Math.round(bytes / (1024 * 1024)),
      download_expires_in: 3600,
      files:               signed,
      ...symbologyHint,
    },
  })
}
