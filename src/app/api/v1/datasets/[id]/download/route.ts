/**
 * GET /api/v1/datasets/:id/download?country=ZM
 *
 * Returns a presigned R2 URL for ONE country's file in this dataset.
 * `country` is required and accepts ISO-3 (`ZM`) or full name (`Zambia`).
 * URL is valid for 1 hour — long enough to wget, short enough to limit
 * leak damage.
 *
 * Auth: bearer key.
 */
import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiRequest, recordUsage, failureResponse } from '@/lib/api-auth'
import { findDataset, listFilesForDataset } from '@/lib/api-datasets'
import { getDownloadUrl } from '@/lib/r2'

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

  const country = req.nextUrl.searchParams.get('country')
  if (!country) {
    return NextResponse.json(
      { error: 'country_required', message: 'Pass ?country=ZM (ISO-3) or ?country=Zambia.' },
      { status: 400 },
    )
  }

  const matches = await listFilesForDataset(spec, country)
  if (matches.length === 0) {
    return NextResponse.json(
      { error: 'file_not_found', message: `No file for country "${country}" in dataset "${spec.id}".` },
      { status: 404 },
    )
  }
  // If country matches multiple rows (e.g. population has ADM1 + ADM2), the
  // caller should disambiguate. We surface the list back so they can re-call.
  if (matches.length > 1) {
    return NextResponse.json(
      {
        error:    'ambiguous_match',
        message:  `Country "${country}" matched ${matches.length} files. Call /v1/datasets/${spec.id}?country=${country} to list them.`,
        files:    matches,
      },
      { status: 400 },
    )
  }

  const file = matches[0]
  const downloadUrl = await getDownloadUrl(file.r2_key, 3600)
  const bytes = Math.round(file.file_size_mb * 1024 * 1024)

  recordUsage(auth.caller.keyId, bytes).catch(() => {})

  return NextResponse.json({
    file: {
      ...file,
      download_url:        downloadUrl,
      download_expires_in: 3600,
    },
  })
}
