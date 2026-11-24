import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { lencoConfig } from '@/lib/lenco'
import { finalizeLencoPayment } from '@/lib/lenco-finalize'

/**
 * POST /api/payments/lenco/verify   body: { reference }
 *
 * Called by the pay page right after the Lenco widget says "success" (and
 * again a few times if the payment is still pending). The browser's word is
 * not trusted: finalizeLencoPayment asks Lenco directly.
 */
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const cfg = lencoConfig()
  if (!cfg) return NextResponse.json({ error: 'Instant payment is not available right now.' }, { status: 503 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
  if (!/^[A-Za-z0-9._-]{6,80}$/.test(reference)) return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 })

  // You can only settle your own payment.
  const { data: row } = await service.from('lenco_payments').select('user_id').eq('reference', reference).maybeSingle()
  if (!row || row.user_id !== user.id) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })

  const result = await finalizeLencoPayment(service, cfg, reference)
  return NextResponse.json(result, { status: result.state === 'error' ? 503 : 200 })
}
