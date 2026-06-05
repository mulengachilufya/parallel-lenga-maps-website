/**
 * POST /api/payments/initiate
 *
 * Triggers a Lipila Mobile Money STK push for a pending payment record.
 * Called from the client immediately after /api/payments/create returns a reference.
 *
 * Body: { reference: string, phone: string }
 *   - reference  the internal ref created by /api/payments/create
 *   - phone      customer's mobile number (accepted formats: 260xxxxxxxxx / 09xxxxxxxx)
 *
 * On success the payment prompt is sent to the customer's phone.
 * The client should then start polling /api/payments/verify/{reference}.
 * Lipila will fire our webhook when the customer approves or rejects.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { PLANS, type TierSlug } from '@/lib/pricing'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LIPILA_BASE = process.env.LIPILA_SANDBOX === 'true'
  ? 'https://api.lipila.dev'
  : 'https://blz.lipila.io'

/** Normalise phone to 260xxxxxxxxx (international Zambian format). */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().+]/g, '')
  if (digits.startsWith('260')) return digits
  if (digits.startsWith('0') && digits.length === 10) return `26${digits}`
  return digits
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let reference: string, phone: string
  try {
    ;({ reference, phone } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!reference || !phone) {
    return NextResponse.json({ error: 'Missing reference or phone' }, { status: 400 })
  }

  // Verify the payment record belongs to this user and is still pending
  const { data: payment, error: fetchErr } = await serviceSupabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .eq('user_id', session.user.id)
    .single()

  if (fetchErr || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }
  if (payment.status !== 'pending') {
    return NextResponse.json({ error: 'Payment already processed' }, { status: 400 })
  }

  // Derive amount from plan server-side (never trust client amounts)
  const planData = PLANS[payment.plan as TierSlug]
  if (!planData) {
    return NextResponse.json({ error: 'Unrecognised plan' }, { status: 400 })
  }

  // All prices are in USD
  const amount   = planData.price
  const currency = 'USD'

  const normPhone = normalisePhone(phone)

  // Callback URL: Lipila POSTs here when the customer approves/rejects
  const appUrl      = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
  const callbackUrl = `${appUrl}/api/payments/webhook`

  // ── Call Lipila MoMo Collections API ────────────────────────────────────
  let lipilaRes: Response
  try {
    lipilaRes = await fetch(`${LIPILA_BASE}/api/v1/collections/mobile-money`, {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'Content-Type': 'application/json',
        'x-api-key':    process.env.LIPILA_API_KEY!,
        'callbackUrl':  callbackUrl,
      },
      body: JSON.stringify({
        referenceId:   reference,         // our ref — comes back as `identifier` in webhook
        amount,
        narration:     `Lenga Maps ${payment.plan} plan`,
        accountNumber: normPhone,
        currency,
        email:         session.user.email ?? undefined,
      }),
    })
  } catch (err) {
    console.error('[initiate] Lipila network error:', err)
    return NextResponse.json(
      { error: 'Could not reach payment provider. Check your connection and try again.' },
      { status: 502 }
    )
  }

  const rawBody = await lipilaRes.text()

  if (!lipilaRes.ok) {
    console.error('[initiate] Lipila rejected request:', lipilaRes.status, rawBody)
    let userMsg = 'Payment provider rejected the request. Please check the phone number and try again.'
    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>
      if (typeof parsed.message === 'string') userMsg = parsed.message
    } catch { /* keep default */ }
    return NextResponse.json({ error: userMsg }, { status: 502 })
  }

  let lipilaData: Record<string, unknown>
  try {
    lipilaData = JSON.parse(rawBody)
  } catch {
    console.error('[initiate] Lipila non-JSON response:', rawBody)
    return NextResponse.json({ error: 'Unexpected response from payment provider.' }, { status: 502 })
  }

  // Store Lipila's referenceId so we can match it in the webhook if needed
  const lipilaReferenceId = lipilaData.referenceId as string | undefined
  await serviceSupabase
    .from('payments')
    .update({ lipila_reference: lipilaReferenceId ?? null })
    .eq('reference', reference)

  console.log('[initiate] Lipila STK push sent:', { reference, lipilaReferenceId, phone: normPhone })

  return NextResponse.json({ status: 'pending', lipila_reference: lipilaReferenceId })
}
