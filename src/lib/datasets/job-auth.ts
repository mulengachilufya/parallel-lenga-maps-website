/**
 * Who may run the admin dataset tools: a signed-in admin, or a short-lived
 * job token sent as `Authorization: Bearer <token>`, whose sha256 is stored
 * in ops_settings 'dataset_job_token' with an expiry. Only a fingerprint is
 * stored; deleting the row revokes it.
 */
import { NextRequest } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

export const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function datasetAdmin(req?: NextRequest): Promise<boolean> {
  const bearer = req?.headers.get('authorization')?.match(/^Bearer (.{32,})$/)?.[1]
  if (bearer) {
    const { data } = await service.from('ops_settings').select('value').eq('key', 'dataset_job_token').maybeSingle()
    const v = data?.value as { hash?: string; expires_at?: string } | undefined
    if (!v?.hash || !v.expires_at || new Date(v.expires_at).getTime() < Date.now()) return false
    const got = Buffer.from(createHash('sha256').update(bearer).digest('hex'))
    const want = Buffer.from(v.hash)
    return got.length === want.length && timingSafeEqual(got, want)
  }
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  return !!user && isAdminEmail(user.email)
}
