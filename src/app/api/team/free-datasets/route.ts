/**
 * POST /api/team/free-datasets — retired.
 *
 * Free teams no longer choose datasets of their own. A free team's projects
 * use every dataset its members picked on their own dashboards (see
 * teamDatasets() in src/lib/entitlements.ts). Kept so an old tab gets a
 * clear answer instead of a 404.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json({
    error: 'retired',
    message: 'Teams no longer choose their own datasets. Your projects use the datasets each team member chose on their dashboard.',
  }, { status: 410 })
}
