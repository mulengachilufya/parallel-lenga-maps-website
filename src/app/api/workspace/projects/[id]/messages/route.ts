/**
 * GET  /api/workspace/projects/:id/messages  — the latest 500, oldest first
 * POST /api/workspace/projects/:id/messages  — { body, parent_id?, lng?, lat?, mentions? }
 *
 * Mentions must be members of the same org; each (other than the author)
 * gets an email. New messages reach open workstations through Realtime.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, workspaceMentionEmail } from '@/lib/email'
import { jsonError, loadProject, readJson, requireWorkspace, service } from '@/lib/workspace/server'
import type { WsMessage } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f-]{36}$/i

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)

  const { data, error } = await service.from('workspace_messages').select('*')
    .eq('project_id', id).order('created_at', { ascending: false }).limit(500)
  if (error) return jsonError('list_failed', 500)
  return NextResponse.json({ messages: (data ?? []).reverse() })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate.membership.org_id, id)
  if (!project) return jsonError('not_found', 404)

  const input = await readJson(req)
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n/g, '\n').trim().slice(0, 4000) : ''
  if (!body) return jsonError('body_required', 400)

  let parentId: string | null = null
  if (typeof input.parent_id === 'string' && UUID.test(input.parent_id)) {
    const { data: parent } = await service.from('workspace_messages')
      .select('id, parent_id').eq('id', input.parent_id).eq('project_id', id).maybeSingle()
    if (!parent) return jsonError('parent_not_found', 400)
    parentId = parent.parent_id ?? parent.id   // one level of threading
  }

  const lng = typeof input.lng === 'number' && Number.isFinite(input.lng) && Math.abs(input.lng) <= 180 ? input.lng : null
  const lat = typeof input.lat === 'number' && Number.isFinite(input.lat) && Math.abs(input.lat) <= 85 ? input.lat : null
  const pinned = lng !== null && lat !== null

  const { data: members } = await service.from('organization_members')
    .select('user_id, member_email').eq('org_id', gate.membership.org_id)
  const memberIds = new Map((members ?? []).map((m) => [m.user_id as string, m.member_email as string | null]))
  const requested = Array.isArray(input.mentions) ? input.mentions : []
  const mentions = [...new Set(requested.filter((m): m is string => typeof m === 'string' && memberIds.has(m)))]

  const { data: message, error } = await service.from('workspace_messages')
    .insert({
      project_id:  id,
      parent_id:   parentId,
      author_id:   gate.user.id,
      author_name: gate.name,
      body,
      lng: pinned ? lng : null,
      lat: pinned ? lat : null,
      mentions,
    })
    .select('*').single()
  if (error || !message) return jsonError('post_failed', 500)

  // Mention emails: best-effort, never block the post.
  const recipients = mentions.filter((m) => m !== gate.user.id).map((m) => memberIds.get(m)).filter(Boolean) as string[]
  await Promise.allSettled(recipients.map((to) => sendEmail(workspaceMentionEmail({
    to, fromName: gate.name, projectName: project.name, excerpt: body, projectId: id,
  }))))

  return NextResponse.json({ message: message as WsMessage }, { status: 201 })
}
