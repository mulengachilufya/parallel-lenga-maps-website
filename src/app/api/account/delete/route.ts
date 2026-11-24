import { after, NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { processAccountDeletions } from '@/lib/jobs/account-deletions'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const fail = (error: string, message: string, status: number) => NextResponse.json({ error, message }, { status })

export async function POST(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return fail('unauthorized', 'Sign in first.', 401)
  const body = await req.json().catch(() => null)
  if (body?.confirm !== 'DELETE') return fail('confirm', 'Type DELETE to confirm.', 400)

  const { data, error } = await service.rpc('request_account_deletion', { p_user: user.id })
  if (data === 'owner_has_members') {
    return fail(data, 'You own a team with other members. Remove them on the Team page or contact support to transfer the team.', 409)
  }
  if (data === 'paid_team') {
    return fail(data, 'Your paid team plan is still active. Contact support to close the team and delete your account.', 409)
  }
  if (error || data !== 'accepted') {
    console.error('[account/delete] could not queue request', error)
    return fail('delete_failed', 'We could not record your deletion request. Try again or contact support.', 500)
  }

  after(async () => { await processAccountDeletions(service, user.id) })
  await auth.auth.signOut().catch(() => {})
  return NextResponse.json({ ok: true, status: 'pending' }, { status: 202 })
}
