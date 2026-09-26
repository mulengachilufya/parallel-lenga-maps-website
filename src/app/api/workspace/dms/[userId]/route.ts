/**
 * GET  /api/workspace/dms/:userId — the conversation with one teammate
 *      (latest 300, oldest first). Marks their messages to the caller read.
 * POST /api/workspace/dms/:userId — send. JSON { body, project_id? } for
 *      text; multipart (audio, seconds, body?, project_id?) for a voice note.
 *
 * The recipient sees it at once through Realtime and gets an email, unless
 * an earlier emailed message from the same sender is still unread and less
 * than EMAIL_QUIET_MS old (so a live back-and-forth doesn't flood them).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, workspaceDirectMessageEmail } from '@/lib/email'
import { EMAIL_QUIET_MS, VOICE_BUCKET, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, VOICE_TYPES } from '@/lib/workspace/dms'
import { jsonError, requireWorkspace, service, type WorkspaceGate } from '@/lib/workspace/server'
import type { WsDirectMessage } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ userId: string }> }
const UUID = /^[0-9a-f-]{36}$/i

async function teammate(gate: WorkspaceGate, userId: string) {
  if (!UUID.test(userId) || userId === gate.user.id) return null
  const { data } = await service.from('organization_members')
    .select('user_id, member_name, member_email')
    .eq('org_id', gate.membership.org_id).eq('user_id', userId).maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { userId } = await params
  const other = await teammate(gate, userId)
  if (!other) return jsonError('not_found', 404)
  const me = gate.user.id

  const { data, error } = await service.from('workspace_direct_messages').select('*')
    .eq('org_id', gate.membership.org_id)
    .or(`and(sender_id.eq.${me},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${me})`)
    .order('created_at', { ascending: false }).limit(300)
  if (error) return jsonError('list_failed', 500)

  await service.from('workspace_direct_messages').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me).eq('sender_id', userId).is('read_at', null)

  return NextResponse.json({ messages: ((data ?? []) as WsDirectMessage[]).reverse() })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { userId } = await params
  const other = await teammate(gate, userId)
  if (!other) return jsonError('not_found', 404)

  let body = ''
  let projectId: unknown = null
  let audio: File | null = null
  let seconds = 0
  const isForm = (req.headers.get('content-type') ?? '').startsWith('multipart/form-data')
  if (isForm) {
    const form = await req.formData().catch(() => null)
    if (!form) return jsonError('bad_form', 400)
    const f = form.get('audio')
    audio = f instanceof File ? f : null
    seconds = Math.round(Number(form.get('seconds')))
    body = typeof form.get('body') === 'string' ? String(form.get('body')) : ''
    projectId = form.get('project_id')
  } else {
    const input = await req.json().catch(() => ({})) as Record<string, unknown>
    body = typeof input.body === 'string' ? input.body : ''
    projectId = input.project_id
  }
  body = body.replace(/\r\n/g, '\n').trim().slice(0, 4000)

  let voicePath: string | null = null
  if (isForm) {
    if (!audio || audio.size === 0) return jsonError('audio_required', 400)
    if (audio.size > VOICE_MAX_BYTES) return jsonError('voice_too_large', 413)
    if (!Number.isFinite(seconds) || seconds < 1) return jsonError('voice_too_short', 400)
    if (seconds > VOICE_MAX_SECONDS) return jsonError('voice_too_long', 400)
    const type = (audio.type || '').split(';')[0].trim().toLowerCase()
    const ext = VOICE_TYPES[type]
    if (!ext) return jsonError('voice_format', 415)
    voicePath = `${gate.membership.org_id}/${gate.user.id}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await service.storage.from(VOICE_BUCKET)
      .upload(voicePath, new Uint8Array(await audio.arrayBuffer()), { contentType: type, upsert: false })
    if (upErr) {
      console.error('[dms] voice upload failed', upErr)
      return jsonError('voice_upload_failed', 500)
    }
  } else if (!body) {
    return jsonError('body_required', 400)
  }

  let project: string | null = null
  if (typeof projectId === 'string' && UUID.test(projectId)) {
    const { data: p } = await service.from('workspace_projects').select('id')
      .eq('id', projectId).eq('org_id', gate.membership.org_id).maybeSingle()
    project = p?.id ?? null
  }

  // Decide on the email before inserting, so this message isn't its own reason to stay quiet.
  const { data: pending } = await service.from('workspace_direct_messages').select('emailed_at')
    .eq('sender_id', gate.user.id).eq('recipient_id', userId).is('read_at', null)
    .not('emailed_at', 'is', null).order('emailed_at', { ascending: false }).limit(1)
  const lastEmailed = pending?.[0]?.emailed_at ? new Date(pending[0].emailed_at).getTime() : 0
  const shouldEmail = !!other.member_email && Date.now() - lastEmailed > EMAIL_QUIET_MS

  const { data: message, error } = await service.from('workspace_direct_messages').insert({
    org_id:        gate.membership.org_id,
    sender_id:     gate.user.id,
    recipient_id:  userId,
    sender_name:   gate.name,
    body:          body || null,
    voice_path:    voicePath,
    voice_seconds: voicePath ? seconds : null,
    project_id:    project,
  }).select('*').single()
  if (error || !message) {
    if (voicePath) await service.storage.from(VOICE_BUCKET).remove([voicePath])
    return jsonError('send_failed', 500)
  }

  let emailed = false
  if (shouldEmail) {
    emailed = await sendEmail(workspaceDirectMessageEmail({
      to: other.member_email!, fromName: gate.name, orgName: gate.membership.org.name,
      body: body || null, voiceSeconds: voicePath ? seconds : null, fromId: gate.user.id,
    })).catch(() => false)
    if (emailed) {
      await service.from('workspace_direct_messages').update({ emailed_at: new Date().toISOString() }).eq('id', message.id)
    }
  }

  return NextResponse.json({ message: message as WsDirectMessage, emailed }, { status: 201 })
}
