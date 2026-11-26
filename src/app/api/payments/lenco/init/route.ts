import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { INDIVIDUAL_PRODUCTS, isPassProduct } from '@/lib/pricing'
import { lipilaConfig, isLipilaReference, normalizeMobileNumber, startLipilaCollection } from '@/lib/lipila'
import { amountFor, isLencoChannel, lencoConfig, newLencoReference } from '@/lib/lenco'

// The server picks the price and saves the order before contacting either provider.
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const MAX_PENDING_PER_HOUR = 10

/** Advertise each method only when its provider is configured. */
export async function GET() {
  return NextResponse.json({ enabled: lencoConfig() !== null, mobileMoneyEnabled: lipilaConfig() !== null })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const body: Record<string, unknown> = await req.json().catch(() => ({}))
  const rawProduct = body?.product
  const product = isPassProduct(rawProduct) ? rawProduct : null
  if (!product) return NextResponse.json({ error: 'That option is no longer available. Please reload the page.' }, { status: 400 })
  const rawChannel = body?.channel
  if (!isLencoChannel(rawChannel)) return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 })
  const channel = rawChannel
  const card = channel === 'card' ? lencoConfig() : null
  const mobile = channel === 'mobile-money' ? lipilaConfig() : null
  if (!card && !mobile) return NextResponse.json({ error: 'This payment method is unavailable.' }, { status: 503 })
  const reference = mobile && typeof body?.reference === 'string' ? body.reference : newLencoReference()
  if (mobile && !isLipilaReference(reference)) return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400 })
  const accountNumber = normalizeMobileNumber(body?.phone)
  if (mobile && !accountNumber) return NextResponse.json({ error: 'Enter a valid Zambian mobile number.' }, { status: 400 })

  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count, error: countError } = await service.from('lenco_payments').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('status', 'pending').gte('created_at', since)
  if (countError) return NextResponse.json({ error: 'Instant payment is temporarily unavailable.' }, { status: 503 })
  if ((count ?? 0) >= MAX_PENDING_PER_HOUR) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a little and try again.' }, { status: 429 })
  }

  const { data: prof } = await service.from('profiles').select('full_name, first_name, last_name').eq('id', user.id).maybeSingle()
  const fullName = prof?.full_name || [prof?.first_name, prof?.last_name].filter(Boolean).join(' ') || (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') || ''

  const amount_usd = INDIVIDUAL_PRODUCTS[product].price
  const { amount, currency } = amountFor(channel, amount_usd, card ?? { zmwPerUsd: mobile!.zmwPerUsd, cardCurrency: 'ZMW' })

  const { error } = await service.from('lenco_payments').insert({
    reference, user_id: user.id, user_email: user.email, user_name: fullName || null,
    plan: 'individual', product, amount_usd, amount_charged: amount, currency, channel,
  })
  if (error) {
    if (mobile && error.code === '23505') {
      const { data: existing } = await service.from('lenco_payments').select('id')
        .eq('reference', reference).eq('channel', channel).eq('user_id', user.id).eq('product', product).maybeSingle()
      if (existing) return NextResponse.json({ reference })
    }
    console.error('[lenco/init] insert failed:', error)
    return NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 500 })
  }

  if (mobile && accountNumber) {
    // A timeout can occur after Lipila receives the request. Keep checking this
    // reference instead of issuing a second collection.
    const status = await startLipilaCollection(mobile.apiKey, reference, amount, accountNumber, user.email).catch(() => 0)
    if ([400, 401, 403, 422].includes(status)) {
      await service.from('lenco_payments').update({ status: 'failed', failure_reason: `Lipila returned ${status}` })
        .eq('reference', reference).is('granted_at', null)
    }
    return NextResponse.json({ reference })
  }

  const [firstName, ...rest] = fullName.trim().split(/\s+/)
  return NextResponse.json({
    reference, amount, currency, channel,
    publicKey: card?.publicKey, widgetUrl: card?.widgetUrl,
    email: user.email, firstName: firstName || '', lastName: rest.join(' '),
    product,
  })
}
