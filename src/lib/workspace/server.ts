// src/lib/workspace/server.ts
//
// Server-only helpers for the team workspace API routes. Every route goes:
//   requireWorkspace()  → signed in + member of an ACTIVE organization
//   loadProject()       → project belongs to that org (never trust the URL)
//   …mutate with the service client…
//   commit()            → append a revision (Phase 4 history)

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getMembership, isOrgActive, type Membership } from '@/lib/teams'
import type { WsProject, WsRevision } from './types'

export const service: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export interface WorkspaceGate {
  user:       User
  membership: Membership
  name:       string
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

/** Signed-in member of an active org, or a ready-to-return error response. */
export async function requireWorkspace(): Promise<WorkspaceGate | { denied: NextResponse }> {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { denied: jsonError('unauthorized', 401) }

  const membership = await getMembership(service, user.id)
  if (!membership) return { denied: jsonError('no_team', 403) }
  if (!isOrgActive(membership)) return { denied: jsonError('team_inactive', 403) }

  const { data: row } = await service
    .from('organization_members')
    .select('member_name, member_email')
    .eq('org_id', membership.org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const name =
    row?.member_name?.trim() ||
    (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '') ||
    row?.member_email || user.email || 'Team member'

  return { user, membership, name }
}

export async function loadProject(orgId: string, projectId: string): Promise<WsProject | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null
  const { data } = await service
    .from('workspace_projects')
    .select('id, org_id, name, description, map_state, created_by, created_at, updated_at')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .is('archived_at', null)
    .maybeSingle()
  return (data as WsProject | null) ?? null
}

/** Append the current project state as the next revision. */
export async function commit(
  projectId: string, gate: WorkspaceGate, action: string, summary: string,
): Promise<WsRevision | null> {
  const { data, error } = await service.rpc('workspace_commit', {
    p_project:     projectId,
    p_author:      gate.user.id,
    p_author_name: gate.name,
    p_action:      action,
    p_summary:     summary.slice(0, 300),
  })
  if (error) {
    console.error('[workspace] commit failed', { projectId, action, error })
    return null
  }
  const rev = data as WsRevision & { snapshot?: unknown }
  delete rev.snapshot
  return rev
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
