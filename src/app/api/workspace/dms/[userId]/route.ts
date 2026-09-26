/**
 * GET  /api/workspace/dms/:userId — the conversation with one teammate
 *      (latest 300, oldest first, all still encrypted) plus every public key
 *      those messages were sealed with. Marks their messages to the caller read.
 * POST /api/workspace/dms/:userId — send { ciphertext, iv, sender_key_id,
 *      recipient_key_id }. The server can't read it: it only checks that
 *      both key ids are the two people's current keys and stores the blob.
 *
 * The recipient sees it at once through Realtime and gets an email saying
 * a message is waiting, never its content. Repeat emails are held back
 * while an earlier emailed message is unread and under EMAIL_QUIET_MS old.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, workspaceDirectMessageEmail } from '@/lib/email'
import { EMAIL_QUIET_MS } from '@/lib/workspace/dms'
import { jsonError, requireWorkspace, service, teammate } from '@/lib/workspace/server'
import type { WsDirectMessage } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ userId: string }> }
const UUID = /^[0-9a-f-]{36}$/i
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

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
  const messages = ((data ?? []) as WsDirectMessage[]).reverse()

  const keyIds = [...new Set(messages.flatMap((m) => [m.sender_key_id, m.recipient_key_id]))]
  const { data: keys } = keyIds.length
    ? await service.from('workspace_user_keys').select('key_id, user_id, public_jwk').in('key_id', keyIds)
    : { data: [] }

  await service.from('workspace_direct_messages').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me).eq('sender_id', userId).is('read_at', null)

  return NextResponse.json({
    messages,
    keys: Object.fromEntries((keys ?? []).map((k) => [k.key_id, { user_id: k.user_id, public_jwk: k.public_jwk }])),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { userId } = await params
  const other = await teammate(gate, userId)
  if (!other) return jsonError('not_found', 404)

  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return jsonError('json_only', 415)
  const input = await req.json().catch(() => ({})) as Record<string, unknown>
  const ciphertext = typeof input.ciphertext === 'string' ? input.ciphertext : ''
  const iv = typeof input.iv === 'string' ? input.iv : ''
  const senderKey = typeof input.sender_key_id === 'string' ? input.sender_key_id : ''
  const recipientKey = typeof input.recipient_key_id === 'string' ? input.recipient_key_id : ''
  if (!ciphertext || ciphertext.length > 24000 || !B64.test(ciphertext) || !B64.test(iv) || iv.length > 24
      || !UUID.test(senderKey) || !UUID.test(recipientKey)) {
    return jsonError('bad_ciphertext', 400)
  }
  // Plain text is refused outright: nothing readable is ever stored.
  if ('body' in input) return jsonError('plaintext_refused', 400)

  const { data: keys } = await service.from('workspace_user_keys').select('key_id, user_id')
    .in('key_id', [senderKey, recipientKey]).is('retired_at', null)
  const owner = new Map((keys ?? []).map((k) => [k.key_id as string, k.user_id as string]))
  if (owner.get(senderKey) !== gate.user.id || owner.get(recipientKey) !== userId) {
    return jsonError('stale_key', 409)   // someone reset their key; reload and re-encrypt
  }

  let project: string | null = null
  if (typeof input.project_id === 'string' && UUID.test(input.project_id)) {
    const { data: p } = await service.from('workspace_projects').select('id')
      .eq('id', input.project_id).eq('org_id', gate.membership.org_id).maybeSingle()
    project = p?.id ?? null
  }

  const { data: pending } = await service.from('workspace_direct_messages').select('emailed_at')
    .eq('sender_id', gate.user.id).eq('recipient_id', userId).is('read_at', null)
    .not('emailed_at', 'is', null).order('emailed_at', { ascending: false }).limit(1)
  const lastEmailed = pending?.[0]?.emailed_at ? new Date(pending[0].emailed_at).getTime() : 0
  const shouldEmail = !!other.member_email && Date.now() - lastEmailed > EMAIL_QUIET_MS

  const { data: message, error } = await service.from('workspace_direct_messages').insert({
    org_id:           gate.membership.org_id,
    sender_id:        gate.user.id,
    recipient_id:     userId,
    sender_name:      gate.name,
    ciphertext, iv,
    sender_key_id:    senderKey,
    recipient_key_id: recipientKey,
    project_id:       project,
  }).select('*').single()
  if (error || !message) return jsonError('send_failed', 500)

  let emailed = false
  if (shouldEmail) {
    emailed = await sendEmail(workspaceDirectMessageEmail({
      to: other.member_email!, fromName: gate.name, orgName: gate.membership.org.name, fromId: gate.user.id,
    })).catch(() => false)
    if (emailed) {
      await service.from('workspace_direct_messages').update({ emailed_at: new Date().toISOString() }).eq('id', message.id)
    }
  }

  return NextResponse.json({ message: message as WsDirectMessage, emailed }, { status: 201 })
}
