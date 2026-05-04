'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, User, AlertCircle, CheckCircle, GraduationCap, Briefcase, Building2, ArrowLeft } from 'lucide-react'
import { supabase, type AccountType, type PlanTier } from '@/lib/supabase'

// ── Plan definitions ──────────────────────────────────────────────────────────
//
// Note: signup itself is free and no longer asks the user to pick a plan.
// Every new account starts as plan='basic', plan_status='free' — they can
// browse the catalogue immediately, and the DownloadGate prompts payment
// only when they click Download on a real file.
//
// The `?plan=` URL param is still honoured: if the user came from a pricing
// CTA ("Get Pro Access"), we remember their intent and route them to the
// payment page after signup. Otherwise they land in the dashboard.

const ACCOUNT_COLORS: Record<AccountType, string> = {
  student:      '#15803d',
  professional: '#1E5F8E',
  business:     '#7c3aed',
}

const accountTypeOptions: { id: AccountType; label: string; icon: React.ReactNode }[] = [
  { id: 'student',      label: 'Student',          icon: <GraduationCap size={16} /> },
  { id: 'professional', label: 'GIS Professional',  icon: <Briefcase size={16} /> },
  { id: 'business',     label: 'Business / Company', icon: <Building2 size={16} /> },
]

// ── Page wrapper ──────────────────────────────────────────────────────────────

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark" />}>
      <SignupContent />
    </Suspense>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

function SignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Captured from the URL to remember the user's *intent* if they came in
  // from a pricing CTA — we DON'T show a plan selector at signup, but we
  // do honour ?plan=pro by routing the user straight to /dashboard/payment
  // after their account is created. Cold signups land in the dashboard.
  const intendedPlan       = (searchParams.get('plan') || '') as PlanTier | ''
  const defaultAccountType = (searchParams.get('type') || 'student') as AccountType

  const [name,            setName]            = useState('')
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accountType,     setAccountType]     = useState<AccountType>(defaultAccountType)
  const [showPassword,    setShowPassword]    = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [success,         setSuccess]         = useState(false)

  const acctColor = ACCOUNT_COLORS[accountType]

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      // Every new account starts with NO plan picked. plan_status='free'
      // (default), profiles.plan stays unset until the customer chooses,
      // pays, and is admin-approved. We deliberately do NOT include `plan`
      // in user_metadata — the dashboard would otherwise display them as
      // "Basic plan K25/month" before they ever paid for anything.
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name:    name,
            account_type: accountType,
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      // Decide where to land them after signup:
      //   1. They came from a pricing CTA with a non-basic intent → take
      //      them straight to the payment page for that plan
      //   2. Cold signup → drop them in the dashboard with a welcome banner
      const goToPayment =
        intendedPlan === 'pro' || intendedPlan === 'max'
      const destination = goToPayment
        ? `/dashboard/payment?plan=${intendedPlan}&type=${accountType}`
        : '/dashboard?welcome=new'

      // If email auto-confirmed: sync the chosen account_type from
      // user_metadata into the profiles row BEFORE redirecting. Without this
      // call, Supabase's handle_new_user trigger leaves the user labelled as
      // Basic Student regardless of the account type they picked. We swallow
      // errors — a profile-sync failure shouldn't block the user from
      // reaching the dashboard.
      if (data.session && data.user) {
        try {
          await fetch('/api/account/init-profile', { method: 'POST' })
        } catch { /* non-fatal */ }
        router.push(destination)
      } else {
        setSuccess(true)
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-10 shadow-lg max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-navy mb-3">Check your email!</h2>
          <p className="text-gray-500 mb-6">
            We&apos;ve sent a confirmation link to <strong>{email}</strong>.
            Click it to activate your account.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-primary text-white font-semibold px-6 py-3 rounded-xl hover:bg-navy transition-all"
          >
            Go to Login
          </Link>
        </motion.div>
      </div>
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex">
      {/* Left: image */}
      <div className="hidden lg:block flex-1 relative">
        <Image
          src="https://images.unsplash.com/photo-1575916048090-2a62952b7eb8?w=800&q=80"
          alt="African landscape"
          fill
          className="object-cover"
          unoptimized
        />
        <div className="absolute inset-0 gradient-primary opacity-80" />
        <div className="absolute inset-0 flex flex-col justify-end p-16">
          <blockquote className="text-white text-2xl font-bold leading-snug mb-4">
            &ldquo;Africa&apos;s most centralized<br />Environmental GIS Database.&rdquo;
          </blockquote>
          <div className="flex gap-6 text-white">
            {[
              { val: '54',   label: 'Countries' },
              { val: '15+',  label: 'Datasets'  },
              { val: '100%', label: 'African'   },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-accent font-black text-2xl">{s.val}</div>
                <div className="text-blue-200 text-xs uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 overflow-y-auto bg-dark">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-blue-300 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>

          <Link href="/" className="flex items-center gap-2 mb-10">
            <Image
              src="/images/branding/logo.png"
              alt="Lenga Maps"
              width={40}
              height={40}
              className="object-contain"
            />
            <span className="font-bold text-white text-lg">LENGA <span className="text-accent">MAPS</span></span>
          </Link>

          <h1 className="text-3xl font-black text-white mb-1">Create your free account</h1>
          <p className="text-blue-300 mb-8">Browse every dataset for free. You only pay when you decide to download.</p>

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

          {/* ── Account type ─────────────────────────────────────────────── */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-blue-200 mb-3">I am a…</label>
            <div className="grid grid-cols-3 gap-2">
              {accountTypeOptions.map((opt) => {
                const isActive = accountType === opt.id
                const color    = ACCOUNT_COLORS[opt.id]
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAccountType(opt.id)}
                    style={isActive ? { borderColor: color, backgroundColor: `${color}18`, color: 'white' } : {}}
                    className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs font-bold ${
                      isActive
                        ? 'shadow-md'
                        : 'border-white/20 text-blue-300 hover:border-white/40'
                    }`}
                  >
                    <span style={isActive ? { color: 'white' } : { color }}>{opt.icon}</span>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Free-signup reassurance ──────────────────────────────────── */}
          <div className="mb-6 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs text-blue-200 leading-relaxed">
              <span className="font-semibold text-white">Free to sign up</span> —
              browse every dataset, every country. Pick a plan only when
              you&apos;re ready to download.
            </p>
          </div>

          {/* ── Form fields ──────────────────────────────────────────────── */}
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">Full Name</label>
              <div className="relative">
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your full name"
                  className="w-full pl-11 pr-4 py-3.5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-white placeholder-gray-500 bg-white/5 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">Email Address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full pl-11 pr-4 py-3.5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-white placeholder-gray-500 bg-white/5 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Min. 8 characters"
                  className="w-full pl-11 pr-12 py-3.5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-white placeholder-gray-500 bg-white/5 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-200 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repeat password"
                  className="w-full pl-11 pr-4 py-3.5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-white placeholder-gray-500 bg-white/5 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ backgroundColor: acctColor }}
              className="w-full text-white font-bold py-3.5 rounded-xl transition-all shadow-md hover:opacity-90 hover:shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account…
                </>
              ) : (
                'Create Account'
              )}
            </button>

            <p className="text-xs text-blue-300/70 text-center">
              By creating an account you agree to our{' '}
              <Link href="/terms"   className="text-blue-300 hover:underline">Terms</Link> and{' '}
              <Link href="/privacy" className="text-blue-300 hover:underline">Privacy Policy</Link>.
            </p>
          </form>

          <p className="text-center text-blue-300 text-sm mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-accent font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
