// src/lib/teams-admin.ts
//
// Server-only: create a team organization with its owner. Used by
// /api/admin/orgs (manual provisioning) and /api/admin/sales (pilots and
// won deals) so both follow the same rules.

import type { SupabaseClient } from '@supabase/supabase-js'

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
  | { ok: true; org: Record<string, unknown> & { id: string } }
  | { ok: false; status: number; error: string; message: string }

export async function provisionOrg(db: SupabaseClient, input: ProvisionInput): Promise<ProvisionResult> {
  const ownerEmail = input.ownerEmail.trim().toLowerCase()

  // The owner must already have an account: provisioning attaches a seat to
  // an existing profile, it does not create logins.
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, full_name, org_id')
    .ilike('email', ownerEmail)
    .maybeSingle()
  if (!profile) {
    return { ok: false, status: 404, error: 'owner_not_found', message: `No Lenga Maps account exists for ${ownerEmail}. Ask them to sign up first.` }
  }
  if (profile.org_id) {
    return { ok: false, status: 409, error: 'already_in_org', message: 'That account already belongs to an organization.' }
  }

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
