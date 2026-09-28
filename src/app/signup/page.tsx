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
    'w-full bg-[#0D2B45]/75 border border-white/10 rounded-xl px-4 py-2 sm:py-2.5 text-white placeholder-blue-300/60 focus:outline-none focus:border-[#F5B800]/70 text-base'

  return (
    <main className="relative isolate min-h-screen flex items-start sm:items-center justify-center px-4 pt-[76px] pb-4 sm:pt-[88px] sm:pb-4">
      <ImageMosaic />
      <div className="w-full max-w-md sm:max-w-2xl">

        <div className="text-center mb-3 sm:mb-5">
          <Link href="/">
            <img src="/images/branding/logo.png" alt="Lenga Maps" className="hidden" />
          </Link>
          <h1 className="text-[26px] sm:text-4xl font-extrabold tracking-tight text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.9)]">Create your account</h1>
          <p className="text-white text-sm sm:text-[17px] font-medium mt-1 sm:mt-2 [text-shadow:0_1px_10px_rgba(0,0,0,0.95)]">
            Free to start: pick 3 datasets, or join your team&apos;s shared GIS workspace.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#0b1a2a]/70 backdrop-blur-xl border border-white/15 rounded-2xl p-4 sm:p-7 space-y-3 sm:space-y-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/5"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm sm:text-[15px] font-medium text-blue-100 mb-1 sm:mb-1.5">First name</label>
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
              <label className="block text-sm sm:text-[15px] font-medium text-blue-100 mb-1 sm:mb-1.5">Surname</label>
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

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm sm:text-[15px] font-medium text-blue-100 mb-1 sm:mb-1.5">Country</label>
            <CountrySelect value={country} onChange={setCountry} />
          </div>

          <div>
            <label className="block text-sm sm:text-[15px] font-medium text-blue-100 mb-1 sm:mb-1.5">Which best describes you?</label>
            <select
              required
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className={`${inputClass} ${sector ? 'text-white' : 'text-blue-300/60'}`}
            >
              <option value="" disabled>Select one…</option>
              {SECTORS.map((s) => (
                <option key={s.value} value={s.value} className="text-white bg-[#0D2B45]">
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          </div>

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm sm:text-[15px] font-medium text-blue-100 mb-1 sm:mb-1.5">Email Address</label>
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
            <label className="block text-sm sm:text-[15px] font-medium text-blue-100 mb-1 sm:mb-1.5">Password</label>
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
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="sticky bottom-3 z-10 sm:static w-full bg-[#F5B800] hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#0D2B45] text-base font-bold py-3 sm:py-3.5 rounded-xl transition-colors shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] sm:shadow-none"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-blue-100/85 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-[#F5B800] font-semibold hover:underline">Log in</Link>
            <span className="block sm:inline text-xs text-blue-200/70 mt-1 sm:mt-0 sm:ml-2">
              By signing up you agree to our{' '}
              <Link href="/terms" className="underline hover:text-white">Terms</Link> and{' '}
              <Link href="/privacy" className="underline hover:text-white">Privacy Policy</Link>.
            </span>
          </p>
        </form>

      </div>
    </main>
  )
}
