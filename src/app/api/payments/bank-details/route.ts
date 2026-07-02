/**
 * POST /api/payments/bank-details
 *
 * Fired when a signed-in user chooses the card / bank-transfer option. It:
 *   1. Emails the customer our bank-transfer details on the dedicated Resend
 *      `manual_payment` channel (see src/lib/email.ts bankTransferDetailsEmail).
 *   2. Returns those details so the panel shows them inline too (not secret),
 *      which keeps things working even if the email is slow / filtered.
 *
 * Best-effort email: returns 200 with `emailed:false` if the send fails.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { SELF_SERVE_PLAN_ORDER, type TierSlug } from '@/lib/pricing'
import { BANK_DETAILS } from '@/lib/bank-details'
import { sendEmail, bankTransferDetailsEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Best-effort in-memory throttle so a double-click / quick re-open doesn't fire
// two emails from the same warm instance. Not a security control.
const lastSent = new Map<string, number>()
const THROTTLE_MS = 15_000

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  }

  let body: { plan?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const plan = body.plan as TierSlug
  if (!SELF_SERVE_PLAN_ORDER.includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 })
  }

  // First name for the greeting: prefer the profile, fall back to metadata.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const firstName =
    profile?.first_name ||
    (typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name : '') ||
    (profile?.full_name || '').split(/\s+/)[0] ||
    ''

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')

  // Throttle per user
  const now  = Date.now()
  const last = lastSent.get(user.id) ?? 0
  let emailed = false

  if (now - last < THROTTLE_MS) {
    emailed = true // treat as already-sent; don't hammer Resend
  } else {
    emailed = await sendEmail(
      bankTransferDetailsEmail({ to: user.email, firstName, plan, appUrl }),
      'manual_payment',
    )
    if (emailed) lastSent.set(user.id, now)
  }

  return NextResponse.json({
    ok:          true,
    emailed,
    email:       user.email,
    bankDetails: BANK_DETAILS,
  })
}
