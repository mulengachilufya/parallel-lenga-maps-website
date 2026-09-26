/**
 * GET /api/workspace/projects/:id/revisions  — history, newest first (no snapshots)
 */
import { NextRequest, NextResponse } from 'next/server'
import { jsonError, loadProject, requireWorkspace, service } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  if (!(await loadProject(gate.membership.org_id, id))) return jsonError('not_found', 404)

  const { data, error } = await service.from('workspace_revisions')
    .select('id, project_id, seq, author_id, author_name, action, summary, created_at')
    .eq('project_id', id).order('seq', { ascending: false }).limit(500)
  if (error) return jsonError('list_failed', 500)
  return NextResponse.json({ revisions: data ?? [] })
}
