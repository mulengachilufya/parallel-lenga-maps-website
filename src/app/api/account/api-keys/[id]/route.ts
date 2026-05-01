/**
 * DELETE /api/account/api-keys/:id  — revoke a key (soft-delete via revoked_at).
 *
 * We don't HARD-delete because:
 *   - the row has audit value (last_used_at, total requests for the month)
 *   - leaving the hash present means a re-used compromised key still hits
 *     a 401 "revoked" response rather than silently 401 "invalid"
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const cookieClient = createServerSupabase()
  const { data: { session } } = await cookieClient.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Scope the update to user_id so a user can never revoke another user's
  // key by guessing a uuid.
  const { data, error } = await admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'revoke_failed', message: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({ revoked: true, id: data.id })
}
