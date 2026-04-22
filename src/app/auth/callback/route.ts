import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

/**
 * GET /auth/callback?code=...&next=...
 *
 * Supabase email-confirmation / magic-link landing page. The confirmation
 * email template in Supabase Auth points here (e.g.
 * https://lengamaps.com/auth/callback) — this route exchanges the one-time
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

  return NextResponse.redirect(new URL(next, url.origin))
}
