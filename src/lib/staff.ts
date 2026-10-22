// src/lib/staff.ts
//
// Who can open which part of /admin. Server only.
//
//   * Owners (OWNER_EMAILS) and ADMIN_EMAILS: everything.
//   * Staff (table admin_staff, managed by the owners at /admin/team): only
//     the areas they were given.
//
// Some things stay with the owners whatever the areas say: managing staff,
// the ops console, and deleting (pipeline organisations, orders).

import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail, isOwnerEmail } from '@/lib/admin'

export const AREAS = [
  { id: 'sales',            label: 'Sales pipeline',     help: 'Prospects, email drafts, LinkedIn, quote requests.' },
  { id: 'partners',         label: 'Partnerships',       help: 'The partnerships board, drafts, LinkedIn and research.' },
  { id: 'payments',         label: 'Payments (view)',    help: 'See every payment and how much came in.' },
  { id: 'payments_approve', label: 'Approve payments',   help: 'Approve or reject payments, which turns plans on or off.' },
  { id: 'users',            label: 'Users',              help: 'Every account, plan and signup date.' },
  { id: 'downloads',        label: 'Downloads',          help: 'Who downloads what.' },
  { id: 'orgs',             label: 'Organizations',      help: 'Team accounts, seats and members.' },
] as const

export type Area = typeof AREAS[number]['id']
export const isArea = (v: unknown): v is Area => AREAS.some((a) => a.id === v)

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export interface Access {
  email: string
  owner: boolean
  /** Owner or ADMIN_EMAILS: every area. */
  full: boolean
  areas: Area[]
}

/** What this email may open. null = nothing. */
export async function accessFor(email: string | null | undefined): Promise<Access | null> {
  if (!email) return null
  const e = email.toLowerCase()
  if (isAdminEmail(e)) return { email: e, owner: isOwnerEmail(e), full: true, areas: AREAS.map((a) => a.id) }
  const { data } = await service.from('admin_staff').select('areas').eq('email', e).maybeSingle()
  if (!data) return null
  const areas = (data.areas as string[]).filter(isArea)
  return areas.length ? { email: e, owner: false, full: false, areas } : null
}

/** The signed-in user's access, or null. */
export async function currentAccess(): Promise<Access | null> {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  return accessFor(user?.email)
}

/** True when they hold at least one of these areas. */
export const can = (a: Access | null, ...areas: Area[]) => !!a && areas.some((x) => a.areas.includes(x))
