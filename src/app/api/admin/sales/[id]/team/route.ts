/**
 * POST /api/admin/sales/:id/team — { action: 'paid', contact_id?, seats, value_usd? }
 *
 * Payment has arrived: starts 3 months of paid team access, moves the
 * account to "Won" and books onboarding. The team is, in order:
 *   1. the team already linked to this account (usually their free team),
 *   2. the team the chosen owner is already on (a free team they started),
 *   3. a new team with the chosen contact as owner.
 * A free team becomes paid in place, keeping its projects and members.
 * The owner must already have a Lenga Maps account.
 *
 * POST { action: 'link' } — look for a team their people are on now.
 */
import { NextRequest, NextResponse } from 'next/server'
import { accessExpiry } from '@/lib/pricing'
import { provisionOrg, upgradeOrg } from '@/lib/teams-admin'
import { dueDate } from '@/lib/sales/playbook'
import {
  countryName, db, isUuid, jsonError, linkTeams, loadAccount, logActivity, moveStage, num, requireAdmin,
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

  if (body.action === 'link') {
    const linked = await linkTeams(id)
    return NextResponse.json({ ok: true, linked: linked.length > 0 })
  }

  if (body.action === 'paid') {
    let expires = accessExpiry()
    let orgId = account.org_id
    let ownerContact: string | null = null
    if (!orgId && isUuid(body.contact_id)) {
      // The owner may already have started a free team: upgrade that one.
      const { data: c } = await db.from('sales_contacts').select('id, email').eq('id', body.contact_id).eq('account_id', id).maybeSingle()
      if (c?.email) {
        const { data: prof } = await db.from('profiles').select('org_id').ilike('email', c.email).maybeSingle()
        if (prof?.org_id) { orgId = prof.org_id as string; ownerContact = c.id }
      }
    }
    if (orgId) {
      // A paid team renewing early keeps its remaining time; a free team
      // starts its 3 months today.
      const { data: cur } = await db.from('organizations').select('plan, access_expires_at').eq('id', orgId).maybeSingle()
      if (cur?.plan === 'paid' && cur.access_expires_at) expires = accessExpiry(cur.access_expires_at)
      const r = await upgradeOrg(db, orgId, { seats, price: value, expiresAt: expires })
      if (!r.ok) return jsonError('update_failed', 500, r.message)
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
