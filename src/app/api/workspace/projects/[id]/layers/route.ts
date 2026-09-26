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
import { defaultStyle, sanitizeStyle, type LayerStyle } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const MAX_LAYERS = 40
const UPLOAD_BUCKET = 'workspace-uploads'

interface NewLayer {
  dataset_slug: string
  country:      string
  r2_key:       string
  file_format:  string
  label:        string
  style:        LayerStyle
}

/**
 * Body (any combination, one revision for the lot):
 *   items:   [{ dataset_slug, r2_key }]            Lenga catalogue files
 *   uploads: [{ path, label, file_format, style? }] files the team uploaded
 *                                                  to workspace-uploads
 * The legacy single form { dataset_slug, r2_key } is still accepted.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)

  const body = await readJson(req)
  const items: { dataset_slug?: unknown; r2_key?: unknown }[] =
    Array.isArray(body.items) ? body.items : body.dataset_slug ? [{ dataset_slug: body.dataset_slug, r2_key: body.r2_key }] : []
  const uploads: Record<string, unknown>[] = Array.isArray(body.uploads) ? body.uploads : []
  if (!items.length && !uploads.length) return jsonError('bad_request', 400)
  if (items.length + uploads.length > MAX_LAYERS) return jsonError('too_many_layers', 400)

  const rows: NewLayer[] = []

  // Catalogue files: the key must be a real file of that dataset.
  const bySlug = new Map<string, Awaited<ReturnType<typeof listFilesForDataset>>>()
  for (const it of items) {
    const spec = findDataset(str(it.dataset_slug, 60))
    const key = str(it.r2_key, 500)
    if (!spec || !key) return jsonError('bad_request', 400)
    if (!bySlug.has(spec.id)) bySlug.set(spec.id, await listFilesForDataset(spec).catch(() => []))
    const file = bySlug.get(spec.id)!.find((f) => f.r2_key === key)
    if (!file) return jsonError('unknown_file', 400)
    const variant = fileVariant(file)
    rows.push({
      dataset_slug: spec.id,
      country:      file.country_name,
      r2_key:       file.r2_key,
      file_format:  file.file_format,
      label:        [spec.name, file.country_name, variant.length <= 24 ? variant : ''].filter(Boolean).join(' · ').slice(0, 160),
      style:        defaultStyle(spec.id),
    })
  }

  // Uploads: must sit in this org + project folder and exist in storage.
  const prefix = `${gate.membership.org_id}/${id}/`
  for (const up of uploads) {
    const path = str(up.path, 400)
    if (!path.startsWith(prefix) || path.includes('..') || path.slice(prefix.length).includes('/')) return jsonError('bad_upload_path', 400)
    const name = path.slice(prefix.length)
    const { data: found } = await service.storage.from(UPLOAD_BUCKET).list(prefix.slice(0, -1), { search: name, limit: 5 })
    if (!found?.some((o) => o.name === name)) return jsonError('upload_missing', 400)
    rows.push({
      dataset_slug: 'upload',
      country:      str(up.country, 80),
      r2_key:       `upload:${path}`,
      file_format:  str(up.file_format, 60),
      label:        str(up.label, 160) || name.replace(/^[0-9a-f]{8}-/, ''),
      style:        sanitizeStyle(up.style, defaultStyle('upload')),
    })
  }

  const { data: existing } = await service
    .from('workspace_layers').select('sort_order').eq('project_id', id)
    .order('sort_order', { ascending: false })
  if ((existing?.length ?? 0) + rows.length > MAX_LAYERS) return jsonError('too_many_layers', 400)
  let top = existing?.[0]?.sort_order ?? -1

  const { data: layers, error } = await service
    .from('workspace_layers')
    .insert(rows.map((r) => ({ ...r, project_id: id, sort_order: ++top, added_by: gate.user.id, added_by_name: gate.name })))
    .select('*')
  if (error || !layers?.length) return jsonError('add_failed', 500)

  const names = layers.map((l) => `"${l.label}"`)
  const summary = layers.length === 1
    ? `Added layer ${names[0]}`
    : `Added ${layers.length} layers: ${names.slice(0, 4).join(', ')}${layers.length > 4 ? ` and ${layers.length - 4} more` : ''}`
  const rev = await commit(id, gate, 'layer.add', summary)
  return NextResponse.json({ layers, layer: layers[0], rev }, { status: 201 })
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
