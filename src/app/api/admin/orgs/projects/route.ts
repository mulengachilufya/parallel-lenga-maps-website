/**
 * Admin: see and change who is on any team's projects.
 *
 * GET /api/admin/orgs/projects?org_id=…  the team's projects, each with
 *     every team member's role on it (null = no access).
 * PUT /api/admin/orgs/projects  { project_id, user_id, role }
 *     role 'viewer' | 'editor' | 'manager' sets it, 'none' removes them
 *     from the project, null resets them to the project's default.
 *
 * Same rules as a project manager's controls (see
 * /api/workspace/projects/:id/members): only people on the team can be on
 * its projects, and the team owner and the project's creator are always
 * managers. Every change is written to the project's history.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
import { audit } from '@/lib/ops/log'
import { ROLE_LABEL, resolveRole, type ProjectRole } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function admin() {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

const bad = (message: string, status = 400) => NextResponse.json({ error: 'validation', message }, { status })
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export async function GET(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!isUuid(orgId)) return bad('org_id is required.')

  const [{ data: projects }, { data: members }] = await Promise.all([
    service.from('workspace_projects')
      .select('id, name, visibility, default_role, created_by, updated_at')
      .eq('org_id', orgId).is('archived_at', null).order('updated_at', { ascending: false }),
    service.from('organization_members').select('user_id, role, member_name, member_email').eq('org_id', orgId),
  ])
  const ids = (projects ?? []).map((p) => p.id as string)
  const { data: explicit } = ids.length
    ? await service.from('workspace_project_members').select('project_id, user_id, role').in('project_id', ids)
    : { data: [] as { project_id: string; user_id: string; role: string }[] }

  return NextResponse.json({
    projects: (projects ?? []).map((p) => ({
      id: p.id, name: p.name, visibility: p.visibility, updated_at: p.updated_at,
      people: (members ?? []).map((m) => {
        const row = (explicit ?? []).find((e) => e.project_id === p.id && e.user_id === m.user_id)
        const fixed = m.role === 'owner' || p.created_by === m.user_id
        return {
          user_id: m.user_id, name: m.member_name, email: m.member_email, fixed,
          role: resolveRole(fixed, row?.role, p.visibility, p.default_role),
        }
      }),
    })),
  })
}

export async function PUT(req: NextRequest) {
  const user = await admin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const roles = ['none', 'viewer', 'editor', 'manager']
  const role = body.role === null ? null : roles.includes(String(body.role)) ? String(body.role) as ProjectRole | 'none' : undefined
  if (!isUuid(body.project_id) || !isUuid(body.user_id) || role === undefined) return bad('project_id, user_id and role are required.')

  const { data: project } = await service.from('workspace_projects')
    .select('id, org_id, name, created_by').eq('id', body.project_id).is('archived_at', null).maybeSingle()
  if (!project) return bad('Project not found.', 404)
  const { data: m } = await service.from('organization_members').select('role, member_name, member_email')
    .eq('org_id', project.org_id).eq('user_id', body.user_id).maybeSingle()
  if (!m) return bad('Only people on the team can be on its projects. Add them to the team first.', 404)
  if (m.role === 'owner' || project.created_by === body.user_id) return bad('The team owner and the project creator are always managers.', 409)

  const { error } = role === null
    ? await service.from('workspace_project_members').delete().eq('project_id', project.id).eq('user_id', body.user_id)
    : await service.from('workspace_project_members').upsert({ project_id: project.id, user_id: body.user_id, role, added_by: user.id })
  if (error) return bad(error.message, 500)

  const name = m.member_name?.trim() || m.member_email || 'a teammate'
  const summary = role === null ? `Reset ${name} to the project default role`
    : role === 'none' ? `Removed ${name} from this project`
    : `Made ${name} a ${ROLE_LABEL[role].toLowerCase()} on this project`
  const { error: revErr } = await service.rpc('workspace_commit', {
    p_project: project.id, p_author: user.id, p_author_name: 'Lenga Maps admin', p_action: 'members', p_summary: summary,
  })
  if (revErr) console.error('[admin/orgs/projects] history entry failed', revErr)
  await audit(user.email ?? 'admin', 'console', 'project_role_set', project.name, { project_id: project.id, user_id: body.user_id, role })
  return NextResponse.json({ ok: true })
}
