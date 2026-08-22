/**
 * GET /api/admin/users/list?status=active|free|pending|all
 *
 * Admin-only. Returns the full user roster joined with profile data
 * (plan, plan_status) plus the email from auth.users - the piece the
 * Supabase Auth dashboard alone won't show side-by-side with their plan.
 *
 * Once-off model: no expiry, no trial. A user is just active, pending
 * (manual payment submitted, awaiting verification), or free (not paid).
 *
 * Auth: cookie session + ADMIN_EMAILS allow-list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const statusFilter = new URL(req.url).searchParams.get('status') || 'all'
  const search       = (new URL(req.url).searchParams.get('q') || '').trim().toLowerCase()

  // Pull every profile row. The dataset is small (a few hundred users at
  // most for the foreseeable future) so pagination isn't worth the
  // complexity yet - re-run when the table tops 5k.
  const { data: profiles, error: profErr } = await service
    .from('profiles')
    .select('id, full_name, first_name, last_name, country, sector, plan, plan_status, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (profErr) {
    console.error('[admin/users/list] profile fetch failed:', profErr)
    return NextResponse.json({ error: 'profile fetch failed' }, { status: 500 })
  }

  // The auth.users table holds emails - service role unlocks the
  // `auth.admin.listUsers` endpoint which the anon client can't see.
  // We pull all and intersect with the profiles list. 1 page = 1000 users;
  // good enough until we cross 1k users (then move to paged + match).
  const { data: authList, error: authErr } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) {
    console.error('[admin/users/list] auth listUsers failed:', authErr)
    return NextResponse.json({ error: 'auth listUsers failed' }, { status: 500 })
  }
  const emailById = new Map<string, string>(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? '']),
  )

  // Decorate. No expiry, no trial in the once-off model - effective_status
  // is just plan_status, kept as its own field so the UI code that reads
  // effective_status doesn't need to change.
  const rows = (profiles ?? []).map((p) => {
    const email = emailById.get(p.id) ?? ''
    const effective_status: 'active' | 'pending' | 'free' =
      (p.plan_status ?? 'free') as 'active' | 'pending' | 'free'

    return {
      id:               p.id,
      email,
      full_name:        p.full_name,
      first_name:       p.first_name,
      last_name:        p.last_name,
      country:          p.country,
      sector:           p.sector,
      plan:             p.plan,
      plan_status:      p.plan_status,
      effective_status,
      created_at:       p.created_at,
    }
  })

  // Status filter
  let filtered = rows
  if (statusFilter !== 'all') {
    filtered = filtered.filter((r) => r.effective_status === statusFilter)
  }
  // Search filter (email / name / country / plan)
  if (search) {
    filtered = filtered.filter((r) =>
      (r.email || '').toLowerCase().includes(search) ||
      (r.full_name || '').toLowerCase().includes(search) ||
      (r.first_name || '').toLowerCase().includes(search) ||
      (r.last_name || '').toLowerCase().includes(search) ||
      (r.country || '').toLowerCase().includes(search) ||
      (r.plan || '').toLowerCase().includes(search)
    )
  }

  // Summary counts (across all rows, not the filtered slice)
  const summary = rows.reduce(
    (acc, r) => {
      acc.total += 1
      acc[r.effective_status] = (acc[r.effective_status] ?? 0) + 1
      return acc
    },
    { total: 0, active: 0, pending: 0, free: 0 } as Record<string, number>,
  )

  return NextResponse.json({
    users:   filtered,
    summary,
    fetched: filtered.length,
  })
}
