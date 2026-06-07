/**
 * GET /api/v1/datasets/:id/symbology
 *
 * Returns a presigned URL for the QGIS symbology file (.qml or .sld) that
 * pairs with this dataset, when one ships. Solves the "I downloaded a
 * categorical raster but my QGIS opens it as a gradient of grey" frustration
 * for paletted layers (LULC, soil classes, SPI bins, etc.).
 *
 * Convention: symbology files live at `symbology/<datasetId>.<ext>` in R2.
 * If the object is missing, we 404 rather than 500 — not every dataset
 * needs paletted symbology (vector layers with default styles, for example).
 *
 * Auth: bearer key. Same egress accounting as a normal download.
 */
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import { authenticateApiRequest, failureResponse } from '@/lib/api-auth'
import { findDataset, listSymbology } from '@/lib/api-datasets'
import { getDownloadUrl } from '@/lib/r2'

export const dynamic = 'force-dynamic'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(req)
  if (!auth.ok) return failureResponse(auth.failure)

  const { id } = await params
  const spec = findDataset(id)
  if (!spec) {
    return NextResponse.json(
      { error: 'dataset_not_found', message: `No dataset with id "${id}".` },
      { status: 404 },
    )
  }

  const candidates = listSymbology(spec.id)
  if (candidates.length === 0) {
    return NextResponse.json(
      {
        error:   'no_symbology_planned',
        message: `Dataset "${spec.id}" does not ship with QGIS symbology — its default styling is appropriate.`,
      },
      { status: 404 },
    )
  }

  // Return the first symbology asset that actually exists in R2.
  for (const key of candidates) {
    try {
      await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
      const downloadUrl = await getDownloadUrl(key, 3600)
      return NextResponse.json({
        dataset_id:          spec.id,
        symbology: {
          key,
          download_url:        downloadUrl,
          download_expires_in: 3600,
          // Quick "how to use this" hint surfaced to API users.
          apply_in_qgis: 'Right-click the layer → Properties → Symbology → Style → Load Style → choose this file.',
        },
      })
    } catch { /* not in R2 yet — try the next candidate */ }
  }

  return NextResponse.json(
    {
      error:   'symbology_not_uploaded_yet',
      message: `Symbology asset planned for "${spec.id}" but not yet uploaded to R2.`,
      planned_keys: candidates,
    },
    { status: 404 },
  )
}
