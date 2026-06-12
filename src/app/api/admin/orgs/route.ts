/**
 * Admin management of team organizations (Lenga for Projects).
 *
 * GET   /api/admin/orgs  — every org with its members, seat usage, and the
 *                          promo-email flag. This is the founder's "which
 *                          company is each member on a plan for" view.
 * POST  /api/admin/orgs  — create an org and provision its owner by email:
 *                          { name, owner_email, seat_count, sector?, region?,
 *                            monthly_price_usd?, notes? }
 *                          The owner must already have a Lenga Maps account.
 * PATCH /api/admin/orgs  — { id, ...changes } update seats / status / promo /
 *                          price / notes. Changing status ALSO flips every
 *                          member's plan_status (active ⇄ free) so suspension
 *                          revokes download access in one move.
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

async function requireAdmin(): Promise<NextResponse | null> {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return null
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const [orgs, members, invites] = await Promise.all([
    service.from('organizations').select('*').order('created_at', { ascending: false }),
    service.from('organization_members').select('*'),
    service.from('organization_invites').select('*').eq('status', 'pending'),
  ])
  if (orgs.error || members.error || invites.error) {
    console.error('[admin/orgs] list failed:', orgs.error ?? members.error ?? invites.error)
    return NextResponse.json({ error: 'list_failed' }, { status: 500 })
  }

  const byOrg = (orgs.data ?? []).map((o) => ({
    ...o,
    members: (members.data ?? []).filter((m) => m.org_id === o.id),
    pending_invites: (invites.data ?? []).filter((i) => i.org_id === o.id),
  }))
  return NextResponse.json({ orgs: byOrg })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const name        = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
  const ownerEmail  = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() : ''
  const seats       = Number(body.seat_count)
  if (!name || !ownerEmail || !Number.isFinite(seats) || seats < 1) {
    return NextResponse.json(
      { error: 'validation', message: 'name, owner_email and seat_count >= 1 are required.' },
      { status: 400 },
    )
  }

  // The owner must already have an account: provisioning attaches a seat to
  // an existing profile, it does not create logins.
  const { data: profile } = await service
    .from('profiles')
    .select('id, email, full_name, org_id')
    .ilike('email', ownerEmail)
    .maybeSingle()
  if (!profile) {
    return NextResponse.json(
      { error: 'owner_not_found', message: `No Lenga Maps account exists for ${ownerEmail}. Ask them to sign up first.` },
      { status: 404 },
    )
  }
  if (profile.org_id) {
    return NextResponse.json(
      { error: 'already_in_org', message: 'That account already belongs to an organization.' },
      { status: 409 },
    )
  }

  const { data: org, error: orgErr } = await service
    .from('organizations')
    .insert({
      name,
      sector:            typeof body.sector === 'string' ? body.sector.slice(0, 40) : null,
      region:            typeof body.region === 'string' ? body.region.slice(0, 200) : null,
      seat_count:        Math.round(seats),
      contact_email:     ownerEmail,
      monthly_price_usd: Number.isFinite(Number(body.monthly_price_usd)) ? Number(body.monthly_price_usd) : null,
      notes:             typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null,
    })
    .select('*')
    .single()
  if (orgErr || !org) {
    console.error('[admin/orgs] create failed:', orgErr)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }

  const { error: memErr } = await service.from('organization_members').insert({
    org_id:       org.id,
    user_id:      profile.id,
    role:         'owner',
    member_name:  profile.full_name,
    member_email: profile.email,
    joined_at:    new Date().toISOString(),
  })
  if (memErr) {
    console.error('[admin/orgs] owner membership failed:', memErr)
    await service.from('organizations').delete().eq('id', org.id) // don't leave a headless org
    return NextResponse.json({ error: 'member_failed', message: memErr.message }, { status: 500 })
  }

  // Entitlement: members ride plan='team'. No expiry date — renewals are
  // manual and org.status is the kill switch (PATCH below flips everyone).
  await service.from('profiles')
    .update({ plan: 'team', plan_status: 'active', plan_expires_at: null })
    .eq('id', profile.id)

  return NextResponse.json({ ok: true, org })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'validation' }, { status: 400 })

  const changes: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) changes.name = body.name.trim().slice(0, 200)
  if (Number.isFinite(Number(body.seat_count)) && Number(body.seat_count) >= 1) changes.seat_count = Math.round(Number(body.seat_count))
  if (typeof body.promo_emails === 'boolean') changes.promo_emails = body.promo_emails
  if (Number.isFinite(Number(body.monthly_price_usd))) changes.monthly_price_usd = Number(body.monthly_price_usd)
  if (typeof body.notes === 'string') changes.notes = body.notes.slice(0, 2000)
  if (Number.isFinite(Number(body.api_rate_per_min)) && Number(body.api_rate_per_min) >= 1) changes.api_rate_per_min = Math.round(Number(body.api_rate_per_min))
  if (typeof body.status === 'string' && ['active', 'suspended', 'cancelled'].includes(body.status)) changes.status = body.status

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'validation', message: 'No valid changes.' }, { status: 400 })
  }

  const { error } = await service.from('organizations').update(changes).eq('id', id)
  if (error) {
    console.error('[admin/orgs] update failed:', error)
    return NextResponse.json({ error: 'update_failed', message: error.message }, { status: 500 })
  }

  // Status change cascades to member entitlements: suspended/cancelled orgs
  // lose download access immediately; reactivation restores it.
  if (changes.status) {
    const memberIds = (await service
      .from('organization_members').select('user_id').eq('org_id', id))
      .data?.map((m) => m.user_id) ?? []
    if (memberIds.length > 0) {
      await service.from('profiles')
        .update({ plan_status: changes.status === 'active' ? 'active' : 'free' })
        .in('id', memberIds)
        .eq('plan', 'team')
    }
  }

  return NextResponse.json({ ok: true })
}
