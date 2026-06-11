// src/app/signup/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/analytics'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    track('signup_started', { source: 'signup_page' })

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          plan: 'free_trial',
          trial_started_at: new Date().toISOString(),
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    track('trial_started', { source: 'signup_page' })
    // Email confirmation is off, so /auth/callback never runs. Call
    // init-profile directly here so the profile is seeded and the welcome
    // email fires for this brand-new signup. Best-effort; the dashboard
    // self-heal is a backstop if this misses.
    await fetch('/api/account/init-profile', { method: 'POST' }).catch(() => {})
    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen bg-[#0D2B45] flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <Link href="/">
            <img src="/images/branding/logo.png" alt="Lenga Maps" className="h-10 mx-auto mb-4" />
          </Link>
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-blue-300 text-sm mt-2">
            3-day free trial included — full access, no payment needed to start.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#112236] border border-blue-900/60 rounded-2xl p-8 space-y-5"
        >
          <div>
            <label className="block text-sm text-blue-300 mb-2">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-[#0D2B45] border border-blue-900/60 rounded-xl px-4 py-3 text-white placeholder-blue-700 focus:outline-none focus:border-[#1E5F8E] text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-blue-300 mb-2">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[#0D2B45] border border-blue-900/60 rounded-xl px-4 py-3 text-white placeholder-blue-700 focus:outline-none focus:border-[#1E5F8E] text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-blue-300 mb-2">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full bg-[#0D2B45] border border-blue-900/60 rounded-xl px-4 py-3 text-white placeholder-blue-700 focus:outline-none focus:border-[#1E5F8E] text-sm"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#F5B800] hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#0D2B45] font-bold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Creating account...' : 'Create account — start free trial'}
          </button>

          <p className="text-center text-blue-500 text-xs">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-300 hover:text-white underline">
              Log in
            </Link>
          </p>
        </form>

        <p className="text-center text-blue-600 text-xs mt-4">
          By signing up you agree to our{' '}
          <Link href="/terms" className="underline hover:text-blue-400">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-blue-400">
            Privacy Policy
          </Link>.
        </p>

      </div>
    </main>
  )
}