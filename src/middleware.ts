import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Auth middleware.
 *
 * Two jobs:
 *  1. Keep the Supabase session cookie fresh on every request.
 *  2. Redirect anonymous users away from gated routes BEFORE the React
 *     shell renders. This fixes the classic SPA flash-of-wrong-UI: a
 *     logged-out user could briefly see the dashboard chrome and the
 *     loading spinner before client-side auth kicked in and bounced them.
 *
 * Gated route families:
 *   /dashboard, /dashboard/*  — user must be signed in
 *   /admin, /admin/*          — user must be signed in (admin email check
 *                                still happens server-side in /api/admin/me
 *                                and the layout, so non-admins get bounced
 *                                from /admin pages by the API/layout, not
 *                                middleware)
 */
const GATED_PREFIXES = ['/dashboard', '/admin']

function isGated(pathname: string): boolean {
  return GATED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          )
          res = NextResponse.next({ request: { headers: req.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  if (!session && isGated(req.nextUrl.pathname)) {
    const loginUrl = new URL('/login', req.url)
    // Preserve the original destination so /login can bounce them back
    // after they sign in. nextPath is sanitised on the login page.
    loginUrl.searchParams.set(
      'next',
      req.nextUrl.pathname + req.nextUrl.search,
    )
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
