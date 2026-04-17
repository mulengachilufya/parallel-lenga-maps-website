import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { plan, account_type, amount_zmw } = await request.json()

  if (!plan || !account_type) {
    return NextResponse.json({ error: 'Missing plan or account_type' }, { status: 400 })
  }

  const reference = `lm-${randomUUID().replace(/-/g, '').slice(0, 16)}`

  const { error } = await serviceSupabase.from('payments').insert({
    user_id: session.user.id,
    reference,
    plan,
    account_type,
    amount_zmw: amount_zmw ?? null,
    status: 'pending',
  })

  if (error) {
    console.error('Failed to create payment record:', error)
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }

  return NextResponse.json({ reference })
}
