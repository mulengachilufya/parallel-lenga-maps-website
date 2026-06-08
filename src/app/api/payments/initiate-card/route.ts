/**
 * POST /api/payments/initiate-card
 *
 * Starts a Lipila card collection (Visa/Mastercard via 3GDirectPay).
 * Returns a `cardRedirectionUrl` that the browser must navigate to so the
 * customer can enter card details on the hosted checkout. Lipila then
 * redirects to our `redirectUrl` (/dashboard/payment/complete) and fires
 * the webhook at /api/payments/webhook with the final status.
 *
 * Body: { reference: string, name: string, phone: string,
 *         city?: string, address?: string, zip?: string }
 *
 * Lipila's card endpoint expects a NESTED body:
 *   {
 *     customerInfo:      { firstName, lastName, phoneNumber, email,
 *                          city, country (ISO-2), address, zip }
 *     collectionRequest: { referenceId, amount, narration, accountNumber,
 *                          currency, backUrl, redirectUrl }
 *   }
 *
 * Previous implementation sent a flat body with currency="USD" and
 * country="Zambia" (full name). Lipila rejected those silently — every
 * card attempt failed before reaching the hosted page.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { PLANS, type TierSlug } from '@/lib/pricing'
import { usdToZmw } from '@/lib/fx'

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
  if (/^[79]\d{8}$/.test(digits)) return `260${digits}` // 9-digit without leading 0
  return digits
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let reference: string
  let name:      string
  let phone:     string
  let city:      string
  let address:   string
  let zip:       string
  try {
    const body = await request.json()
    reference = String(body?.reference ?? '').trim()
    name      = String(body?.name      ?? '').trim()
    phone     = String(body?.phone     ?? '').trim()
    city      = String(body?.city      ?? 'Lusaka').trim().slice(0, 60)
    address   = String(body?.address   ?? 'Not provided').trim().slice(0, 120)
    zip       = String(body?.zip       ?? '10101').trim().slice(0, 20)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!reference) {
    return NextResponse.json({ error: 'Missing reference' }, { status: 400 })
  }
  if (!phone) {
    return NextResponse.json(
      { error: 'A phone number is required for card payments.' },
      { status: 400 },
    )
  }

  // Verify the payment record belongs to this user and is still pending.
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

  // Derive amount server-side.
  const planData = PLANS[payment.plan as TierSlug]
  if (!planData) {
    return NextResponse.json({ error: 'Unrecognised plan' }, { status: 400 })
  }

  // Lipila's card collection rails settle in ZMW (3GDirectPay/Zambian
  // acquirer). International cards still work — the customer's issuing
  // bank handles the FX. Convert the USD plan price to ZMW server-side
  // and let the gateway charge in Kwacha.
  const { zmw: amount, rate, baseRate } = await usdToZmw(planData.price)
  const currency = 'ZMW'
  console.log('[initiate-card] USD→ZMW', { usd: planData.price, zmw: amount, baseRate, rate })

  // Record the Kwacha amount we're charging.
  serviceSupabase
    .from('payments')
    .update({ amount_zmw: amount })
    .eq('reference', reference)
    .then(({ error }) => { if (error) console.error('[initiate-card] amount_zmw update failed:', error) })

  const appUrl      = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
  const callbackUrl = `${appUrl}/api/payments/webhook`
  const redirectUrl = `${appUrl}/dashboard/payment/complete?reference=${reference}`
  const backUrl     = `${appUrl}/dashboard/payment?plan=${payment.plan}`

  // Split name into first/last (best-effort).
  const nameParts = (name || 'Lenga User').trim().split(/\s+/)
  const firstName = nameParts[0]
  const lastName  = nameParts.slice(1).join(' ') || nameParts[0]

  const email      = session.user.email ?? ''
  const normPhone  = normalisePhone(phone)

  // ── Call Lipila Card Collections API ────────────────────────────────────
  let lipilaRes: Response
  try {
    lipilaRes = await fetch(`${LIPILA_BASE}/api/v1/collections/card`, {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'Content-Type': 'application/json',
        'x-api-key':    process.env.LIPILA_API_KEY!,
        'callbackUrl':  callbackUrl,
      },
      body: JSON.stringify({
        customerInfo: {
          firstName,
          lastName,
          phoneNumber: normPhone,
          email,
          city,
          country: 'ZM',  // ISO-2 code per Lipila docs
          address,
          zip,
        },
        collectionRequest: {
          referenceId:   reference,
          amount,
          narration:     `Lenga Maps ${payment.plan} plan`,
          accountNumber: normPhone,  // docs: phone-style identifier
          currency,
          backUrl,
          redirectUrl,
        },
      }),
    })
  } catch (err) {
    console.error('[initiate-card] Lipila network error:', err)
    return NextResponse.json(
      { error: 'Could not reach payment provider. Try again.' },
      { status: 502 }
    )
  }

  const rawBody = await lipilaRes.text()

  if (!lipilaRes.ok) {
    console.error('[initiate-card] Lipila rejected:', lipilaRes.status, rawBody)
    let userMsg = 'Card payment could not be started. Please try again.'
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
    console.error('[initiate-card] non-JSON response:', rawBody)
    return NextResponse.json({ error: 'Unexpected response from payment provider.' }, { status: 502 })
  }

  const cardRedirectionUrl = lipilaData.cardRedirectionUrl as string | undefined
  const lipilaReferenceId  = lipilaData.referenceId as string | undefined

  if (!cardRedirectionUrl) {
    console.error('[initiate-card] no cardRedirectionUrl in response:', lipilaData)
    return NextResponse.json({ error: 'No card redirect URL returned. Try again.' }, { status: 502 })
  }

  // Store Lipila's reference for webhook reconciliation.
  await serviceSupabase
    .from('payments')
    .update({ lipila_reference: lipilaReferenceId ?? null })
    .eq('reference', reference)

  console.log('[initiate-card] card redirect created:', { reference, lipilaReferenceId })

  return NextResponse.json({ cardRedirectionUrl })
}
