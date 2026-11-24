// src/lib/workspace/server.ts
//
// Server-only helpers for the team workspace API routes. Every route goes:
//   requireWorkspace()  → signed in + member of an ACTIVE organization
//   loadProject()       → project belongs to that org (never trust the URL)
//   mutateProject()    → apply changes and append a revision in one transaction

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { getMembership, isOrgActive, type Membership } from '@/lib/teams'
import { atLeast, resolveRole, type ProjectRole, type WsProject } from './types'
import { workspaceDatasets } from '@/lib/entitlements'
import type { DatasetSlug } from '@/lib/pricing'

export const service: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export interface WorkspaceGate {
  user:       User
  membership: Membership
  name:       string
  /** Datasets this team's projects may use ('all' for a paid team). */
  allowed:    'all' | DatasetSlug[]
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

  const [{ data: row }, allowed] = await Promise.all([
    service
      .from('organization_members')
      .select('member_name, member_email')
      .eq('org_id', membership.org_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    workspaceDatasets(service, membership),
  ])

  const name =
    row?.member_name?.trim() ||
    (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '') ||
    row?.member_email || user.email || 'Team member'

  return { user, membership, name, allowed }
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
  const role = resolveRole(gate.membership.role === 'owner' || p.created_by === gate.user.id, pm?.role, p.visibility, p.default_role)
  return role ? { ...p, role } : null
}

/** 403 unless the caller's role on the project is at least `need`. */
export function needRole(project: LoadedProject, need: ProjectRole): NextResponse | null {
  return atLeast(project.role, need) ? null : jsonError(`needs_${need}`, 403)
}

export async function mutateProject(projectId: string, gate: WorkspaceGate, action: string, summary: string, payload: unknown) {
  const { data, error } = await service.rpc('mutate_workspace_project', {
    p_project: projectId, p_org: gate.membership.org_id, p_actor: gate.user.id, p_name: gate.name,
    p_action: action, p_summary: summary, p_payload: payload,
  })
  if (!error) return { data: data as Record<string, unknown> }
  if (error.code === '42501') return { denied: jsonError('workspace_access_denied', 403) }
  if (error.code === 'P0002') return { denied: jsonError('not_found', 404) }
  if (['too_many_layers', 'order_mismatch', 'upload_missing'].includes(error.message)) {
    return { denied: jsonError(error.message, 400) }
  }
  console.error('[workspace] change failed', { projectId, action, error })
  return { denied: jsonError('change_failed', 500) }
}

export async function createProject(gate: WorkspaceGate, projectId: string, project: object,
  layers: object[], bookmarks: object[], summary: string, templateSummary: string | null = null) {
  const { error } = await service.rpc('create_workspace_project', {
    p_project: projectId, p_org: gate.membership.org_id, p_actor: gate.user.id, p_name: gate.name,
    p_project_data: project, p_layers: layers, p_bookmarks: bookmarks, p_summary: summary,
    p_template_summary: templateSummary,
  })
  if (!error) return null
  console.error('[workspace] create failed', { projectId, error })
  return jsonError(error.message === 'project_full' ? 'project_full' : 'create_failed', error.message === 'project_full' ? 413 : 500)
}

/**
 * May this team put this catalogue dataset on its maps, load it and export
 * it? Paid teams: any. Free teams: any dataset one of its members picked.
 * This is the only gate for Lenga data inside the workspace.
 */
export function datasetAllowed(gate: WorkspaceGate, slug: string): boolean {
  return gate.allowed === 'all' || (gate.allowed as string[]).includes(slug)
}

export function lockedDataset() {
  return NextResponse.json({
    error: 'free_dataset_locked',
    message: 'This dataset is not one your team members chose. On a free team, projects use the datasets each member picked on their dashboard. Upgrade to put any dataset on your maps.',
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

export async function projectUploadBytes(projectId: string): Promise<number> {
  const { data, error } = await service.rpc('workspace_upload_usage', { p_project: projectId })
  if (error) throw error
  return Number(data)
}
