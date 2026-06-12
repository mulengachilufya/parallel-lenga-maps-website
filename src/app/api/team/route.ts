/**
 * GET   /api/team  — everything the team workspace needs in one call:
 *                    org, your role, members, pending invites, seat usage,
 *                    and the shared download history (latest 300 events).
 *                    404 { error:'no_team' } for users without an org.
 * PATCH /api/team  — owner-only settings: { name?, operating_countries?,
 *                    contact_email?, promo_emails? }.
 *
 * Reads use the service client AFTER verifying the cookie session and
 * resolving membership server-side — the response is always scoped to the
 * caller's own org. (RLS would also allow these reads; the service client
 * keeps one code path and one field whitelist.)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getMembership } from '@/lib/teams'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function requireMember() {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) {
    return { denied: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  }
  const membership = await getMembership(service, user.id)
  if (!membership) {
    return { denied: NextResponse.json({ error: 'no_team' }, { status: 404 }) }
  }
  return { user, membership }
}

export async function GET() {
  const gate = await requireMember()
  if ('denied' in gate) return gate.denied
  const { user, membership } = gate

  const [members, invites, events] = await Promise.all([
    service.from('organization_members')
      .select('user_id, role, member_name, member_email, invited_at, joined_at')
      .eq('org_id', membership.org_id)
      .order('joined_at', { ascending: true }),
    service.from('organization_invites')
      .select('id, email, role, status, created_at')
      .eq('org_id', membership.org_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    service.from('download_events')
      .select('id, user_id, user_name, user_email, dataset_slug, dataset_name, country, epsg, file_format, created_at')
      .eq('org_id', membership.org_id)
      .order('created_at', { ascending: false })
      .limit(300),
  ])

  if (members.error || invites.error || events.error) {
    console.error('[team] fetch failed:', members.error ?? invites.error ?? events.error)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
  }

  return NextResponse.json({
    me:      { user_id: user.id, role: membership.role },
    org:     membership.org,
    members: members.data ?? [],
    invites: invites.data ?? [],
    events:  events.data ?? [],
    seats: {
      total:   membership.org.seat_count,
      used:    (members.data ?? []).length,
      pending: (invites.data ?? []).length,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireMember()
  if ('denied' in gate) return gate.denied
  const { membership } = gate

  if (membership.role !== 'owner') {
    return NextResponse.json(
      { error: 'owner_only', message: 'Only the team owner can change settings.' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const changes: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) changes.name = body.name.trim().slice(0, 200)
  if (typeof body.contact_email === 'string') changes.contact_email = body.contact_email.trim().slice(0, 200) || null
  if (typeof body.promo_emails === 'boolean') changes.promo_emails = body.promo_emails
  if (Array.isArray(body.operating_countries)) {
    changes.operating_countries = body.operating_countries
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 54)
  }
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'validation', message: 'No valid changes.' }, { status: 400 })
  }

  const { error } = await service.from('organizations').update(changes).eq('id', membership.org_id)
  if (error) {
    console.error('[team] settings update failed:', error)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
