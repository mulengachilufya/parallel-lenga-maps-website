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
import { logEvent } from '@/lib/ops/log'
import { getMembership, isOrgActive, type Membership } from '@/lib/teams'
import { atLeast, type ProjectRole, type WsProject, type WsRevision } from './types'
import { workspaceDatasets } from '@/lib/entitlements'

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

export type LoadedProject = WsProject & { role: ProjectRole }

/**
 * The project, with the caller's role on it, or null when it doesn't exist,
 * belongs to another org, is archived, or is private and the caller isn't
 * on it. Role rules mirror the SQL function workspace_project_role
 * (migration 037): org owner → manager; creator → manager; explicit
 * project member row; else the project's default role if it is a 'team'
 * project.
 */
export async function loadProject(gate: WorkspaceGate, projectId: string): Promise<LoadedProject | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null
  const [{ data }, { data: pm }] = await Promise.all([
    service.from('workspace_projects')
      .select('id, org_id, name, description, map_state, created_by, created_at, updated_at, visibility, default_role')
      .eq('id', projectId).eq('org_id', gate.membership.org_id).is('archived_at', null).maybeSingle(),
    service.from('workspace_project_members').select('role')
      .eq('project_id', projectId).eq('user_id', gate.user.id).maybeSingle(),
  ])
  if (!data) return null
  const p = data as WsProject & { visibility: 'team' | 'private'; default_role: 'viewer' | 'editor' }
  const role: ProjectRole | null =
    gate.membership.role === 'owner' || p.created_by === gate.user.id ? 'manager'
    : (pm?.role as ProjectRole | undefined) ?? (p.visibility === 'team' ? p.default_role : null)
  return role ? { ...p, role } : null
}

/** 403 unless the caller's role on the project is at least `need`. */
export function needRole(project: LoadedProject, need: ProjectRole): NextResponse | null {
  return atLeast(project.role, need) ? null : jsonError(`needs_${need}`, 403)
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
    void logEvent('warn', 'workspace', 'commit_failed', `A change to a project (${action}) was saved but its history entry failed: ${error.message}`, { projectId, action })
    return null
  }
  const rev = data as WsRevision & { snapshot?: unknown }
  delete rev.snapshot
  return rev
}

/**
 * May this team put this catalogue dataset on its maps? Paid teams: any.
 * Free teams: only the 3 datasets the owner chose.
 */
export function datasetAllowed(gate: WorkspaceGate, slug: string): boolean {
  const allowed = workspaceDatasets(gate.membership)
  return allowed === 'all' || (allowed as string[]).includes(slug)
}

export function lockedDataset() {
  return NextResponse.json({
    error: 'free_dataset_locked',
    message: 'Your free team includes 3 datasets. Upgrade to put any dataset on your maps.',
  }, { status: 403 })
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

/** Another member of the caller's organization, or null. */
export async function teammate(gate: WorkspaceGate, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId) || userId === gate.user.id) return null
  const { data } = await service.from('organization_members')
    .select('user_id, member_name, member_email')
    .eq('org_id', gate.membership.org_id).eq('user_id', userId).maybeSingle()
  return data
}
