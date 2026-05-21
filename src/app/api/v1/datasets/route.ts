/**
 * GET /api/v1/datasets
 *
 * Public catalogue of every dataset exposed via the API. One row per dataset
 * with file_count, source, and category — enough for a research script to
 * pick what it needs and call /v1/datasets/<id>/download next.
 *
 * Auth: bearer key (Business+API tier).
 */
import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiRequest, recordUsage, failureResponse, MAX_REQUESTS_PER_MONTH, MAX_EGRESS_BYTES_PER_MONTH } from '@/lib/api-auth'
import { summariseDatasets } from '@/lib/api-datasets'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest(req)
  if (!auth.ok) return failureResponse(auth.failure)

  const datasets = await summariseDatasets()

  // Count this listing as one API call but no egress.
  recordUsage(auth.caller.keyId, 0).catch(() => {})

  return NextResponse.json({
    datasets,
    quotas: {
      requests_used:        auth.caller.requestsThisMonth + 1,
      requests_limit:       MAX_REQUESTS_PER_MONTH,
      egress_bytes_used:    auth.caller.egressBytesThisMonth,
      egress_bytes_limit:   MAX_EGRESS_BYTES_PER_MONTH,
    },
  })
}
