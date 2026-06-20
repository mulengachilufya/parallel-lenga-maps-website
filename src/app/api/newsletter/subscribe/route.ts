/**
 * POST /api/newsletter/subscribe — landing-page newsletter sign-up.
 *
 * Body: { email: string, source?: string }
 * Writes one row to newsletter_subscribers via the service role (the table
 * has no public RLS policy — same posture as quote_requests). Phase 1 only
 * stores the address; no confirmation email is sent (that is Phase 2).
 *
 * A duplicate address returns success WITHOUT revealing it already exists,
 * to prevent email enumeration.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientIp, checkIpRateLimit, rateLimitedResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Public, unauthenticated form: 3 signups per IP per 10 minutes.
const NL_LIMIT  = 3
const NL_WINDOW = 600 // seconds

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  // Normalise to lower-case so the unique constraint dedupes case variants.
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  // Rate-limit valid submissions per IP so the table can't be scripted full.
  const rl = await checkIpRateLimit(service, 'newsletter', clientIp(req), NL_LIMIT, NL_WINDOW)
  if (!rl.ok) {
    return rateLimitedResponse(rl, 'Too many sign-up attempts. Please wait a few minutes.')
  }

  const source =
    typeof body.source === 'string' && body.source.trim()
      ? body.source.trim().slice(0, 100)
      : 'landing_page_popup'

  const { error } = await service
    .from('newsletter_subscribers')
    .insert({ email, source })

  if (error) {
    // 23505 = unique_violation: already subscribed. Confirm success silently
    // rather than leaking that the address exists (enumeration guard).
    if (error.code === '23505') {
      return NextResponse.json({ success: true, already_subscribed: true })
    }
    console.error('[newsletter] insert failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
