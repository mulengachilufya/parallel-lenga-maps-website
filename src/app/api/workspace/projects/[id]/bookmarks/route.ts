/**
 * POST /api/workspace/projects/:id/bookmarks  — { name, lng, lat, zoom } save a view
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  mutateProject, jsonError, loadProject, readJson, requireWorkspace, str, needRole} from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)
  { const denied = needRole(project, 'editor'); if (denied) return denied }

  const body = await readJson(req)
  const name = str(body.name, 120)
  const lng  = num(body.lng, -180, 180)
  const lat  = num(body.lat, -85, 85)
  const zoom = num(body.zoom, 0, 22)
  if (!name || lng === null || lat === null || zoom === null) return jsonError('bad_request', 400)

  const result = await mutateProject(id, gate, 'bookmark.add', `Saved the view "${name}"`, { name, lng, lat, zoom })
  return result.denied ?? NextResponse.json(result.data, { status: 201 })
}
