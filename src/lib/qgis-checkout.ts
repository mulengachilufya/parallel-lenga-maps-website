import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { planCtaHref } from '@/lib/pricing'

export const BROWSER_CHECKOUT_PATH = '/api/qgis/v1/browser-checkout'
const LIFETIME = 120_000

type Ticket = { userId: string; email: string; tokenHash: string; expiresAt: number }

function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Missing checkout signing key')
  return createHash('sha256').update('lenga:qgis:checkout:v1\0').update(secret).digest()
}

export function checkoutPath(userId: string, email: string, tokenHash: string) {
  const ticket: Ticket = { userId, email, tokenHash, expiresAt: Date.now() + LIFETIME }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(ticket), 'utf8'), cipher.final()])
  return BROWSER_CHECKOUT_PATH + '#' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

function openTicket(value: unknown): Ticket | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,2048}$/.test(value)) return null
  try {
    const bytes = Buffer.from(value, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    const ticket: Ticket = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'))
    return ticket.expiresAt > Date.now() ? ticket : null
  } catch {
    return null
  }
}

export async function browserCheckout(req: NextRequest, data: Record<string, unknown>) {
  const headers = { 'Cache-Control': 'no-store' }
  const fail = (message: string, status: number) => Response.json({ message }, { status, headers })
  const originHeader = req.headers.get('origin')
  try {
    const origin = new URL(originHeader ?? '')
    const loopback = origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)
    if (origin.origin !== originHeader || origin.host !== req.headers.get('host')
      || (origin.protocol !== 'https:' && !loopback)) {
      return fail('Open checkout directly from QGIS.', 403)
    }
  } catch {
    return fail('Open checkout directly from QGIS.', 403)
  }
  const ticket = openTicket(data.ticket)
  if (!ticket) return fail('This checkout link has expired. Open a new one from QGIS.', 403)
  if (data.step === 'preview') return Response.json({ email: ticket.email }, { headers })
  if (data.step !== 'continue') return fail('Choose Continue to checkout.', 400)

  const site = await createServerSupabase()
  const { data: existing, error: browserError } = await site.auth.getUser()
  if (browserError && browserError.name !== 'AuthSessionMissingError' && (!browserError.status || browserError.status >= 500)) {
    return fail('Sign-in is temporarily unavailable. Try again in a moment.', 503)
  }
  if (existing.user && existing.user.id !== ticket.userId) {
    return fail('This browser is signed into a different Lenga Maps account. Sign out on the website or reopen the link in a private window.', 409)
  }
  if (!existing.user) {
    const { data: signedIn, error } = await site.auth.verifyOtp({ type: 'email', token_hash: ticket.tokenHash })
    if (error || signedIn.user?.id !== ticket.userId || !signedIn.session) {
      return fail('This checkout link is expired or used. Open a new one from QGIS.', 403)
    }
  }
  return Response.json({ next: planCtaHref('individual') }, { headers })
}

export function checkoutPage() {
  const nonce = randomBytes(18).toString('base64')
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lenga Maps checkout</title></head>
<body><main><h1>Lenga Maps checkout</h1><p id="message" role="status">Checking the account from QGIS…</p>
<button id="continue" hidden>Continue to checkout</button>
<noscript>JavaScript is needed to continue with your QGIS sign-in.</noscript></main>
<script nonce="${nonce}">
const ticket = location.hash.slice(1)
history.replaceState(null, '', location.pathname)
const message = document.getElementById('message')
const button = document.getElementById('continue')
async function request(step) {
  const response = await fetch(location.pathname, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket, step }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message)
  return data
}
request('preview').then(({email}) => {
  message.textContent = 'Continue as ' + email
  button.hidden = false
}).catch(error => { message.textContent = error.message })
button.addEventListener('click', async () => {
  button.disabled = true
  try {
    const {next} = await request('continue')
    location.replace(next)
  } catch (error) {
    message.textContent = error.message
    button.disabled = false
  }
})
</script></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
    },
  })
}
