// src/lib/teams-admin.ts
//
// Server-only: create a team organization with its owner. Used by
// /api/admin/orgs (manual provisioning) and /api/admin/sales (pilots and
// won deals) so both follow the same rules.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, teamInviteEmail } from './email'

export interface ProvisionInput {
  name:        string
  ownerEmail:  string
  seats:       number
  sector?:     string | null
  region?:     string | null
  price?:      number | null
  notes?:      string | null
  expiresAt:   string | null      // null = permanent
}

export type ProvisionResult =
  | { ok: true; org: Record<string, unknown> & { id: string }; invited?: boolean; emailSent?: boolean }
  | { ok: false; status: number; error: string; message: string }

export async function provisionOrg(db: SupabaseClient, input: ProvisionInput): Promise<ProvisionResult> {
  const ownerEmail = input.ownerEmail.trim().toLowerCase()

  // An owner with an account gets the seat now; one without is invited.
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, full_name, org_id')
    .ilike('email', ownerEmail)
    .maybeSingle()

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .insert({
      name:              input.name.slice(0, 200),
      sector:            input.sector ? input.sector.slice(0, 40) : null,
      region:            input.region ? input.region.slice(0, 200) : null,
      seat_count:        Math.max(1, Math.round(input.seats)),
      contact_email:     ownerEmail,
      monthly_price_usd: input.price ?? null,
      notes:             input.notes ? input.notes.slice(0, 2000) : null,
      access_expires_at: input.expiresAt,
    })
    .select('*')
    .single()
  if (orgErr || !org) {
    console.error('[teams-admin] create failed:', orgErr)
    return { ok: false, status: 500, error: 'create_failed', message: orgErr?.message ?? 'Could not create the organization.' }
  }

  // No account yet: the owner gets an emailed invite. Signing up from its
  // link makes them the owner, on the plan this team was given.
  if (!profile) {
    const { data: invite, error: invErr } = await db.from('organization_invites')
      .insert({ org_id: org.id, email: ownerEmail, role: 'owner' }).select('token').single()
    if (invErr || !invite) {
      await db.from('organizations').delete().eq('id', org.id)
      return { ok: false, status: 500, error: 'invite_failed', message: invErr?.message ?? 'Could not invite the owner.' }
    }
    const emailSent = await sendEmail(teamInviteEmail(ownerEmail, org.name, 'Lenga Maps', invite.token)).catch(() => false)
    return { ok: true, org, invited: true, emailSent }
  }

  const { error: memErr } = await db.from('organization_members').insert({
    org_id:       org.id,
    user_id:      profile.id,
    role:         'owner',
    member_name:  profile.full_name,
    member_email: profile.email,
    joined_at:    new Date().toISOString(),
  })
  if (memErr) {
    console.error('[teams-admin] owner membership failed:', memErr)
    await db.from('organizations').delete().eq('id', org.id) // don't leave a headless org
    return { ok: false, status: 500, error: 'member_failed', message: memErr.message }
  }

  // Entitlement: members ride plan='team' and share the org's expiry.
  await db.from('profiles')
    .update({ plan: 'team', plan_status: 'active', plan_expires_at: input.expiresAt })
    .eq('id', profile.id)

  return { ok: true, org }
}

/**
 * A team has paid: start (or extend) its 3 months. Turns a free team into a
 * paid one, keeping its projects and members; every member moves onto the
 * team plan. Used by Admin → Organizations and the sales pipeline.
 */
export async function upgradeOrg(db: SupabaseClient, orgId: string, opts: {
  seats: number; price?: number | null; expiresAt: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await db.from('organizations').update({
    plan: 'paid', status: 'active', seat_count: Math.max(1, Math.round(opts.seats)),
    access_expires_at: opts.expiresAt, expiry_notice_sent: null,
    ...(opts.price !== null && opts.price !== undefined ? { monthly_price_usd: opts.price } : {}),
  }).eq('id', orgId)
  if (error) return { ok: false, message: error.message }
  const ids = ((await db.from('organization_members').select('user_id').eq('org_id', orgId)).data ?? []).map((m) => m.user_id)
  if (ids.length) {
    await db.from('profiles')
      .update({ plan: 'team', plan_status: 'active', plan_expires_at: opts.expiresAt, expiry_reminder_sent_at: null })
      .in('id', ids)
  }
  return { ok: true }
}
