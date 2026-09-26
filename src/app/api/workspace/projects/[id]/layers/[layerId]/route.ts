/**
 * PATCH  /api/workspace/projects/:id/layers/:layerId  — { label?, style? }
 * DELETE /api/workspace/projects/:id/layers/:layerId
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  commit, jsonError, loadProject, readJson, requireWorkspace, service, str,
} from '@/lib/workspace/server'
import { defaultStyle, sanitizeStyle, type LayerStyle, type WsLayer } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; layerId: string }> }

async function loadLayer(projectId: string, layerId: string): Promise<WsLayer | null> {
  if (!/^[0-9a-f-]{36}$/i.test(layerId)) return null
  const { data } = await service.from('workspace_layers').select('*')
    .eq('id', layerId).eq('project_id', projectId).maybeSingle()
  return (data as WsLayer | null) ?? null
}

function describeStyleChange(a: LayerStyle, b: LayerStyle): string[] {
  const out: string[] = []
  if (a.color !== b.color) out.push(`colour ${a.color} → ${b.color}`)
  if (a.opacity !== b.opacity) out.push(`opacity ${Math.round(a.opacity * 100)}% → ${Math.round(b.opacity * 100)}%`)
  if (a.width !== b.width) out.push(`line ${a.width}px → ${b.width}px`)
  if (a.fill !== b.fill) out.push(b.fill ? 'fill on' : 'fill off')
  if (a.ramp !== b.ramp) out.push(`ramp ${a.ramp} → ${b.ramp}`)
  return out
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, layerId } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)
  const layer = await loadLayer(id, layerId)
  if (!layer) return jsonError('not_found', 404)

  const body = await readJson(req)
  const patch: Partial<WsLayer> = {}
  const notes: string[] = []

  if ('label' in body) {
    const label = str(body.label, 160)
    if (!label) return jsonError('label_required', 400)
    if (label !== layer.label) { patch.label = label; notes.push(`renamed "${layer.label}" to "${label}"`) }
  }
  if ('style' in body) {
    const current = { ...defaultStyle(layer.dataset_slug), ...layer.style }
    const next = sanitizeStyle(body.style, current)
    const changes = describeStyleChange(current, next)
    if (changes.length) { patch.style = next; notes.push(`restyled "${patch.label ?? layer.label}" (${changes.join(', ')})`) }
  }
  if (!notes.length) return NextResponse.json({ ok: true, unchanged: true })

  const { data: updated, error } = await service.from('workspace_layers')
    .update(patch).eq('id', layerId).eq('project_id', id).select('*').single()
  if (error) return jsonError('update_failed', 500)

  const summary = notes.join('; ')
  const rev = await commit(id, gate, 'layer.edit', summary.charAt(0).toUpperCase() + summary.slice(1))
  return NextResponse.json({ layer: updated, rev })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id, layerId } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)
  const layer = await loadLayer(id, layerId)
  if (!layer) return jsonError('not_found', 404)

  const { error } = await service.from('workspace_layers').delete().eq('id', layerId).eq('project_id', id)
  if (error) return jsonError('delete_failed', 500)

  const rev = await commit(id, gate, 'layer.remove', `Removed layer "${layer.label}"`)
  return NextResponse.json({ ok: true, rev })
}
