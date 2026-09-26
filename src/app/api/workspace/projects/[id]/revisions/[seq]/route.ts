/**
 * GET  /api/workspace/projects/:id/revisions/:seq  — the revision, its snapshot,
 *      and the previous revision's snapshot (for the diff view)
 * POST /api/workspace/projects/:id/revisions/:seq  — restore the project to this
 *      revision. History is never rewritten: the restore is a new revision.
 */
import { NextRequest, NextResponse } from 'next/server'
import { jsonError, loadProject, requireWorkspace, service } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; seq: string }> }

function parseSeq(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, seq: rawSeq } = await params
  const seq = parseSeq(rawSeq)
  if (!seq || !(await loadProject(gate.membership.org_id, id))) return jsonError('not_found', 404)

  const { data: revs } = await service.from('workspace_revisions').select('*')
    .eq('project_id', id).in('seq', [seq, seq - 1])
  const rev  = revs?.find((r) => r.seq === seq)
  const prev = revs?.find((r) => r.seq === seq - 1)
  if (!rev) return jsonError('not_found', 404)

  const { snapshot, ...meta } = rev
  return NextResponse.json({ revision: meta, snapshot, previous: prev?.snapshot ?? null })
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, seq: rawSeq } = await params
  const seq = parseSeq(rawSeq)
  if (!seq || !(await loadProject(gate.membership.org_id, id))) return jsonError('not_found', 404)

  const { data, error } = await service.rpc('workspace_restore', {
    p_project: id, p_seq: seq, p_author: gate.user.id, p_author_name: gate.name,
  })
  if (error) {
    console.error('[workspace] restore failed', { id, seq, error })
    return jsonError(error.code === 'P0002' ? 'not_found' : 'restore_failed', error.code === 'P0002' ? 404 : 500)
  }
  const { snapshot: _omit, ...rev } = data as Record<string, unknown>
  void _omit
  return NextResponse.json({ ok: true, rev })
}
