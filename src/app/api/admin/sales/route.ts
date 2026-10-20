/**
 * GET  /api/admin/sales — every account in the sales pipeline (partners
 *                         live in /api/admin/sales/partners) with its main
 *                         contact and next open task, the open tasks due
 *                         in the next week, and the sales settings.
 * POST /api/admin/sales — add an account: { name, country_iso3?, sector?,
 *                         …, contact?: { name, email?, linkedin_url?, … },
 *                         start_sequence?: boolean }
 *
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { dueDate } from '@/lib/sales/playbook'
import {
  accountPatch, contactFields, db, getSettings, jsonError, logActivity, requireAdmin, startSequence,
} from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied

  const [accounts, contacts, tasks, settings] = await Promise.all([
    db.from('sales_accounts')
      .select('id, name, country_iso3, sector, source, stage, priority, seats_estimate, value_usd, next_step, next_step_due, lost_reason, nurture_until, org_id, stage_history, stage_changed_at, last_touch_at, created_at, updated_at')
      .eq('pipeline', 'sales').order('updated_at', { ascending: false }).limit(3000),
    db.from('sales_contacts').select('id, account_id, name, title, email, linkedin_url, is_primary, opted_out_at').limit(10000),
    db.from('sales_tasks').select('id, account_id, contact_id, kind, title, template, due_on, sequence')
      .is('done_at', null).order('due_on', { ascending: true }).limit(5000),
    getSettings(),
  ])
  if (accounts.error || contacts.error || tasks.error) {
    console.error('[admin/sales] list failed', accounts.error ?? contacts.error ?? tasks.error)
    return jsonError('list_failed', 500, 'Could not load the pipeline. Has migration 039 been applied?')
  }

  const byAccount = new Map<string, typeof contacts.data>()
  for (const c of contacts.data ?? []) byAccount.set(c.account_id, [...(byAccount.get(c.account_id) ?? []), c])
  const nextTask = new Map<string, { title: string; due_on: string }>()
  for (const t of tasks.data ?? []) if (!nextTask.has(t.account_id)) nextTask.set(t.account_id, { title: t.title, due_on: t.due_on })

  const rows = (accounts.data ?? []).map((a) => {
    const cs = byAccount.get(a.id) ?? []
    const main = cs.find((c) => c.is_primary) ?? cs[0] ?? null
    return { ...a, contact: main, contact_count: cs.length, next_task: nextTask.get(a.id) ?? null }
  })

  const horizon = dueDate(7)
  const names = new Map(rows.map((a) => [a.id, a]))
  const contactById = new Map((contacts.data ?? []).map((c) => [c.id, c]))
  const upcoming = (tasks.data ?? []).filter((t) => t.due_on <= horizon && names.has(t.account_id)).map((t) => ({
    ...t,
    account_name: names.get(t.account_id)?.name ?? '',
    account_stage: names.get(t.account_id)?.stage ?? 'target',
    country_iso3: names.get(t.account_id)?.country_iso3 ?? null,
    contact: t.contact_id ? contactById.get(t.contact_id) ?? null : null,
  }))

  return NextResponse.json({ accounts: rows, tasks: upcoming, settings })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const fields = accountPatch(body)
  if (!fields.name) return jsonError('validation', 400, 'The organisation needs a name.')

  const now = new Date().toISOString()
  const { data: account, error } = await db.from('sales_accounts')
    .insert({ ...fields, stage: 'target', stage_history: { target: now } })
    .select('*').single()
  if (error || !account) {
    console.error('[admin/sales] create failed', error)
    return jsonError('create_failed', 500, error?.message)
  }
  await logActivity({ account_id: account.id, kind: 'system', subject: 'Added to the radar', created_by: gate.email })

  let contact: { id: string; email: string | null; linkedin_url: string | null } | null = null
  if (body.contact && typeof body.contact === 'object') {
    const c = contactFields(body.contact as Record<string, unknown>)
    if (c.name) {
      const { data } = await db.from('sales_contacts').insert({ ...c, account_id: account.id, is_primary: true })
        .select('id, email, linkedin_url').single()
      contact = data
    }
  }
  if (body.start_sequence === true) await startSequence(account.id, contact)

  return NextResponse.json({ ok: true, account })
}
