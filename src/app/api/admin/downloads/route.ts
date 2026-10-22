/**
 * GET /api/admin/downloads?days=30|90|365|all[&format=csv]
 *
 * Admin-only. Summarises download_events for the admin Downloads page:
 * totals against the previous period, a per-day series, the top datasets,
 * countries, people and teams, where downloads came from (website, bundle,
 * API) and paying against free accounts. format=csv returns every row in
 * the period instead.
 *
 * "Paying" is the account's status today (an active individual plan, or a
 * seat on an active paid team), not at the time of the download.
 *
 * Auth: cookie session + ADMIN_EMAILS allow-list.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { accessFor, can } from '@/lib/staff'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

interface Row {
  created_at: string; user_id: string | null; org_id: string | null; user_name: string | null; user_email: string | null
  dataset_slug: string; dataset_name: string | null; country: string | null; file_format: string | null
  source: string | null; bytes: number | null
}

const DAY = 86_400_000
const COLS = 'created_at, user_id, org_id, user_name, user_email, dataset_slug, dataset_name, country, file_format, source, bytes'

async function fetchRows(from: Date | null, to: Date): Promise<Row[]> {
  const rows: Row[] = []
  for (let page = 0; page < 50; page++) {
    let q = service.from('download_events').select(COLS).lt('created_at', to.toISOString())
      .order('created_at', { ascending: false }).range(page * 1000, page * 1000 + 999)
    if (from) q = q.gte('created_at', from.toISOString())
    const { data, error } = await q
    if (error) throw error
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }
  return rows
}

function top<T extends string>(rows: Row[], key: (r: Row) => T | null, n = 10) {
  const m = new Map<T, number>()
  for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, count]) => ({ label, count }))
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !can(await accessFor(user.email), 'downloads')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const daysParam = sp.get('days') ?? '30'
  const days = daysParam === 'all' ? null : Math.min(Math.max(Number(daysParam) || 30, 1), 3650)
  const now = new Date()
  const from = days ? new Date(now.getTime() - days * DAY) : null

  let rows: Row[]
  try { rows = await fetchRows(from, now) }
  catch (error) {
    console.error('[admin/downloads] fetch failed:', error)
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }

  if (sp.get('format') === 'csv') {
    const head = ['date_utc', 'name', 'email', 'dataset', 'country', 'format', 'source', 'size_mb']
    const lines = rows.map((r) => [
      r.created_at, r.user_name, r.user_email, r.dataset_name ?? r.dataset_slug, r.country, r.file_format,
      r.source ?? 'website', r.bytes ? (r.bytes / 1024 / 1024).toFixed(1) : '',
    ].map(csvCell).join(','))
    return new NextResponse([head.join(','), ...lines].join('\n'), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="lenga-downloads-${daysParam}-${now.toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  // Same-length period just before this one, for the "vs previous" figure.
  let previous: number | null = null
  if (days && from) {
    const { count } = await service.from('download_events').select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(from.getTime() - days * DAY).toISOString()).lt('created_at', from.toISOString())
    previous = count ?? 0
  }

  // Who is paying today: an active individual plan, or a seat on an active paid team.
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[]
  const orgIds  = [...new Set(rows.map((r) => r.org_id).filter(Boolean))] as string[]
  const paidUsers = new Set<string>()
  const orgNames = new Map<string, string>()
  if (userIds.length) {
    const { data } = await service.from('profiles').select('id, plan_status').in('id', userIds)
    for (const p of data ?? []) if (p.plan_status === 'active') paidUsers.add(p.id)
  }
  if (orgIds.length) {
    const { data: orgs } = await service.from('organizations').select('id, name, plan, status').in('id', orgIds)
    const paidOrgs = new Set((orgs ?? []).filter((o) => o.plan !== 'free' && o.status === 'active').map((o) => o.id))
    for (const o of orgs ?? []) orgNames.set(o.id, o.name)
    for (const r of rows) if (r.user_id && r.org_id && paidOrgs.has(r.org_id)) paidUsers.add(r.user_id)
  }
  const isPaid = (r: Row) => !!r.user_id && paidUsers.has(r.user_id)

  // Per-day series (UTC), from the period start or the first download.
  const start = from ?? (rows.length ? new Date(rows[rows.length - 1].created_at) : now)
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const perDay = new Map<string, number>()
  for (let t = startDay; t <= now.getTime(); t += DAY) perDay.set(new Date(t).toISOString().slice(0, 10), 0)
  for (const r of rows) { const d = r.created_at.slice(0, 10); if (perDay.has(d)) perDay.set(d, perDay.get(d)! + 1) }

  const people = new Map<string, { name: string; email: string; count: number; paid: boolean; last: string }>()
  for (const r of rows) {
    const k = r.user_id ?? r.user_email ?? r.user_name ?? 'unknown'
    const p = people.get(k) ?? { name: r.user_name ?? 'Unknown', email: r.user_email ?? '', count: 0, paid: isPaid(r), last: r.created_at }
    p.count++
    people.set(k, p)
  }

  return NextResponse.json({
    period: { days, from: from?.toISOString() ?? null, to: now.toISOString() },
    totals: {
      downloads: rows.length,
      previous,
      people: new Set(rows.map((r) => r.user_id ?? r.user_email)).size,
      teams: orgIds.length,
      bytes: rows.reduce((s, r) => s + (r.bytes ?? 0), 0),
      paid: rows.filter(isPaid).length,
      free: rows.filter((r) => !isPaid(r)).length,
    },
    perDay: [...perDay.entries()].map(([date, count]) => ({ date, count })),
    datasets:  top(rows, (r) => r.dataset_name ?? r.dataset_slug),
    countries: top(rows, (r) => r.country),
    sources:   top(rows, (r) => r.source ?? 'website', 4),
    teams:     top(rows, (r) => (r.org_id ? orgNames.get(r.org_id) ?? null : null)),
    people:    [...people.values()].sort((a, b) => b.count - a.count).slice(0, 15),
    recent:    rows.slice(0, 40).map((r) => ({
      at: r.created_at, name: r.user_name, email: r.user_email, dataset: r.dataset_name ?? r.dataset_slug,
      country: r.country, source: r.source ?? 'website', paid: isPaid(r),
    })),
  })
}
