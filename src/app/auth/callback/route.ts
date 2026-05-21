import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

/**
 * GET /auth/callback?code=...&next=...
 *
 * Supabase email-confirmation / magic-link landing page. The confirmation
 * email template in Supabase Auth points here (e.g.
 * https://www.lengamaps.com/auth/callback) — this route exchanges the one-time
 * code for a real session cookie, then redirects the user into the app.
 *
 * If anything fails, we send them to /login with an error query so they can
 * ask for a fresh link instead of landing on a generic Supabase page.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/dashboard?welcome=new'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin))
  }

  const supabase = createServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/callback] exchange failed:', error)
    return NextResponse.redirect(new URL('/login?error=expired_link', url.origin))
  }

  // Sync the user's chosen plan/account_type into profiles. Without this
  // step, email-confirmed signups always land as Basic Student because the
  // DB trigger writes column defaults instead of reading user_metadata.
  // We use a same-origin fetch so the cookie session set by exchange above
  // is forwarded to the route. Failures are non-fatal — the user still
  // reaches the dashboard, and we'll resync on next sign-in if needed.
  try {
    await fetch(new URL('/api/account/init-profile', url.origin), {
      method:  'POST',
      headers: { cookie: req.headers.get('cookie') ?? '' },
    })
  } catch (e) {
    console.error('[auth/callback] init-profile failed:', e)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
