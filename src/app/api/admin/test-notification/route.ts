/**
 * POST /api/admin/test-notification
 *
 * Admin-only. Sends a fake "test payment" through the same Web3Forms email
 * path that real submissions use, so the operator can verify their inbox
 * receives notifications without needing a customer to actually pay.
 *
 * Returns a detailed status object — both whether Web3Forms accepted the
 * call and the underlying HTTP status. If this endpoint says "ok: true"
 * but you still don't get the email, the problem is downstream:
 *   - Check spam / Promotions tab
 *   - Confirm the destination email on web3forms.com matches the inbox
 *     you're checking (the To: address is fixed by access_key, not by us)
 *   - Add `noreply@web3forms.com` to your contacts so future ones land
 *     in Primary
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

export const dynamic = 'force-dynamic'

interface Web3FormsResponse {
  success?: boolean
  message?: string
}

export async function POST() {
  // Auth — admin only.
  const auth = createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY
  if (!accessKey) {
    return NextResponse.json({
      ok:        false,
      stage:     'config',
      error:     'NEXT_PUBLIC_WEB3FORMS_KEY is not set on Vercel.',
      hint:      'Add the key under Vercel → Settings → Environment Variables, then redeploy.',
    }, { status: 500 })
  }

  const stamp = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' })
  const message = [
    'This is a TEST notification — no customer paid anything.',
    '',
    `Triggered by:    ${user.email}`,
    `Server time:     ${stamp} Africa/Lusaka`,
    `Access key tail: …${accessKey.slice(-4)}`,
    '',
    'If you received this email, your /api/payments/manual notification',
    'pipeline is healthy. If this email never lands, check:',
    '  1. The "spam" / "Promotions" tab in your Gmail',
    '  2. That the inbox configured at web3forms.com for this access_key',
    '     matches the email you are currently checking',
    '  3. Add noreply@web3forms.com to your contacts so future ones',
    '     route straight to Primary',
  ].join('\n')

  let res: Response
  try {
    res = await fetch('https://api.web3forms.com/submit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({
        access_key: accessKey,
        from_name:  'Lenga Maps Payments (TEST)',
        name:       user.email ?? 'Lenga Maps Admin',
        email:      user.email ?? 'noreply@lengamaps.com',
        subject:    `[Lenga Maps] TEST — pipeline check at ${stamp}`,
        message,
        botcheck:   '',
      }),
    })
  } catch (err) {
    console.error('[test-notification] network error:', err)
    return NextResponse.json({
      ok:    false,
      stage: 'network',
      error: String(err),
      hint:  'Could not reach api.web3forms.com — usually transient. Retry once.',
    }, { status: 502 })
  }

  const body: Web3FormsResponse = await res.json().catch(() => ({}))
  if (!res.ok || !body.success) {
    return NextResponse.json({
      ok:                 false,
      stage:              'web3forms',
      http_status:        res.status,
      web3forms_message:  body.message ?? '(no message)',
      hint:               res.status === 401 || res.status === 403
        ? 'Web3Forms rejected the access_key. Verify it on web3forms.com → Dashboard.'
        : 'Web3Forms rejected the request. The message field above usually says why.',
    }, { status: 502 })
  }

  return NextResponse.json({
    ok:           true,
    stage:        'sent',
    http_status:  res.status,
    sent_at:      new Date().toISOString(),
    note:         'Web3Forms accepted the request. Check the inbox configured for this access_key — it should arrive within ~30 seconds. If it does not, look in spam.',
  })
}
