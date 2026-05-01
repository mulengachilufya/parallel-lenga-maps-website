/**
 * GET /api/v1/datasets/:id
 *
 * Returns full metadata for a single dataset PLUS the per-country file list
 * (without presigned URLs). Use /download for a single file or /bundle for
 * all of them.
 *
 * Auth: bearer key.
 */
import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiRequest, recordUsage, failureResponse } from '@/lib/api-auth'
import { findDataset, listFilesForDataset } from '@/lib/api-datasets'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticateApiRequest(req)
  if (!auth.ok) return failureResponse(auth.failure)

  const spec = findDataset(params.id)
  if (!spec) {
    return NextResponse.json(
      { error: 'dataset_not_found', message: `No dataset with id "${params.id}". Call /v1/datasets to list available ones.` },
      { status: 404 },
    )
  }

  const files = await listFilesForDataset(spec, req.nextUrl.searchParams.get('country'))

  recordUsage(auth.caller.keyId, 0).catch(() => {})

  return NextResponse.json({
    dataset: {
      id:          spec.id,
      name:        spec.name,
      description: spec.description,
      category:    spec.category,
      source:      spec.source,
      file_count:  files.length,
    },
    files,
  })
}
