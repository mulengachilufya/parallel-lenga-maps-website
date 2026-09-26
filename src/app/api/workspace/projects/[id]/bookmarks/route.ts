/**
 * POST /api/workspace/projects/:id/bookmarks  — { name, lng, lat, zoom } save a view
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  commit, jsonError, loadProject, readJson, requireWorkspace, service, str,
} from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)

  const body = await readJson(req)
  const name = str(body.name, 120)
  const lng  = num(body.lng, -180, 180)
  const lat  = num(body.lat, -85, 85)
  const zoom = num(body.zoom, 0, 22)
  if (!name || lng === null || lat === null || zoom === null) return jsonError('bad_request', 400)

  const { data: bookmark, error } = await service.from('workspace_bookmarks')
    .insert({
      project_id: id, name, lng, lat, zoom,
      created_by: gate.user.id, created_by_name: gate.name,
    })
    .select('*').single()
  if (error || !bookmark) return jsonError('save_failed', 500)

  const rev = await commit(id, gate, 'bookmark.add', `Saved the view "${name}"`)
  return NextResponse.json({ bookmark, rev }, { status: 201 })
}
