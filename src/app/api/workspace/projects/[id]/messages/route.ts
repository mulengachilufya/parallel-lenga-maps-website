/**
 * GET  /api/workspace/projects/:id/messages  — the latest 500, oldest first
 * POST /api/workspace/projects/:id/messages  — { body, parent_id?, lng?, lat?, mentions?, revision_seq? }
 *      or multipart with the same fields plus `audio` + `seconds` for a
 *      voice note. Voice notes live only here, in project comments, where
 *      the whole team can see them; direct messages are text-only.
 *
 * Mentions must be members of the same org; each (other than the author)
 * gets an email. New messages reach open workstations through Realtime.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, workspaceMentionEmail } from '@/lib/email'
import { VOICE_BUCKET, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, VOICE_TYPES } from '@/lib/workspace/dms'
import { jsonError, loadProject, readJson, requireWorkspace, service } from '@/lib/workspace/server'
import type { WsMessage } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f-]{36}$/i

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate, id)
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
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)

  const isForm = (req.headers.get('content-type') ?? '').startsWith('multipart/form-data')
  let input: Record<string, unknown> = {}
  let audio: File | null = null
  let seconds = 0
  if (isForm) {
    const form = await req.formData().catch(() => null)
    if (!form) return jsonError('bad_form', 400)
    const f = form.get('audio')
    audio = f instanceof File ? f : null
    seconds = Math.round(Number(form.get('seconds')))
    const num = (k: string) => { const v = form.get(k); return typeof v === 'string' && v !== '' ? Number(v) : undefined }
    const mentionsRaw = form.get('mentions')
    input = {
      body: form.get('body') ?? '', parent_id: form.get('parent_id') ?? undefined,
      lng: num('lng'), lat: num('lat'), revision_seq: num('revision_seq'),
      mentions: typeof mentionsRaw === 'string' && mentionsRaw ? mentionsRaw.split(',') : [],
    }
  } else {
    input = await readJson(req)
  }
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n/g, '\n').trim().slice(0, 4000) : ''

  let voice: { bytes: Uint8Array; type: string; ext: string } | null = null
  if (isForm) {
    if (!audio || audio.size === 0) return jsonError('audio_required', 400)
    if (audio.size > VOICE_MAX_BYTES) return jsonError('voice_too_large', 413)
    if (!Number.isFinite(seconds) || seconds < 1) return jsonError('voice_too_short', 400)
    if (seconds > VOICE_MAX_SECONDS) return jsonError('voice_too_long', 400)
    const type = (audio.type || '').split(';')[0].trim().toLowerCase()
    const ext = VOICE_TYPES[type]
    if (!ext) return jsonError('voice_format', 415)
    voice = { bytes: new Uint8Array(await audio.arrayBuffer()), type, ext }
  } else if (!body) {
    return jsonError('body_required', 400)
  }

  // A comment can be about one change in the project history.
  let revisionSeq: number | null = null
  if (typeof input.revision_seq === 'number' && Number.isInteger(input.revision_seq) && input.revision_seq > 0) {
    const { data: rev } = await service.from('workspace_revisions').select('seq')
      .eq('project_id', id).eq('seq', input.revision_seq).maybeSingle()
    if (!rev) return jsonError('revision_not_found', 400)
    revisionSeq = rev.seq
  }

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

  let voicePath: string | null = null
  if (voice) {
    voicePath = `${gate.membership.org_id}/${id}/${crypto.randomUUID()}.${voice.ext}`
    const { error: upErr } = await service.storage.from(VOICE_BUCKET)
      .upload(voicePath, voice.bytes, { contentType: voice.type, upsert: false })
    if (upErr) {
      console.error('[messages] voice upload failed', upErr)
      return jsonError('voice_upload_failed', 500)
    }
  }

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
      voice_path:    voicePath,
      voice_seconds: voicePath ? seconds : null,
      revision_seq:  revisionSeq,
    })
    .select('*').single()
  if (error || !message) {
    if (voicePath) await service.storage.from(VOICE_BUCKET).remove([voicePath])
    return jsonError('post_failed', 500)
  }

  // Mention emails: best-effort, never block the post.
  const recipients = mentions.filter((m) => m !== gate.user.id).map((m) => memberIds.get(m)).filter(Boolean) as string[]
  await Promise.allSettled(recipients.map((to) => sendEmail(workspaceMentionEmail({
    to, fromName: gate.name, projectName: project.name, excerpt: body || `Voice note (${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')})`, projectId: id,
  }))))

  return NextResponse.json({ message: message as WsMessage }, { status: 201 })
}
