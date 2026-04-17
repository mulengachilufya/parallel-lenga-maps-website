import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, createHash } from 'crypto'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function verifySignature(payload: string, signature: string): boolean {
  // Lenco: hash_key = SHA256(secret_key), then HMAC-SHA512(payload, hash_key)
  const hashKey = createHash('sha256').update(process.env.LENCO_SECRET_KEY!).digest('hex')
  const computed = createHmac('sha512', hashKey).update(payload).digest('hex')
  return computed === signature
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-lenco-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(rawBody)

  if (event.event !== 'collection.successful') {
    return NextResponse.json({ received: true })
  }

  const { reference, lencoReference, status } = event.data ?? {}

  if (!reference || status !== 'successful') {
    return NextResponse.json({ received: true })
  }

  // Look up the pending payment
  const { data: payment } = await serviceSupabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .single()

  if (!payment || payment.status === 'successful') {
    return NextResponse.json({ received: true })
  }

  // Mark payment successful
  await serviceSupabase
    .from('payments')
    .update({
      status: 'successful',
      operator: event.data?.operator ?? null,
      lenco_reference: lencoReference ?? null,
    })
    .eq('reference', reference)

  // Upgrade user plan
  await serviceSupabase.auth.admin.updateUserById(payment.user_id, {
    user_metadata: {
      plan: payment.plan,
      account_type: payment.account_type,
    },
  })

  return NextResponse.json({ received: true })
}
