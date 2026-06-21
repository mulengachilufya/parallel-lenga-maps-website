'use client'

/**
 * NewsletterSignupForm — the email capture used on the public /newsletter page
 * (and reusable elsewhere). Posts to /api/newsletter/subscribe, which stores the
 * address, adds it to the Resend Audience, and fires the welcome email.
 *
 * `source` is passed through so we can see which channel a signup came from
 * (e.g. newsletter_page_linkedin via /newsletter?src=linkedin).
 */

import { useState } from 'react'
import { CheckCircle, AlertCircle } from 'lucide-react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ErrorKind = '' | 'invalid' | 'failed'

export default function NewsletterSignupForm({ source = 'newsletter_page' }: { source?: string }) {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState<ErrorKind>('')

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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: value, source }),
      })
      if (!res.ok) throw new Error('request_failed')
      setSuccess(true)
    } catch {
      setError('failed')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex items-start gap-3 bg-white/5 border border-gold/30 rounded-xl px-4 py-4 max-w-md">
        <CheckCircle size={22} className="text-gold shrink-0 mt-0.5" />
        <div>
          <p className="text-white font-bold">You&apos;re in.</p>
          <p className="text-white/60 text-sm">The first edition lands on a Monday. Check your inbox for a welcome note.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white placeholder:text-white/30
                     rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-gold/60 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 bg-gold text-[#1a1200] font-bold text-sm px-6 py-3 rounded-lg
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
            <a href="mailto:newsletter@lengamaps.com" className="underline hover:text-red-200">
              newsletter@lengamaps.com
            </a>
            .
          </span>
        </p>
      )}

      <p className="text-white/40 text-xs mt-3">Free. Every Monday. Unsubscribe anytime.</p>
    </div>
  )
}
