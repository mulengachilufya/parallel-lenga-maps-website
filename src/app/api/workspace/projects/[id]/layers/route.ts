/**
 * POST /api/workspace/projects/:id/layers  — { dataset_slug, r2_key } add a layer
 * PUT  /api/workspace/projects/:id/layers  — { order: layerId[] } top → bottom
 *
 * Draw order: sort_order ascending is drawn first (bottom of the stack).
 */
import { NextRequest, NextResponse } from 'next/server'
import { findDataset, listFilesForDataset } from '@/lib/api-datasets'
import { fileVariant } from '@/lib/workspace/catalog'
import {
  commit, jsonError, loadProject, readJson, requireWorkspace, service, str,
} from '@/lib/workspace/server'
import { defaultStyle } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const MAX_LAYERS = 40

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)

  const body = await readJson(req)
  const slug  = str(body.dataset_slug, 60)
  const r2Key = str(body.r2_key, 500)
  const spec  = findDataset(slug)
  if (!spec || !r2Key) return jsonError('bad_request', 400)

  // The key must be a real file of that dataset: never trust a client key.
  const files = await listFilesForDataset(spec).catch(() => [])
  const file  = files.find((f) => f.r2_key === r2Key)
  if (!file) return jsonError('unknown_file', 400)

  const { data: existing } = await service
    .from('workspace_layers').select('sort_order').eq('project_id', id)
    .order('sort_order', { ascending: false })
  if ((existing?.length ?? 0) >= MAX_LAYERS) return jsonError('too_many_layers', 400)
  const top = existing?.[0]?.sort_order ?? -1

  const variant = fileVariant(file)
  const label = [spec.name, file.country_name, variant.length <= 24 ? variant : ''].filter(Boolean).join(' · ')

  const { data: layer, error } = await service
    .from('workspace_layers')
    .insert({
      project_id:    id,
      dataset_slug:  spec.id,
      country:       file.country_name,
      r2_key:        file.r2_key,
      file_format:   file.file_format,
      label:         label.slice(0, 160),
      style:         defaultStyle(spec.id),
      sort_order:    top + 1,
      added_by:      gate.user.id,
      added_by_name: gate.name,
    })
    .select('*')
    .single()
  if (error || !layer) return jsonError('add_failed', 500)

  const rev = await commit(id, gate, 'layer.add', `Added layer "${layer.label}"`)
  return NextResponse.json({ layer, rev }, { status: 201 })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)

  const body = await readJson(req)
  const order = Array.isArray(body.order) ? body.order.filter((x): x is string => typeof x === 'string') : []

  const { data: layers } = await service.from('workspace_layers').select('id, sort_order').eq('project_id', id)
  const known = new Set((layers ?? []).map((l) => l.id))
  if (order.length !== known.size || !order.every((l) => known.has(l))) return jsonError('order_mismatch', 400)

  // order is top → bottom; the top layer gets the highest sort_order.
  const n = order.length
  const updates = order.map((layerId, i) =>
    service.from('workspace_layers').update({ sort_order: n - 1 - i }).eq('id', layerId).eq('project_id', id))
  const results = await Promise.all(updates)
  if (results.some((r) => r.error)) return jsonError('reorder_failed', 500)

  const rev = await commit(id, gate, 'layer.order', 'Reordered layers')
  return NextResponse.json({ ok: true, rev })
}
