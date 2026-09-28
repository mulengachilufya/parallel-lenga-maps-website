// src/app/signup/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { safeNextPath } from '@/lib/safe-redirect'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/analytics'
import { isValidCountry } from '@/lib/countries'
import { SECTORS, isValidSector } from '@/lib/sectors'
import CountrySelect from '@/components/CountrySelect'
import ImageMosaic from '@/components/ImageMosaic'

export default function SignupPage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [country, setCountry]     = useState('')
  const [sector, setSector]       = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  // From an invite link: where to go after sign up, and the invited address.
  const [next, setNext]           = useState('/dashboard')
  const [lockedEmail, setLocked]  = useState('')

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    setNext(safeNextPath(sp.get('next'), '/dashboard'))
    const invited = (sp.get('email') ?? '').trim()
    if (invited) { setEmail(invited); setLocked(invited) }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first name and surname.')
      return
    }
    if (!isValidCountry(country)) {
      setError('Please pick your country from the list.')
      return
    }
    if (!isValidSector(sector)) {
      setError('Please choose the option that best describes you.')
      return
    }

    setLoading(true)
    track('signup_started', { source: 'signup_page' })

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name:        fullName,
          first_name:       firstName.trim(),
          last_name:        lastName.trim(),
          country,
          sector,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    track('signup_completed', { source: 'signup_page' })
    // Email confirmation is off, so /auth/callback never runs. Call
    // init-profile directly here so the profile is seeded and the welcome
    // email fires for this brand-new signup. Best-effort; the dashboard
    // self-heal is a backstop if this misses.
    await fetch('/api/account/init-profile', { method: 'POST' }).catch(() => {})
    router.push(next)
  }

  const inputClass =
    'w-full bg-[#0D2B45]/75 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-700 focus:outline-none focus:border-[#1E5F8E] text-sm'

  return (
    <main className="relative isolate min-h-screen flex items-center justify-center px-4 py-10">
      <ImageMosaic />
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <Link href="/">
            <img src="/images/branding/logo.png" alt="Lenga Maps" className="h-10 mx-auto mb-4" />
          </Link>
          <h1 className="text-2xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">Create your account</h1>
          <p className="text-blue-100 text-sm mt-2 drop-shadow-[0_1px_6px_rgba(0,0,0,0.7)]">
            Free to start: pick 3 datasets, or join your team&apos;s shared GIS workspace.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#0b1a2a]/70 backdrop-blur-xl border border-white/15 rounded-2xl p-8 space-y-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/5"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-blue-300 mb-2">First name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-blue-300 mb-2">Surname</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Surname"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-blue-300 mb-2">Country</label>
            <CountrySelect value={country} onChange={setCountry} />
          </div>

          <div>
            <label className="block text-sm text-blue-300 mb-2">Which best describes you?</label>
            <select
              required
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className={`${inputClass} ${sector ? 'text-white' : 'text-blue-700'}`}
            >
              <option value="" disabled>Select one…</option>
              {SECTORS.map((s) => (
                <option key={s.value} value={s.value} className="text-white bg-[#0D2B45]">
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-blue-300 mb-2">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={!!lockedEmail}
              placeholder="you@example.com"
              className={inputClass}
            />
            {lockedEmail && <p className="mt-1.5 text-xs text-blue-400">This is the address your invite was sent to.</p>}
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
              className={inputClass}
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
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-blue-200/80 text-xs">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-300 hover:text-white underline">
              Log in
            </Link>
          </p>
        </form>

        <p className="text-center text-blue-100/80 text-xs mt-4 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
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
