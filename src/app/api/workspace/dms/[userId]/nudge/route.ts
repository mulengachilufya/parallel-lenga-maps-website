/**
 * POST /api/workspace/dms/:userId/nudge — email a teammate who hasn't set up
 * secure messages yet that someone is trying to reach them. At most one
 * such email per recipient per day, whoever asks.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, workspaceSecureSetupEmail } from '@/lib/email'
import { jsonError, requireWorkspace, service, teammate } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { userId } = await params
  const other = await teammate(gate, userId)
  if (!other?.member_email) return jsonError('not_found', 404)

  const { data: hasKey } = await service.from('workspace_user_keys').select('key_id')
    .eq('user_id', userId).is('retired_at', null).maybeSingle()
  if (hasKey) return NextResponse.json({ ok: true, already: true })

  const { data: last } = await service.from('workspace_dm_nudges').select('sent_at').eq('recipient_id', userId).maybeSingle()
  if (last && Date.now() - new Date(last.sent_at).getTime() < 86_400_000) return NextResponse.json({ ok: true, throttled: true })

  const ok = await sendEmail(workspaceSecureSetupEmail({ to: other.member_email, fromName: gate.name, orgName: gate.membership.org.name }))
  if (ok) await service.from('workspace_dm_nudges').upsert({ recipient_id: userId, sent_at: new Date().toISOString() })
  return NextResponse.json({ ok })
}
