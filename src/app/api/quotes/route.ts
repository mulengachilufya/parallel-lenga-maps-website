/**
 * POST /api/quotes — public quote-request form for the team tier
 * ("For Project Teams and Businesses", /projects).
 *
 * No payment is ever taken for this tier on the site: the form writes a row
 * to quote_requests (service role; the table has no public RLS policies) and
 * notifies the founder by email. Provisioning is manual via /admin.
 *
 * Spam posture: honeypot field + required-field validation + length caps.
 * Good enough for a low-traffic B2B form; revisit if junk shows up.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, quoteRequestAdminEmail, quoteAckEmail } from '@/lib/email'
import { clientIp, checkIpRateLimit, rateLimitedResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Public, unauthenticated form: 5 submissions per IP per 10 minutes. Enough
// for a genuine person fixing typos and resubmitting; cuts off a script.
const QUOTE_LIMIT  = 5
const QUOTE_WINDOW = 600 // seconds

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t || null
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // Honeypot: real users never fill "website".
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true }) // silently drop bots
  }

  const org_name     = str(body.org_name, 200)
  const email        = str(body.email, 200)
  const contact_name = str(body.contact_name, 200)
  const sector       = str(body.sector, 40)
  const region       = str(body.region, 200)
  const datasets_interest = str(body.datasets_interest, 1000)
  const notes        = str(body.notes, 2000)
  const seatsRaw     = Number(body.seats)
  const seats        = Number.isFinite(seatsRaw) && seatsRaw > 0
    ? Math.min(Math.round(seatsRaw), 10_000) : null

  if (!org_name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: 'validation', message: 'Organisation name and a valid email are required.' },
      { status: 400 },
    )
  }

  // Rate-limit only well-formed submissions (the ones that would write a row
  // and fire two emails). Honeypot + malformed requests already returned above.
  const rl = await checkIpRateLimit(service, 'quotes', clientIp(req), QUOTE_LIMIT, QUOTE_WINDOW)
  if (!rl.ok) {
    return rateLimitedResponse(rl, "You've sent a few requests already. Please wait a few minutes, or email lengamaps@gmail.com directly.")
  }

  const fields = { org_name, contact_name, email, sector, region, seats, datasets_interest, notes }

  const { error } = await service.from('quote_requests').insert(fields)
  if (error) {
    console.error('[quotes] insert failed:', error)
    return NextResponse.json(
      { error: 'server', message: 'Could not submit your request. Please email lengamaps@gmail.com.' },
      { status: 500 },
    )
  }

  // Notifications are best-effort: the row is safely in the pipeline either
  // way and the admin view shows it. Never fail the submission over email.
  await sendEmail(quoteRequestAdminEmail(fields)).catch(() => false)
  await sendEmail(quoteAckEmail(email, contact_name, org_name)).catch(() => false)

  return NextResponse.json({ ok: true })
}
