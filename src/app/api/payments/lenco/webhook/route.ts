import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { lencoConfig, verifyWebhookSignature } from '@/lib/lenco'
import { finalizeLencoPayment } from '@/lib/lenco-finalize'

/**
 * POST /api/payments/lenco/webhook
 *
 * Lenco calls this when a collection succeeds or fails, even if the customer
 * closed the tab. Set the URL in Lenco dashboard > Lenco Pay > Webhook:
 *   https://YOUR-DOMAIN/api/payments/lenco/webhook
 *
 * Two protections: the signature must be valid (proves it came from Lenco),
 * and even then we do not believe the body, we ask Lenco's API about the
 * reference (finalizeLencoPayment). A temporary failure returns 503 so Lenco can retry.
 */
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const cfg = lencoConfig()
  if (!cfg) return NextResponse.json({ ok: false }, { status: 503 })

  const raw = await req.text()
  if (!verifyWebhookSignature(raw, req.headers.get('x-lenco-signature'), cfg.secretKey)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let event: { event?: string; data?: { reference?: string | null } } = {}
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const reference = event?.data?.reference
  const relevant = event?.event === 'collection.successful' || event.event === 'collection.failed' || event.event === 'collection.settled'
  if (relevant && typeof reference === 'string' && /^[A-Za-z0-9._-]{6,80}$/.test(reference)) {
    const result = await finalizeLencoPayment(service, cfg, reference)
    if (result.state === 'error') return NextResponse.json({ ok: false }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
