/**
 * GET /api/workspace/dms — the caller's inbox: every teammate, their public
 * encryption key (null until they set up secure messages), the last message
 * exchanged (still encrypted; the browser decrypts the preview) and how
 * many of theirs are unread.
 */
import { NextResponse } from 'next/server'
import { jsonError, requireWorkspace, service } from '@/lib/workspace/server'
import type { WsConversation, WsDirectMessage, WsMember } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const me = gate.user.id

  const [members, recent] = await Promise.all([
    service.from('organization_members').select('user_id, role, member_name, member_email')
      .eq('org_id', gate.membership.org_id),
    service.from('workspace_direct_messages')
      .select('id, sender_id, recipient_id, ciphertext, iv, sender_key_id, recipient_key_id, created_at, read_at')
      .eq('org_id', gate.membership.org_id)
      .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
      .order('created_at', { ascending: false }).limit(1000),
  ])
  if (members.error || recent.error) return jsonError('list_failed', 500)

  const ids = (members.data ?? []).map((m) => m.user_id as string)
  const { data: keys } = await service.from('workspace_user_keys')
    .select('key_id, user_id, public_jwk, retired_at').in('user_id', ids)
  const activeKey = new Map((keys ?? []).filter((k) => !k.retired_at).map((k) => [k.user_id as string, k]))
  const allKeys = Object.fromEntries((keys ?? []).map((k) => [k.key_id, { user_id: k.user_id, public_jwk: k.public_jwk }]))

  const last = new Map<string, WsConversation['last']>()
  const unread = new Map<string, number>()
  for (const m of (recent.data ?? []) as WsDirectMessage[]) {
    const other = m.sender_id === me ? m.recipient_id : m.sender_id
    if (!last.has(other)) {
      last.set(other, {
        at: m.created_at, from_me: m.sender_id === me,
        sealed: { ciphertext: m.ciphertext, iv: m.iv, sender_key_id: m.sender_key_id, recipient_key_id: m.recipient_key_id },
      })
    }
    if (m.recipient_id === me && !m.read_at) unread.set(other, (unread.get(other) ?? 0) + 1)
  }

  const conversations: WsConversation[] = (members.data ?? [])
    .filter((m) => m.user_id !== me)
    .map((m): WsConversation => {
      const member: WsMember = {
        user_id: m.user_id, role: m.role,
        name: m.member_name?.trim() || m.member_email || 'Team member', email: m.member_email ?? '',
      }
      const k = activeKey.get(m.user_id)
      return {
        member, key: k ? { key_id: k.key_id, public_jwk: k.public_jwk } : null,
        last: last.get(m.user_id) ?? null, unread: unread.get(m.user_id) ?? 0,
      }
    })
    .sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? '') || a.member.name.localeCompare(b.member.name))

  return NextResponse.json({
    me: { user_id: me, name: gate.name },
    org: { id: gate.membership.org_id, name: gate.membership.org.name },
    conversations,
    keys: allKeys,
    unread_total: [...unread.values()].reduce((a, b) => a + b, 0),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
