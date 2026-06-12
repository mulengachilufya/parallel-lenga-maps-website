/**
 * GET   /api/admin/quotes          — list quote requests (newest first).
 * PATCH /api/admin/quotes          — { id, status } move a request through
 *                                    new → contacted → quoted → won → lost.
 *
 * Auth: cookie session + ADMIN_EMAILS allow-list (same pattern as
 * /api/admin/users/list).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'] as const

async function requireAdmin(): Promise<NextResponse | null> {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return null
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const { data, error } = await service
    .from('quote_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[admin/quotes] list failed:', error)
    return NextResponse.json({ error: 'list_failed' }, { status: 500 })
  }
  return NextResponse.json({ quotes: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { id?: string; status?: string } = {}
  try { body = await req.json() } catch { /* fall through to validation */ }

  if (!body.id || !STATUSES.includes(body.status as typeof STATUSES[number])) {
    return NextResponse.json({ error: 'validation' }, { status: 400 })
  }

  const { error } = await service
    .from('quote_requests')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', body.id)

  if (error) {
    console.error('[admin/quotes] update failed:', error)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
