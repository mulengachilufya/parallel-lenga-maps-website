import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  // getUser() (verified) not getSession() (cookie-trusting). Security audit
  // 2026-06-18: getSession lets a forged `sub` act as another user.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const plan = body?.plan
  if (!plan) {
    return NextResponse.json({ error: 'Missing plan' }, { status: 400 })
  }
  // Self-serve tiers only: enterprise is delisted (legacy) and the team tier
  // is quote-based — neither may enter checkout.
  if (!['starter','pro','max'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }
  // The payments table predates the flat (account-type-less) pricing model
  // and still has account_type NOT NULL. The new model has no account tiers,
  // so we record a constant 'individual'. Honour an explicit value if the
  // caller sends one (back-compat with older clients).
  const accountType = typeof body?.account_type === 'string' && body.account_type
    ? body.account_type
    : 'individual'

  const reference = `lm-${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const { error } = await serviceSupabase.from('payments').insert({
    user_id:      user.id,
    reference,
    plan,
    account_type: accountType,
    status:       'pending',
  })

  if (error) {
    console.error('Failed to create payment record:', error)
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }

  return NextResponse.json({ reference })
}
