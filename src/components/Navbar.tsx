'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, LayoutDashboard, LogOut, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const navLinks = [
  { href: '/about-us', label: 'About Us' },
  { href: '/services', label: 'Services' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/projects', label: 'For Teams' },
  { href: '/atlas', label: 'Atlas' },
  { href: '/datasets', label: 'Download GIS Data' },
  { href: '/docs/api', label: 'API' },
  { href: '/contact-us', label: 'Contact Us' },
]

/**
 * Public marketing navbar — session-aware.
 *
 * When a user is signed in:
 *   - "Login" + "Contact Us" CTA pair is replaced with a Dashboard link
 *     and a Sign Out button (plus a small email pill so the user can
 *     visually confirm which account they're on).
 *   - This is what stops /pricing, /atlas etc. from looking like the user
 *     got logged out the moment they leave the dashboard.
 *
 * Hidden surfaces:
 *   The navbar still hides on /admin (the admin pages have their own
 *   header). It NO LONGER hides on /dashboard — logged-in users need
 *   navigation to the rest of the site, and the dashboard's own header
 *   was tightened to not double up.
 */
export default function Navbar() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [email,    setEmail]    = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Establish identity with getUser() (server-verified) on mount, then keep it
  // live via onAuthStateChange. getUser() is used for the initial read — not
  // getSession() — so the email pill reflects the REAL signed-in account even
  // if the cookie is stale or was swapped by another Chrome profile/tab. The
  // listener then fires SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED across tabs.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      setEmail(user?.email ?? null)
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null)
      setAuthReady(true)
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  const handleSignOut = async () => {
    // Flip the UI immediately so there's no perceived lag.
    setEmail(null)
    setMenuOpen(false)

    // Revoke the session — attempt a full (server-side) sign-out but never let
    // a slow network freeze logout: race it against a short timeout. Then a
    // guaranteed local clear removes the cookie with no network round-trip.
    try {
      await Promise.race([
        supabase.auth.signOut(),                                   // global revoke
        new Promise((resolve) => setTimeout(resolve, 1200)),       // hard cap
      ])
    } catch { /* ignore */ }
    try {
      await supabase.auth.signOut({ scope: 'local' })             // guaranteed cookie clear
    } catch { /* already gone */ }

    // HARD navigation (not router.replace). A full document load wipes ALL
    // client state and the Next.js router cache, so nothing from the previous
    // session can survive, and middleware re-runs against the cleared cookie.
    // This is what makes logout actually LOOK like a logout.
    window.location.href = '/'
  }

  // Hide on /admin (own header). Allowed on /dashboard now.
  if (pathname?.startsWith('/admin')) return null

  const isSignedIn = !!email

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-dark/95 backdrop-blur-md shadow-lg border-b border-white/5'
          : 'bg-dark/35 backdrop-blur-[4px]'
      }`}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between h-20">
          {/* Logo — ALWAYS goes to /. Signed-in users have the gold
              "Dashboard" button on the right; routing the logo to /dashboard
              instead trapped them in the app with no obvious way home
              ("why can't someone access the website home page while in
              their account" — reported 2026-06-18). */}
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/images/branding/logo.png"
              alt="Lenga Maps"
              width={52}
              height={52}
              className="object-contain"
            />
          </Link>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-10">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={`text-[0.95rem] font-medium tracking-[0.01em] transition-colors duration-200 ${
                  pathname === link.href
                    ? 'text-gold'
                    : 'text-white/90 hover:text-gold'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side — auth-aware */}
          <div className="hidden lg:flex items-center gap-3">
            {!authReady ? (
              // Tiny placeholder so the layout doesn't jump while we wait
              // for the session check to resolve.
              <div className="w-32 h-9" />
            ) : isSignedIn ? (
              <>
                {/* Email pill so the user can SEE they're still signed in */}
                <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 text-white/90 text-xs font-medium px-3 py-2 rounded-lg">
                  <User size={12} className="opacity-80" />
                  <span className="max-w-[160px] truncate">{email}</span>
                </span>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 bg-gold text-[#1a1200] text-[0.95rem] font-bold px-5 py-3 hover:bg-gold-light transition-all hover:-translate-y-px"
                >
                  <LayoutDashboard size={15} />
                  Dashboard
                </Link>
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-[0.95rem] font-medium transition-colors"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                {/* CTA discipline: the marketing site sells data and a
                    trial. Primary action is "Get Started" — the funnel
                    entrance — not "Contact Us", which used to be the
                    gold button and trained visitors to email instead of
                    sign up. Login stays as the secondary text link. */}
                <Link
                  href="/login"
                  className="text-white/90 text-[0.95rem] font-medium hover:text-gold transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="bg-gold text-[#1a1200] text-[0.95rem] font-bold px-7 py-3 hover:bg-gold-light transition-all hover:-translate-y-px"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden p-2 text-white"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-dark border-t border-white/10"
          >
            <div className="px-5 py-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-4 py-3 text-[0.95rem] font-medium transition-colors ${
                    pathname === link.href
                      ? 'text-gold'
                      : 'text-white/80 hover:text-gold'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 flex gap-2">
                {isSignedIn ? (
                  <>
                    <Link
                      href="/dashboard"
                      className="flex-1 text-center py-3 bg-gold text-[#1a1200] text-sm font-bold"
                      onClick={() => setMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="flex-1 text-center py-3 border border-white/30 text-white text-sm font-medium"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="flex-1 text-center py-3 border border-white/30 text-white text-sm font-medium"
                      onClick={() => setMenuOpen(false)}
                    >
                      Login
                    </Link>
                    <Link
                      href="/signup"
                      className="flex-1 text-center py-3 bg-gold text-[#1a1200] text-sm font-bold"
                      onClick={() => setMenuOpen(false)}
                    >
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
