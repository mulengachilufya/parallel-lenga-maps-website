/**
 * POST /api/team/free-datasets — { datasets: string[] }
 *
 * The owner of a free team chooses the team's 3 datasets, for good (same
 * rules as the individual free plan). Everyone on the team can download
 * them and put them on the team's workspace maps.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getMembership } from '@/lib/teams'
import { accessFor } from '@/lib/entitlements'
import { savePicks } from '@/lib/free-picks'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function POST(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized', message: 'Sign in first.' }, { status: 401 })

  const m = await getMembership(service, user.id)
  if (!m) return NextResponse.json({ error: 'no_team', message: 'You are not on a team.' }, { status: 404 })
  if (m.org.plan !== 'free') return NextResponse.json({ error: 'paid', message: 'Your team is on a paid plan: it already has every dataset.' }, { status: 409 })
  if (m.role !== 'owner') return NextResponse.json({ error: 'owner_only', message: 'Only the team owner chooses the team\'s datasets.' }, { status: 403 })

  let body: { datasets?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const r = await savePicks(service, 'org', m.org_id, body.datasets)
  if ('error' in r) return NextResponse.json({ error: 'pick_failed', message: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, access: await accessFor(service, user.id) })
}
