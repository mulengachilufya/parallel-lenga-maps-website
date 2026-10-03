// src/lib/entitlements.ts
//
// Server-only. The one answer to "what can this account download?", used by
// every dataset route, the workspace catalogue and GET /api/account/access.
//
//   Paid (individual or team plan, not expired)  every dataset (an
//                                                Individual licence: those
//                                                added by updates_until)
//   Free                                         the 3 datasets the person
//                                                picked, and nothing else
//
// Free teams do not choose datasets of their own. A free team's projects
// can use every dataset any of its members picked (the union of their
// picks), and inside those projects every member can load and export all
// of them. Outside the projects each person still downloads only their own
// 3: the team's datasets are reachable only through the workspace routes,
// which check workspaceDatasets(), never through accessFor().

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FREE_DATASET_LIMIT, cleanPicks, coveredByUpdates, getUserState, type DatasetSlug, type UserState,
} from './pricing'
import { getMembership, isOrgActive, listMemberships, type Membership } from './teams'

export interface Access {
  state:      UserState
  paid:       boolean
  /** Datasets a free account can download (empty for paid: they get all). */
  datasets:   DatasetSlug[]
  personal:   { picks: DatasetSlug[]; left: number }
  /** Individual licence: datasets added after this date are not included
   *  (null = no limit). */
  updatesUntil: string | null
  team:       null | {
    org_id: string; name: string; plan: 'paid' | 'free'; role: 'owner' | 'member'
    active: boolean
    /** A free team's project datasets: every member's picks combined (usable in projects only). */
    picks: DatasetSlug[]
    left: number; seats: number
  }
}

export async function accessFor(db: SupabaseClient, userId: string, membership?: Membership | null): Promise<Access> {
  const [{ data: profile }, m] = await Promise.all([
    db.from('profiles').select('plan, plan_status, plan_expires_at, free_datasets, updates_until').eq('id', userId).maybeSingle(),
    membership !== undefined ? Promise.resolve(membership) : getMembership(db, userId),
  ])
  const state = getUserState(profile?.plan, profile?.plan_status, profile?.plan_expires_at)
  const personal = cleanPicks(profile?.free_datasets)
  const plan = (m?.org.plan ?? 'paid') as 'paid' | 'free'
  const team = m ? {
    org_id: m.org_id, name: m.org.name, plan, role: m.role,
    active: isOrgActive(m), picks: plan === 'free' ? await teamDatasets(db, m) : [], left: 0, seats: m.org.seat_count,
  } : null

  // plan 'team' on the profile comes from joining a paid team. It counts as
  // paid unless every team the person is on is a free one (so opening a
  // free team never takes away a paid team's access).
  const teamPlanOnlyFree = state === 'team' && !!m && m.org.plan === 'free'
    && !(await listMemberships(db, userId)).some((x) => x.org.plan !== 'free')
  const paid = state !== 'free' && !teamPlanOnlyFree
  const updatesUntil: string | null = paid && state === 'individual' ? (profile?.updates_until ?? null) : null
  return {
    state: paid ? state : 'free',
    paid,
    // Personal picks only: a teammate's datasets are for the team's projects.
    // (A licence holder keeps their free picks too, for any dataset added
    // after their updates ran out.)
    datasets: paid && !updatesUntil ? [] : personal,
    personal: { picks: personal, left: Math.max(0, FREE_DATASET_LIMIT - personal.length) },
    // Only the Individual licence is limited; a team plan always gets updates.
    updatesUntil,
    team,
  }
}

export function canDownload(a: Access, slug: string): boolean {
  if (a.paid) return coveredByUpdates(slug, a.updatesUntil) || (a.datasets as string[]).includes(slug)
  return (a.datasets as string[]).includes(slug)
}

/**
 * The datasets a free team's projects can use: every current member's
 * personal picks combined, plus any picks the team itself made before teams
 * stopped choosing their own (kept so no existing project loses a layer).
 * Service-role client only.
 */
export async function teamDatasets(db: SupabaseClient, m: Membership): Promise<DatasetSlug[]> {
  const { data: members, error } = await db.from('organization_members').select('user_id').eq('org_id', m.org_id)
  if (error) console.error('[entitlements] team members lookup failed', error)
  const ids = (members ?? []).map((r) => r.user_id as string).filter(Boolean)
  const { data: profiles, error: pErr } = ids.length
    ? await db.from('profiles').select('free_datasets').in('id', ids)
    : { data: [], error: null }
  if (pErr) console.error('[entitlements] team picks lookup failed', pErr)
  const all = [cleanPicks(m.org.free_datasets), ...(profiles ?? []).map((p) => cleanPicks(p.free_datasets))].flat()
  return [...new Set(all)]
}

/**
 * Datasets a team workspace may put on its maps, load and export:
 * everything for a paid team, the members' combined picks for a free one.
 */
export async function workspaceDatasets(db: SupabaseClient, m: Membership): Promise<'all' | DatasetSlug[]> {
  return m.org.plan === 'free' ? teamDatasets(db, m) : 'all'
}

/**
 * Add picks (never remove or swap). Returns the new list, or an error
 * message when the request would go over the limit.
 */
export function addPicks(current: DatasetSlug[], wanted: unknown): { picks: DatasetSlug[] } | { error: string } {
  const add = cleanPicks(wanted).filter((s) => !current.includes(s))
  if (!add.length) return { error: 'Choose at least one dataset you have not picked yet.' }
  const next = [...current, ...add]
  if (next.length > FREE_DATASET_LIMIT) {
    return { error: `The free plan includes ${FREE_DATASET_LIMIT} datasets. You have ${Math.max(0, FREE_DATASET_LIMIT - current.length)} left to choose.` }
  }
  return { picks: next }
}
