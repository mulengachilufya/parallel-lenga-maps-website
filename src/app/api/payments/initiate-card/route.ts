/**
 * POST /api/payments/initiate-card
 *
 * Initiates a Lipila card (Visa/Mastercard) collection.
 * Returns a cardRedirectionUrl — the client redirects the user there
 * to enter card details on Lipila's hosted payment page.
 *
 * After payment Lipila redirects to our redirectUrl (/dashboard/payment/complete)
 * and fires our webhook at /api/payments/webhook with the final status.
 *
 * Body: { reference: string, name: string }
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

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let reference: string, name: string
  try {
    ;({ reference, name } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!reference) {
    return NextResponse.json({ error: 'Missing reference' }, { status: 400 })
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

  // Derive amount server-side
  const planData = PLANS[payment.plan as TierSlug]
  if (!planData) {
    return NextResponse.json({ error: 'Unrecognised plan' }, { status: 400 })
  }

  const appUrl      = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
  const callbackUrl = `${appUrl}/api/payments/webhook`
  const redirectUrl = `${appUrl}/dashboard/payment/complete?reference=${reference}`
  const backUrl     = `${appUrl}/dashboard/payment?plan=${payment.plan}`

  // Split name into first/last (best-effort)
  const nameParts = (name || 'Lenga User').trim().split(/\s+/)
  const firstName = nameParts[0]
  const lastName  = nameParts.slice(1).join(' ') || nameParts[0]

  const email = session.user.email ?? ''

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
        // Customer info
        firstName,
        lastName,
        phoneNumber: '',
        email,
        city:    'Lusaka',
        country: 'Zambia',
        address: '',
        zip:     '',
        // Collection
        referenceId:   reference,
        amount:        planData.price,
        narration:     `Lenga Maps ${payment.plan} plan`,
        accountNumber: email,
        currency:      'USD',
        backUrl,
        redirectUrl,
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

  // Store Lipila's reference
  await serviceSupabase
    .from('payments')
    .update({ lipila_reference: lipilaReferenceId ?? null })
    .eq('reference', reference)

  console.log('[initiate-card] card redirect created:', { reference, lipilaReferenceId })

  return NextResponse.json({ cardRedirectionUrl })
}
