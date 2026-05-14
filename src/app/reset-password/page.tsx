'use client'

/**
 * /reset-password
 *
 * Step 2 of the password-recovery flow. The user got here by clicking the
 * magic link in the email Supabase sent from /forgot-password.
 *
 * Supabase uses one of two link shapes depending on the project's Auth
 * settings:
 *   PKCE flow (default):    ?code=<one-time-code>
 *   Implicit flow (older):  #access_token=...&refresh_token=...&type=recovery
 *
 * We handle BOTH. The code/tokens are good for ~1 hour and exchange into a
 * full session, which is what lets us call updateUser({ password }) below.
 *
 * Also tolerates a directly-signed-in user landing here — they're allowed
 * to change their password without re-verifying email (same semantic as
 * Settings → Change password on most apps).
 */

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, Loader2, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function ResetPasswordContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  // Three UI states:
  //   'verifying'   — exchanging code / parsing token hash
  //   'ready'       — session established, show password form
  //   'invalid'     — no code, expired link, or exchange failed
  //   'success'     — password updated, about to redirect
  const [state, setState]               = useState<'verifying' | 'ready' | 'invalid' | 'success'>('verifying')
  const [invalidReason, setInvalidReason] = useState<string>('')
  const [password, setPassword]         = useState('')
  const [confirm, setConfirm]           = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')

  // ── Exchange the recovery code/token for a session on mount ────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // First check if a session already exists (e.g. user came here from
      // settings, or re-entered while still logged in). If so, allow them
      // to change password directly.
      const { data: { session: existing } } = await supabase.auth.getSession()
      if (existing) {
        if (!cancelled) setState('ready')
        return
      }

      // PKCE flow: `?code=...` in the URL — exchange for a session.
      const code = searchParams.get('code')
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (exErr) {
          console.error('[reset-password] exchange failed:', exErr)
          setInvalidReason(exErr.message || 'This link is invalid or has expired.')
          setState('invalid')
          return
        }
        setState('ready')
        return
      }

      // Implicit flow / older email templates: tokens come in the URL hash.
      // We need to parse them ourselves and call setSession().
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      if (hash && hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.slice(1))
        const access_token  = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token })
          if (cancelled) return
          if (setErr) {
            console.error('[reset-password] setSession failed:', setErr)
            setInvalidReason('This recovery link is invalid or has expired.')
            setState('invalid')
            return
          }
          // Clear the hash so the tokens don't sit in the URL.
          window.history.replaceState(null, '', window.location.pathname)
          setState('ready')
          return
        }
      }

      // No code, no token, no existing session → bad entry.
      setInvalidReason('This page should be opened from the password-reset email link.')
      setState('invalid')
    })()
    return () => { cancelled = true }
  }, [searchParams])

  // ── Submit new password ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) {
        setError(updErr.message || 'Could not update password. Try again.')
        setSaving(false)
        return
      }
      setState('success')
      // Brief delay so the success screen registers, then onward.
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (err) {
      console.error('[reset-password] unexpected:', err)
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  // ── Loading shell ─────────────────────────────────────────────────────
  if (state === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-sm">Verifying your reset link…</p>
        </div>
      </div>
    )
  }

  // ── Invalid / expired link ────────────────────────────────────────────
  if (state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-10 shadow-lg max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} className="text-red-600" />
          </div>
          <h2 className="text-2xl font-black text-navy mb-2">Link invalid or expired</h2>
          <p className="text-gray-500 mb-6 text-sm">
            {invalidReason || 'This reset link is no longer valid. Request a fresh one and try again.'}
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/forgot-password"
              className="inline-flex items-center justify-center gap-2 bg-primary text-white font-semibold px-6 py-3 rounded-xl hover:bg-navy transition-all"
            >
              Request a new link
            </Link>
            <Link href="/login" className="text-sm text-gray-500 hover:text-primary py-2">
              Back to login
            </Link>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────
  if (state === 'success') {
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
          <h2 className="text-2xl font-black text-navy mb-2">Password updated</h2>
          <p className="text-gray-500 text-sm">Taking you to your dashboard…</p>
        </motion.div>
      </div>
    )
  }

  // ── Password form ─────────────────────────────────────────────────────
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

        <h1 className="text-3xl font-black text-navy mb-2">Set a new password</h1>
        <p className="text-gray-500 mb-8">Choose something at least 8 characters long.</p>

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
            <label className="block text-sm font-semibold text-navy mb-2">New password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                minLength={8}
                placeholder="Min. 8 characters"
                className="w-full pl-11 pr-12 py-3.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-navy mb-2">Confirm password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                placeholder="Repeat the password"
                className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-navy disabled:opacity-60 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving…
              </>
            ) : (
              'Update password'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
