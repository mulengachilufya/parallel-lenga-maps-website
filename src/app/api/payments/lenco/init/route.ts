import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { INDIVIDUAL_PRODUCTS, isPassProduct } from '@/lib/pricing'
import { amountFor, isLencoChannel, lencoConfig, newLencoReference } from '@/lib/lenco'

/**
 * POST /api/payments/lenco/init   body: { product, channel }
 *
 * Step 1 of an instant payment. The browser tells us WHAT it wants (which
 * pass, card or mobile money). We decide the price, create a pending row, and
 * hand back what the Lenco widget needs. The amount is never taken from the
 * browser.
 */
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const MAX_PENDING_PER_HOUR = 10

/** The pay page asks this once so it only offers instant payment when Lenco is configured. */
export async function GET() {
  return NextResponse.json({ enabled: lencoConfig() !== null })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const cfg = lencoConfig()
  if (!cfg) return NextResponse.json({ error: 'Instant payment is not available right now. Please use another method.' }, { status: 503 })

  const body: Record<string, unknown> = await req.json().catch(() => ({}))
  const rawProduct = body?.product
  const product = isPassProduct(rawProduct) ? rawProduct : null
  if (!product) return NextResponse.json({ error: 'That option is no longer available. Please reload the page.' }, { status: 400 })
  const rawChannel = body?.channel
  if (!isLencoChannel(rawChannel)) return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 })
  const channel = rawChannel

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
  const { amount, currency } = amountFor(channel, amount_usd, cfg)
  const reference = newLencoReference()

  const { error } = await service.from('lenco_payments').insert({
    reference, user_id: user.id, user_email: user.email, user_name: fullName || null,
    plan: 'individual', product, amount_usd, amount_charged: amount, currency, channel,
  })
  if (error) {
    console.error('[lenco/init] insert failed:', error)
    return NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 500 })
  }

  const [firstName, ...rest] = fullName.trim().split(/\s+/)
  return NextResponse.json({
    reference, amount, currency, channel,
    publicKey: cfg.publicKey, widgetUrl: cfg.widgetUrl,
    email: user.email, firstName: firstName || '', lastName: rest.join(' '),
    product,
  })
}
