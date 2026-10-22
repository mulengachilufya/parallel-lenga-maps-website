/**
 * DELETE /api/admin/payments/:id — remove a payment record for good, for
 * test orders. Owners and ADMIN_EMAILS only.
 *
 * It only removes the record. A plan that a verified payment turned on stays
 * on; change it from /ops if that was a test too. The screenshot stays in R2.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { currentAccess } from '@/lib/staff'
import { audit } from '@/lib/ops/log'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await currentAccess()
  if (!access?.full) return NextResponse.json({ error: 'forbidden', message: 'Only the owners can delete.' }, { status: 403 })
  const { id } = await params

  const { data: row } = await service.from('manual_payments')
    .select('id, reference, user_email, plan, status, amount_usd').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { error } = await service.from('manual_payments').delete().eq('id', id)
  if (error) {
    console.error('[admin/payments] delete failed:', error)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }
  await audit(access.email, 'console', 'payment_deleted', row.reference, row)
  return NextResponse.json({ ok: true })
}
