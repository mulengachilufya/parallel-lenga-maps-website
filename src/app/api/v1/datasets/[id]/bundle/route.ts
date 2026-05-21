/**
 * GET /api/v1/datasets/:id/bundle
 *
 * Returns presigned URLs for EVERY country file in the dataset in one
 * response. The Business+API tier is sold on "one call → continental
 * coverage" — that's this endpoint.
 *
 * NOTE: We don't actually concatenate files server-side into a single ZIP.
 * Building a real ZIP of ~50 GB of GeoTIFFs would blow our memory budget
 * and serve a half-finished file if anything timed out. Instead we return
 * a JSON manifest of presigned URLs and the caller streams them in
 * parallel — same UX, zero server load. The python client we'll publish
 * later will do this transparently.
 *
 * Auth: bearer key.
 */
import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiRequest, recordUsage, failureResponse, MAX_EGRESS_BYTES_PER_MONTH } from '@/lib/api-auth'
import { findDataset, listFilesForDataset, signAll, totalBytes } from '@/lib/api-datasets'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticateApiRequest(req)
  if (!auth.ok) return failureResponse(auth.failure)

  const spec = findDataset(params.id)
  if (!spec) {
    return NextResponse.json(
      { error: 'dataset_not_found', message: `No dataset with id "${params.id}".` },
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

  // Pre-flight quota check: a 50 GB bundle from a key with 5 GB left should
  // fail clean rather than silently undercount.
  const remaining = MAX_EGRESS_BYTES_PER_MONTH - auth.caller.egressBytesThisMonth
  if (bytes > remaining) {
    return NextResponse.json(
      {
        error:   'quota_exceeded',
        message: `Bundle is ~${(bytes / (1024 ** 3)).toFixed(1)} GB but only ~${(remaining / (1024 ** 3)).toFixed(1)} GB of egress remains this month. Email lengamaps@gmail.com for a higher cap.`,
        field:   'egress',
      },
      { status: 429 },
    )
  }

  const signed = await signAll(files, 3600)

  recordUsage(auth.caller.keyId, bytes).catch(() => {})

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
    },
  })
}
