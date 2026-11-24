/**
 * POST /api/workspace/projects/:id/layers  — { dataset_slug, r2_key } add a layer
 * PUT  /api/workspace/projects/:id/layers  — { order: layerId[] } top → bottom
 *
 * Draw order: sort_order ascending is drawn first (bottom of the stack).
 */
import { NextRequest, NextResponse } from 'next/server'
import { findDataset, listFilesForDataset } from '@/lib/api-datasets'
import { fileVariant } from '@/lib/workspace/catalog'
import { objectSize } from '@/lib/r2'
import { mutateProject, datasetAllowed, jsonError, loadProject, lockedDataset, needRole, readJson, requireWorkspace, str } from '@/lib/workspace/server'
import { MAX_UPLOAD_BYTES, UPLOAD_PREFIX } from '@/lib/workspace/upload-limits'
import { defaultStyle, sanitizeStyle, type LayerStyle } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const MAX_LAYERS = 40

interface NewLayer {
  dataset_slug: string
  country:      string
  r2_key:       string
  file_format:  string
  label:        string
  style:        LayerStyle
  file_bytes?:  number
}

/**
 * Body (any combination, one revision for the lot):
 *   items:   [{ dataset_slug, r2_key }]            Lenga catalogue files
 *   uploads: [{ path, label, file_format, style? }] files the team uploaded
 *                                                  to R2 (path = the R2 key from
 *                                                  POST …/uploads)
 * The legacy single form { dataset_slug, r2_key } is still accepted.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)
  { const denied = needRole(project, 'editor'); if (denied) return denied }

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
    const spec = findDataset(str(it?.dataset_slug, 60))
    const key = str(it?.r2_key, 500)
    if (!spec || !key) return jsonError('bad_request', 400)
    if (!datasetAllowed(gate, spec.id)) return lockedDataset()
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

  // Uploads: must sit in this org + project folder in R2, and fit the
  // project's storage allowance at their real stored size.
  const prefix = `${UPLOAD_PREFIX}/${gate.membership.org_id}/${id}/`
  for (const up of uploads) {
    const path = str(up?.path, 400)
    if (!path.startsWith(prefix) || path.includes('..') || path.slice(prefix.length).includes('/')) return jsonError('bad_upload_path', 400)
    const name = path.slice(prefix.length)
    const size = await objectSize(path)
    if (size === null) return jsonError('upload_missing', 400)
    if (size > MAX_UPLOAD_BYTES) return jsonError('file_too_large', 413)
    rows.push({
      dataset_slug: 'upload',
      country:      str(up.country, 80),
      r2_key:       path,
      file_format:  str(up.file_format, 60),
      label:        str(up.label, 160) || name.replace(/^[0-9a-f]{8}-/, ''),
      style:        sanitizeStyle(up.style, defaultStyle('upload')),
      file_bytes:   size,
    })
  }
  const names = rows.map((layer) => `"${layer.label}"`)
  const summary = rows.length === 1
    ? `Added layer ${names[0]}`
    : `Added ${rows.length} layers: ${names.slice(0, 4).join(', ')}${rows.length > 4 ? ` and ${rows.length - 4} more` : ''}`
  const result = await mutateProject(id, gate, 'layer.add', summary, rows)
  return result.denied ?? NextResponse.json(result.data, { status: 201 })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)
  { const denied = needRole(project, 'editor'); if (denied) return denied }

  const body = await readJson(req)
  if (!Array.isArray(body.order) || body.order.some((item) => typeof item !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item))) {
    return jsonError('order_mismatch', 400)
  }
  const result = await mutateProject(id, gate, 'layer.order', 'Reordered layers', body.order)
  return result.denied ?? NextResponse.json({ ok: true, ...result.data })
}
