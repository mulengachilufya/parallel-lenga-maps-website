/**
 * GET /api/admin/sales/linkedin — everyone in the pipeline for the LinkedIn
 * tab: each person with their organisation and where they are on the
 * LinkedIn track (src/lib/sales/linkedin.ts). People who opted out of
 * contact, and accounts marked lost, are left out.
 *
 * Admin only. Listing never sends anything.
 */
import { NextResponse } from 'next/server'
import { db, jsonError, requireAdmin } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAdmin()
  if ('denied' in gate) return gate.denied

  const [contacts, rows] = await Promise.all([
    db.from('sales_contacts')
      .select('id, account_id, name, title, email, linkedin_url, is_primary, opted_out_at, account:sales_accounts!inner(id, name, country_iso3, sector, stage, pipeline)')
      .is('opted_out_at', null).neq('account.stage', 'lost')
      .order('created_at', { ascending: true }).limit(2000),
    db.from('sales_linkedin').select('*').limit(2000),
  ])
  if (contacts.error || rows.error) {
    console.error('[admin/sales/linkedin] list failed', contacts.error ?? rows.error)
    return jsonError('list_failed', 500, 'Could not load the LinkedIn list. Has migration 050 been applied?')
  }
  const byContact = new Map((rows.data ?? []).map((r) => [r.contact_id as string, r]))
  return NextResponse.json({
    people: (contacts.data ?? []).map((c) => ({ ...c, li: byContact.get(c.id) ?? null })),
  })
}
