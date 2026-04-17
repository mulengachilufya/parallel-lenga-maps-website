import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LENCO_BASE = process.env.LENCO_SANDBOX === 'true'
  ? 'https://sandbox.lenco.co/access/v2'
  : 'https://api.lenco.co/access/v2'

export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reference } = params

  // Confirm this payment belongs to the current user
  const { data: payment, error: fetchError } = await serviceSupabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .eq('user_id', session.user.id)
    .single()

  if (fetchError || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  if (payment.status === 'successful') {
    return NextResponse.json({ status: 'successful', plan: payment.plan })
  }

  // Verify with Lenco
  const lencoRes = await fetch(`${LENCO_BASE}/collections/status/${reference}`, {
    headers: {
      Authorization: `Bearer ${process.env.LENCO_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!lencoRes.ok) {
    return NextResponse.json({ error: 'Lenco verification failed' }, { status: 502 })
  }

  const lencoData = await lencoRes.json()
  const txStatus = lencoData?.data?.status

  if (txStatus !== 'successful') {
    return NextResponse.json({ status: txStatus ?? 'pending' })
  }

  // Update payment record
  await serviceSupabase
    .from('payments')
    .update({
      status: 'successful',
      operator: lencoData.data?.operator ?? null,
      lenco_reference: lencoData.data?.lencoReference ?? null,
    })
    .eq('reference', reference)

  // Upgrade user plan in Supabase Auth metadata
  await serviceSupabase.auth.admin.updateUserById(session.user.id, {
    user_metadata: {
      ...session.user.user_metadata,
      plan: payment.plan,
      account_type: payment.account_type,
    },
  })

  return NextResponse.json({ status: 'successful', plan: payment.plan })
}
