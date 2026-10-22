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
 *                          renewal ({ extend: true, term } adds one term:
 *                          'month' | 'quarter' | 'year', default 3 months) /
 *                          upgrade ({ upgrade: true, seat_count } turns a
 *                          free team into a paid one) /
 *                          price / notes. Changing status ALSO flips every
 *                          member's plan_status (active ⇄ free) so suspension
 *                          revokes download access in one move.
 *
 * Auth: cookie session + ADMIN_EMAILS allow-list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { accessExpiry, termMonths } from '@/lib/pricing'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { accessFor, can } from '@/lib/staff'
import { provisionOrg, upgradeOrg } from '@/lib/teams-admin'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function requireAdmin(): Promise<NextResponse | null> {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !can(await accessFor(user.email), 'orgs')) {
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

  // One paid period from today; `permanent: true` only for deals agreed
  // before 3-month plans existed. Renewal is PATCH { extend: true };
  // org.status is the kill switch.
  const result = await provisionOrg(service, {
    name, ownerEmail, seats,
    sector: typeof body.sector === 'string' ? body.sector : null,
    region: typeof body.region === 'string' ? body.region : null,
    price:  Number.isFinite(Number(body.monthly_price_usd)) ? Number(body.monthly_price_usd) : null,
    notes:  typeof body.notes === 'string' ? body.notes : null,
    expiresAt: body.permanent === true ? null : accessExpiry(null, termMonths(body.term)),
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status })
  }
  const org = result.org
  const message = result.invited
    ? `${name} created. ${ownerEmail} has no account yet, so ${result.emailSent ? 'we emailed them an invite' : 'an invite was saved (the email failed)'}; they become the owner when they sign up from it.`
    : `${name} created with ${ownerEmail} as owner.`
  return NextResponse.json({ ok: true, org, message })
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

  // A free team has paid: it becomes a paid team in place (projects and
  // members kept), with the seats paid for and 3 months from today.
  if (body.upgrade === true) {
    const seats = Number.isFinite(Number(body.seat_count)) && Number(body.seat_count) >= 1 ? Math.round(Number(body.seat_count)) : 4
    const price = Number.isFinite(Number(body.monthly_price_usd)) ? Number(body.monthly_price_usd) : null
    const r = await upgradeOrg(service, id, { seats, price, expiresAt: accessExpiry(null, termMonths(body.term)) })
    if (!r.ok) return NextResponse.json({ error: 'update_failed', message: r.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Renewal: add one paid period, counted from the current expiry if it is
  // still running so an early renewal loses nothing.
  if (body.extend === true) {
    const { data: cur } = await service.from('organizations').select('access_expires_at').eq('id', id).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (!cur.access_expires_at) {
      return NextResponse.json({ error: 'validation', message: 'This team has permanent access; nothing to renew.' }, { status: 400 })
    }
    changes.access_expires_at = accessExpiry(cur.access_expires_at, termMonths(body.term))
    changes.status = 'active'
    changes.expiry_notice_sent = null
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'validation', message: 'No valid changes.' }, { status: 400 })
  }

  // Seats: never below the people already on the team, and a free team
  // stays at 2 until it is upgraded to paid.
  if ('seat_count' in changes) {
    const [{ data: cur }, { count: used }] = await Promise.all([
      service.from('organizations').select('plan').eq('id', id).maybeSingle(),
      service.from('organization_members').select('user_id', { count: 'exact', head: true }).eq('org_id', id),
    ])
    const seats = changes.seat_count as number
    if (cur?.plan === 'free' && seats > 2) {
      return NextResponse.json({ error: 'validation', message: 'A free team has 2 seats. Use "Upgrade to paid" to give it more.' }, { status: 400 })
    }
    if (seats < (used ?? 0)) {
      return NextResponse.json({ error: 'validation', message: `This team has ${used} members, so it needs at least ${used} seats. Remove someone first.` }, { status: 400 })
    }
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
        .update({
          plan_status: changes.status === 'active' ? 'active' : 'free',
          ...('access_expires_at' in changes ? { plan_expires_at: changes.access_expires_at, expiry_reminder_sent_at: null } : {}),
        })
        .in('id', memberIds)
        .eq('plan', 'team')
    }
  }

  return NextResponse.json({ ok: true })
}
