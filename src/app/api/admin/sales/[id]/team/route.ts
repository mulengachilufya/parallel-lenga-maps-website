/**
 * POST /api/admin/sales/:id/team — give the prospect a team account.
 *
 *   { action: 'pilot', contact_id, seats? }
 *       A 14 day pilot: creates the team with the contact as owner, moves
 *       the account to "Pilot running" and books the check-ins.
 *
 *   { action: 'paid', contact_id?, seats, value_usd? }
 *       Payment has arrived: starts 3 months of access (turning the pilot
 *       team into the real one, or creating the team if there was no
 *       pilot), moves the account to "Won" and books onboarding.
 *
 * The owner must already have a Lenga Maps account, the same rule as
 * Organizations in the admin panel.
 */
import { NextRequest, NextResponse } from 'next/server'
import { accessExpiry } from '@/lib/pricing'
import { provisionOrg } from '@/lib/teams-admin'
import { PILOT_DAYS, dueDate, stageIndex } from '@/lib/sales/playbook'
import {
  countryName, db, isUuid, jsonError, loadAccount, logActivity, moveStage, num, requireAdmin,
} from '@/lib/sales/server'
import { audit } from '@/lib/ops/log'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const account = await loadAccount(id)
  if (!account) return jsonError('not_found', 404)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const full = (await db.from('sales_accounts').select('seats_estimate, value_usd').eq('id', id).single()).data
  const seats = Math.max(1, Math.round(num(body.seats) ?? full?.seats_estimate ?? 4))
  const value = num(body.value_usd) ?? full?.value_usd ?? null

  async function owner() {
    if (!isUuid(body.contact_id)) return { error: jsonError('validation', 400, 'Pick who will own the team account.') }
    const { data: c } = await db.from('sales_contacts').select('id, name, email').eq('id', body.contact_id).eq('account_id', id).maybeSingle()
    if (!c?.email) return { error: jsonError('validation', 400, 'The team owner needs an email address. Add one to the contact first.') }
    return { contact: c }
  }

  if (body.action === 'pilot') {
    if (account.org_id) return jsonError('has_team', 409, 'This account already has a team. Use "Payment received" when they pay.')
    const o = await owner()
    if ('error' in o) return o.error
    const ends = new Date(Date.now() + PILOT_DAYS * 86400_000).toISOString()
    const r = await provisionOrg(db, {
      name: account.name, ownerEmail: o.contact.email!, seats,
      sector: account.sector, region: countryName(account.country_iso3) || null,
      price: value, notes: `Pilot from the sales pipeline, started ${new Date().toISOString().slice(0, 10)}.`, expiresAt: ends,
    })
    if (!r.ok) return jsonError(r.error, r.status, r.message)

    await db.from('sales_accounts').update({ org_id: r.org.id, seats_estimate: seats, updated_at: new Date().toISOString() }).eq('id', id)
    if (stageIndex(account.stage) < stageIndex('pilot')) await moveStage(account, 'pilot', gate.email)
    await db.from('sales_tasks').insert([
      { account_id: id, contact_id: o.contact.id, kind: 'email', template: 'pilot_checkin', title: 'Pilot day 3: is everyone in?', due_on: dueDate(3) },
      { account_id: id, contact_id: o.contact.id, kind: 'call', title: 'Pilot day 10: look at what they have made', due_on: dueDate(10) },
      { account_id: id, contact_id: o.contact.id, kind: 'email', template: 'proposal', title: 'Pilot ends soon: send the proposal', due_on: dueDate(PILOT_DAYS - 2) },
    ])
    await logActivity({ account_id: id, contact_id: o.contact.id, kind: 'system', created_by: gate.email,
      subject: `${PILOT_DAYS} day pilot started, ${seats} seats, owner ${o.contact.email}`, meta: { org_id: r.org.id, ends } })
    await audit(gate.email, 'console', 'sales_pilot', account.name, { org_id: r.org.id, seats })
    return NextResponse.json({ ok: true, org_id: r.org.id, ends })
  }

  if (body.action === 'paid') {
    const expires = accessExpiry()
    let orgId = account.org_id
    let ownerContact: string | null = null
    if (orgId) {
      const { error } = await db.from('organizations').update({
        status: 'active', access_expires_at: expires, expiry_notice_sent: null, seat_count: seats,
        ...(value !== null ? { monthly_price_usd: value } : {}),
      }).eq('id', orgId)
      if (error) return jsonError('update_failed', 500, error.message)
      const ids = ((await db.from('organization_members').select('user_id').eq('org_id', orgId)).data ?? []).map((m) => m.user_id)
      if (ids.length) {
        await db.from('profiles').update({ plan: 'team', plan_status: 'active', plan_expires_at: expires, expiry_reminder_sent_at: null }).in('id', ids)
      }
    } else {
      const o = await owner()
      if ('error' in o) return o.error
      ownerContact = o.contact.id
      const r = await provisionOrg(db, {
        name: account.name, ownerEmail: o.contact.email!, seats,
        sector: account.sector, region: countryName(account.country_iso3) || null,
        price: value, notes: 'Won in the sales pipeline.', expiresAt: expires,
      })
      if (!r.ok) return jsonError(r.error, r.status, r.message)
      orgId = r.org.id
    }

    await db.from('sales_accounts').update({ org_id: orgId, seats_estimate: seats, value_usd: value, updated_at: new Date().toISOString() }).eq('id', id)
    await moveStage(account, 'won', gate.email)
    const renewalCheck = new Date(new Date(expires).getTime() - 30 * 86400_000)
    await db.from('sales_tasks').insert([
      { account_id: id, contact_id: ownerContact, kind: 'email', template: 'onboarding', title: 'Send the welcome email and book onboarding', due_on: dueDate(0) },
      { account_id: id, contact_id: ownerContact, kind: 'call', title: 'Week 2: is the whole team in and working?', due_on: dueDate(14) },
      { account_id: id, contact_id: ownerContact, kind: 'call', title: 'Renewal is in a month: check in', due_on: renewalCheck.toISOString().slice(0, 10) },
    ])
    await logActivity({ account_id: id, kind: 'system', created_by: gate.email,
      subject: `Payment received: ${seats} seats${value !== null ? `, $${value}` : ''}, access until ${expires.slice(0, 10)}`, meta: { org_id: orgId, expires } })
    await audit(gate.email, 'console', 'sales_won', account.name, { org_id: orgId, seats, value })
    return NextResponse.json({ ok: true, org_id: orgId, expires })
  }

  return jsonError('validation', 400, 'Unknown action.')
}
