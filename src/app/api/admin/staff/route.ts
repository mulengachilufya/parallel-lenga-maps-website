/**
 * /api/admin/staff — the owners give and take away admin access.
 *
 *   GET                                      → staff, full admins, the areas
 *   POST   { email, name?, title?, areas[] } → add someone, or change them
 *   DELETE { email }                         → remove them (access ends now)
 *
 * Owners only (OWNER_EMAILS). Every change goes in the ops audit log.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AREAS, currentAccess, isArea } from '@/lib/staff'
import { getAdminEmails, isAdminEmail, isOwnerEmail } from '@/lib/admin'
import { audit } from '@/lib/ops/log'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const bad = (message: string, status = 400) => NextResponse.json({ error: 'validation', message }, { status })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function owner() {
  const a = await currentAccess()
  return a?.owner ? a.email : null
}

export async function GET() {
  const who = await owner()
  if (!who) return NextResponse.json({ error: 'forbidden', message: 'Only the owners manage staff.' }, { status: 403 })
  const { data, error } = await service.from('admin_staff').select('*').order('created_at')
  if (error) return bad(error.message, 500)
  // Whether each one has signed up yet, so a typo in an address shows.
  const emails = (data ?? []).map((s) => s.email)
  const { data: profs } = emails.length
    ? await service.from('profiles').select('email').in('email', emails)
    : { data: [] as { email: string }[] }
  const known = new Set((profs ?? []).map((p) => (p.email ?? '').toLowerCase()))
  return NextResponse.json({
    staff: (data ?? []).map((s) => ({ ...s, has_account: known.has(s.email) })),
    full_admins: getAdminEmails().map((e) => ({ email: e, owner: isOwnerEmail(e) })),
    areas: AREAS,
  })
}

export async function POST(req: NextRequest) {
  const who = await owner()
  if (!who) return NextResponse.json({ error: 'forbidden', message: 'Only the owners manage staff.' }, { status: 403 })
  let body: { email?: string; name?: string; title?: string; areas?: unknown[] } = {}
  try { body = await req.json() } catch { /* validated below */ }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!EMAIL.test(email)) return bad('Enter a valid email address.')
  if (isAdminEmail(email)) return bad(`${email} already has full access.`)
  const areas = [...new Set((body.areas ?? []).filter(isArea))]
  if (!areas.length) return bad('Tick at least one area. To take all access away, use Remove.')

  const { data: before } = await service.from('admin_staff').select('areas').eq('email', email).maybeSingle()
  const { error } = await service.from('admin_staff').upsert({
    email,
    name: body.name?.trim().slice(0, 120) || null,
    title: body.title?.trim().slice(0, 160) || null,
    areas,
    added_by: who,
    updated_at: new Date().toISOString(),
  })
  if (error) return bad(error.message, 500)
  await audit(who, 'console', before ? 'staff_changed' : 'staff_added', email, { areas, before: before?.areas ?? null })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const who = await owner()
  if (!who) return NextResponse.json({ error: 'forbidden', message: 'Only the owners manage staff.' }, { status: 403 })
  let body: { email?: string } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email) return bad('Missing email.')
  const { data: row } = await service.from('admin_staff').delete().eq('email', email).select('areas').maybeSingle()
  if (!row) return bad('They are not on the staff list.', 404)
  await audit(who, 'console', 'staff_removed', email, { areas: row.areas })
  return NextResponse.json({ ok: true })
}
