'use client'

/**
 * NewsletterPopup — bottom-anchored, non-blocking newsletter sign-up shown on
 * the landing page only. Render it once inside the home page.
 *
 * Show-at-most-twice logic, tracked in localStorage under `lm_newsletter_state`:
 *   (no key)     first visit  → wait 8s, then show, write `seen_once`
 *   seen_once    second visit → show immediately, write `seen_twice`
 *   seen_twice   terminal — never show again (the "one more chance" was spent)
 *   dismissed    terminal — user clicked X or "No thanks"
 *   subscribed   terminal — user submitted their email
 *
 * `seen_twice` is not in the original brief's three-value list, but the brief's
 * own behaviour ("reappears once, then never again regardless of action")
 * needs a state that distinguishes a 1st view from a 2nd; it behaves exactly
 * like `dismissed` at load. Because the very first render is hidden and the
 * state is read in an effect (client-only), there is no flash before the check.
 */

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Mail, CheckCircle, AlertCircle } from 'lucide-react'

const STORAGE_KEY = 'lm_newsletter_state'
const SHOW_DELAY_MS = 8000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type NewsletterState = 'seen_once' | 'seen_twice' | 'dismissed' | 'subscribed'
type ErrorKind = '' | 'invalid' | 'failed'

function readState(): NewsletterState | null {
  try {
    return localStorage.getItem(STORAGE_KEY) as NewsletterState | null
  } catch {
    return null // private mode / disabled storage — treat as first visit
  }
}

function writeState(value: NewsletterState) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* storage unavailable — non-fatal, popup just isn't suppressed next time */
  }
}

export default function NewsletterPopup() {
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<ErrorKind>('')

  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Decide whether (and when) to appear. Runs once, client-side only.
  useEffect(() => {
    const state = readState()

    if (state === 'dismissed' || state === 'subscribed' || state === 'seen_twice') {
      return // terminal — never show again
    }

    if (state === 'seen_once') {
      // Second and final appearance. Mark terminal up front so a third visit
      // never shows it, whatever the visitor does (or doesn't do) this time.
      writeState('seen_twice')
      setVisible(true)
      return
    }

    // First visit: wait 8s, then show and record the first view.
    showTimer.current = setTimeout(() => {
      writeState('seen_once')
      setVisible(true)
    }, SHOW_DELAY_MS)

    return () => {
      if (showTimer.current) clearTimeout(showTimer.current)
    }
  }, [])

  // Clear the success auto-close timer if we unmount first.
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const dismiss = () => {
    if (!success) writeState('dismissed') // don't downgrade a completed signup
    setVisible(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError('invalid')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, source: 'landing_page_popup' }),
      })
      if (!res.ok) throw new Error('request_failed')

      // 200 covers both a fresh signup and a silent already-subscribed.
      writeState('subscribed')
      setSuccess(true)
      closeTimer.current = setTimeout(() => setVisible(false), 3000)
    } catch {
      setError('failed')
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      role="dialog"
      aria-label="Subscribe to the Lenga Maps newsletter"
      className="fixed z-40 bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[24rem] sm:max-w-[calc(100vw-3rem)]
                 bg-dark-light border border-gold/30 rounded-xl shadow-2xl shadow-black/50 p-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss newsletter signup"
        className="absolute right-3 top-3 text-white/40 hover:text-white transition-colors"
      >
        <X size={18} />
      </button>

      {success ? (
        <div className="flex items-start gap-3 pr-4 py-1">
          <CheckCircle size={20} className="text-gold shrink-0 mt-0.5" />
          <div>
            <p className="text-white font-bold">You&apos;re in.</p>
            <p className="text-white/60 text-sm">First edition lands Monday.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2 pr-5">
            <Mail size={15} className="text-gold shrink-0" />
            <span className="text-[0.68rem] font-bold tracking-[0.16em] text-gold uppercase">
              Earth, Maps &amp; Models
            </span>
          </div>

          <h3 className="text-white font-extrabold text-[1.05rem] leading-snug mb-1.5 pr-2">
            Get smarter about African geospatial data.
          </h3>
          <p className="text-white/55 text-sm leading-relaxed mb-4">
            The Lenga Maps newsletter. Every Monday.
          </p>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              className="flex-1 min-w-0 bg-white/5 border border-white/10 text-white placeholder:text-white/30
                         rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold/50 transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="shrink-0 bg-gold text-[#1a1200] font-bold text-sm px-4 py-2.5 rounded-lg
                         hover:bg-gold-light transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Subscribe'}
            </button>
          </form>

          {error === 'invalid' && (
            <p className="flex items-center gap-1.5 text-red-300 text-xs mt-2">
              <AlertCircle size={13} className="shrink-0" />
              Please enter a valid email address.
            </p>
          )}
          {error === 'failed' && (
            <p className="flex items-start gap-1.5 text-red-300 text-xs mt-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>
                Something went wrong. Try again or email{' '}
                <a
                  href="mailto:newsletter@lengamaps.com"
                  className="underline hover:text-red-200"
                >
                  newsletter@lengamaps.com
                </a>
                .
              </span>
            </p>
          )}

          <button
            type="button"
            onClick={dismiss}
            className="mt-3 text-white/35 hover:text-white/60 text-xs transition-colors"
          >
            No thanks
          </button>
        </>
      )}
    </motion.div>
  )
}
