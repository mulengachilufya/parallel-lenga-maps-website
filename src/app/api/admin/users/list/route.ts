/**
 * GET /api/admin/users/list?status=active|free|pending|expired|all
 *
 * Admin-only. Returns the full user roster joined with profile data
 * (plan, plan_status, plan_expires_at, trial_started_at) plus the email
 * from auth.users — the piece the Supabase Auth dashboard alone won't
 * show side-by-side with their plan.
 *
 * Auth: cookie session + ADMIN_EMAILS allow-list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
import { TRIAL_DURATION_MS } from '@/lib/pricing'

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
  // complexity yet — re-run when the table tops 5k.
  const { data: profiles, error: profErr } = await service
    .from('profiles')
    .select('id, full_name, plan, plan_status, plan_expires_at, trial_started_at, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (profErr) {
    console.error('[admin/users/list] profile fetch failed:', profErr)
    return NextResponse.json({ error: 'profile fetch failed' }, { status: 500 })
  }

  // The auth.users table holds emails — service role unlocks the
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

  // Decorate + filter
  const now = Date.now()
  const rows = (profiles ?? []).map((p) => {
    const email = emailById.get(p.id) ?? ''
    const expiresAt = p.plan_expires_at ? new Date(p.plan_expires_at).getTime() : null
    const isExpired = expiresAt !== null && expiresAt <= now
    // Compose an "effective" status that captures expiry AND the automatic
    // 3-day free trial — the raw plan_status='active' with a past expires_at
    // is misleading on its own, and plan_status='free' on a brand-new user
    // hides that they currently have Max access via their trial window.
    let effective_status: 'active' | 'pending' | 'free' | 'expired' | 'trial' =
      (p.plan_status ?? 'free') as 'active' | 'pending' | 'free'
    if (effective_status === 'active' && isExpired) effective_status = 'expired'

    // Trial detection: only override the "free" bucket. Pending users stay
    // pending (admin needs to verify their manual payment) and active/expired
    // users stay where they are (a real paid plan beats the trial).
    let trialExpiresAt: number | null = null
    if (effective_status === 'free' && p.trial_started_at) {
      const trialEnd = new Date(p.trial_started_at).getTime() + TRIAL_DURATION_MS
      if (trialEnd > now) {
        effective_status = 'trial'
        trialExpiresAt = trialEnd
      }
    }

    // For the Expires column: trial users get a virtual expiry (trial end);
    // everyone else uses the real plan_expires_at column. days_left mirrors
    // whichever source is in play so the UI's "Xd left" works for both.
    const displayExpiresMs = trialExpiresAt ?? expiresAt
    const displayExpiresAt = trialExpiresAt
      ? new Date(trialExpiresAt).toISOString()
      : p.plan_expires_at
    const days_left = displayExpiresMs !== null
      ? Math.ceil((displayExpiresMs - now) / (24 * 60 * 60 * 1000))
      : null

    return {
      id:               p.id,
      email,
      full_name:        p.full_name,
      plan:             p.plan,
      plan_status:      p.plan_status,
      effective_status,
      plan_expires_at:  displayExpiresAt,
      days_left,
      created_at:       p.created_at,
    }
  })

  // Status filter
  let filtered = rows
  if (statusFilter !== 'all') {
    filtered = filtered.filter((r) => r.effective_status === statusFilter)
  }
  // Search filter (email / name / plan)
  if (search) {
    filtered = filtered.filter((r) =>
      (r.email || '').toLowerCase().includes(search) ||
      (r.full_name || '').toLowerCase().includes(search) ||
      (r.plan || '').toLowerCase().includes(search) ||
   '')
  }

  // Summary counts (across all rows, not the filtered slice)
  const summary = rows.reduce(
    (acc, r) => {
      acc.total += 1
      acc[r.effective_status] = (acc[r.effective_status] ?? 0) + 1
      return acc
    },
    { total: 0, active: 0, pending: 0, trial: 0, free: 0, expired: 0 } as Record<string, number>,
  )

  return NextResponse.json({
    users:   filtered,
    summary,
    fetched: filtered.length,
  })
}
