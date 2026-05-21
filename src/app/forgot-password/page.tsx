'use client'

/**
 * /forgot-password
 *
 * Standard Supabase password-recovery flow, step 1:
 *   1. User enters their email.
 *   2. We call supabase.auth.resetPasswordForEmail(email, { redirectTo })
 *      with redirectTo = `${origin}/reset-password`.
 *   3. Supabase emails them a one-click magic link containing a code.
 *   4. Clicking that link lands them on /reset-password where step 2
 *      (set the new password) happens.
 *
 * We deliberately return the same "if an account exists we sent you an
 * email" message whether or not the address is registered, so this page
 * can't be used as an email-enumeration oracle.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Mail, AlertCircle, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [sent, setSent]         = useState(false)

  // Already signed in? Send them to the dashboard — they don't need to reset.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session) router.replace('/dashboard')
    })
    return () => { cancelled = true }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Please enter the email address you signed up with.')
      return
    }
    setLoading(true)
    try {
      // Build the redirect URL using the current origin so this works on
      // localhost, preview deploys, and production without env config.
      const redirectTo = `${window.location.origin}/reset-password`
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo },
      )
      if (authError) {
        // Anti-enumeration: only surface infrastructure errors (rate-limit,
        // network). "User not found" still shows the success screen so the
        // attacker can't tell whether the email exists.
        if (authError.status === 429) {
          setError('Too many requests. Wait a minute and try again.')
        } else {
          // Log for our own audit but show the generic success state.
          console.error('[forgot-password]', authError)
          setSent(true)
        }
        return
      }
      setSent(true)
    } catch (err) {
      console.error('[forgot-password] unexpected:', err)
      setError('Something went wrong. Please try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  // ── Success state ──────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-10 shadow-lg max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-navy mb-3">Check your email</h2>
          <p className="text-gray-600 mb-2 leading-relaxed">
            If an account exists for <strong>{email}</strong>, we&apos;ve just sent it a
            password-reset link. Click the link in the email to choose a new password.
          </p>
          <p className="text-gray-400 text-sm mb-6">
            Look in your Spam / Promotions tab if you don&apos;t see it within a couple of
            minutes. The link expires in 1 hour.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-primary text-white font-semibold px-6 py-3 rounded-xl hover:bg-navy transition-all"
            >
              Back to login
            </Link>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="text-sm text-gray-500 hover:text-primary py-2"
            >
              Use a different email
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to login
        </Link>

        <Link href="/" className="flex items-center gap-2 mb-10">
          <Image
            src="/images/branding/logo.png"
            alt="Lenga Maps"
            width={40}
            height={40}
            className="object-contain"
          />
          <span className="font-bold text-navy text-lg">LENGA <span className="text-accent">MAPS</span></span>
        </Link>

        <h1 className="text-3xl font-black text-navy mb-2">Reset your password</h1>
        <p className="text-gray-500 mb-8">
          Enter the email you signed up with. We&apos;ll send a one-click link to
          choose a new password.
        </p>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm"
          >
            <AlertCircle size={16} />
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-navy mb-2">Email Address</label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-navy disabled:opacity-60 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sending link…
              </>
            ) : (
              'Send reset link'
            )}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          Remember your password?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
