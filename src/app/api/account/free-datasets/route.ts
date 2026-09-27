/**
 * POST /api/account/free-datasets — { datasets: string[] }
 *
 * Choose datasets for the individual free plan. Up to 3, for good: picks
 * can be added until there are 3 but never removed or swapped. Paying
 * unlocks every dataset. Admins can reset a choice from /ops.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
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

  let body: { datasets?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }

  const before = await accessFor(service, user.id)
  if (before.paid) return NextResponse.json({ error: 'paid', message: 'Your plan already includes every dataset.' }, { status: 409 })

  const r = await savePicks(service, 'profile', user.id, body.datasets)
  if ('error' in r) return NextResponse.json({ error: 'pick_failed', message: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, access: await accessFor(service, user.id) })
}
