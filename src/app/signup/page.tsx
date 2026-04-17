'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, User, AlertCircle, CheckCircle, GraduationCap, Briefcase, Building2 } from 'lucide-react'
import { supabase, PLAN_PRICING, type AccountType, type PlanTier } from '@/lib/supabase'
import LencoPayWidget from '@/components/LencoPayWidget'

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLAN_DESCS: Record<PlanTier, string> = {
  basic: '3 countries · 4 core datasets · 10 files/month',
  pro:   'All 54 countries · 9 datasets · 25 files/month',
  max:   'All 54 countries · 15+ datasets · unlimited downloads',
}

const PLAN_COLORS: Record<PlanTier, string> = {
  basic: '#1E5F8E',
  pro:   '#F5B800',
  max:   '#7c3aed',
}

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

const standardPlans: PlanTier[] = ['basic', 'pro', 'max']

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultPlan        = (searchParams.get('plan') || 'basic') as PlanTier
  const defaultAccountType = (searchParams.get('type') || 'student') as AccountType

  const [name,            setName]            = useState('')
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedPlan,    setSelectedPlan]    = useState<PlanTier>(defaultPlan)
  const [accountType,     setAccountType]     = useState<AccountType>(defaultAccountType)
  const [showPassword,    setShowPassword]    = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [success,         setSuccess]         = useState(false)
  const [pendingPayment,  setPendingPayment]  = useState<{ userId: string; email: string; name: string } | null>(null)

  const isBusiness    = accountType === 'business'
  const acctColor     = ACCOUNT_COLORS[accountType]
  const effectivePlan = isBusiness ? 'basic' : selectedPlan

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
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name:    name,
            plan:         effectivePlan,
            account_type: accountType,
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      const priceData = PLAN_PRICING[accountType]?.[effectivePlan]
      const hasZmwPrice = !!priceData?.zmw

      // If session exists (email auto-confirmed) and plan has ZMW price → show payment step
      if (data.session && data.user && hasZmwPrice) {
        setPendingPayment({ userId: data.user.id, email, name })
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

  // ── Payment step (session exists, plan has ZMW price) ──────────────────────
  if (pendingPayment) {
    const priceData = PLAN_PRICING[accountType]?.[effectivePlan]
    const amountZmw = priceData?.zmw ?? 0
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-10 shadow-lg max-w-md w-full"
        >
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">💳</span>
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Activate your plan</h2>
            <p className="text-blue-300 text-sm">
              Complete payment to activate your{' '}
              <span className="text-white font-semibold capitalize">{effectivePlan}</span> plan.
            </p>
          </div>

          <div className="bg-white/5 rounded-xl p-4 mb-6 text-sm text-blue-200 space-y-1">
            <div className="flex justify-between"><span>Plan</span><span className="text-white font-bold capitalize">{effectivePlan}</span></div>
            <div className="flex justify-between"><span>Account type</span><span className="text-white font-bold capitalize">{accountType}</span></div>
            <div className="flex justify-between"><span>Amount</span><span className="text-yellow-400 font-bold">K{amountZmw}/month</span></div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <LencoPayWidget
            userId={pendingPayment.userId}
            email={pendingPayment.email}
            firstName={pendingPayment.name.split(' ')[0]}
            plan={effectivePlan}
            accountType={accountType}
            amountZmw={amountZmw}
            onSuccess={() => setSuccess(true)}
            onError={(msg) => setError(msg)}
          />

          <button
            type="button"
            onClick={() => setSuccess(true)}
            className="w-full text-center text-xs text-blue-400 hover:text-blue-200 mt-4 transition-colors"
          >
            Skip for now — I&apos;ll pay later
          </button>
        </motion.div>
      </div>
    )
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
          <Link href="/" className="flex items-center gap-2 mb-10">
            <svg viewBox="0 0 40 40" className="w-9 h-9">
              <circle cx="20" cy="20" r="18" fill="#1E5F8E" />
              <ellipse cx="20" cy="20" rx="8" ry="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
              <line x1="2" y1="20" x2="38" y2="20" stroke="#F5B800" strokeWidth="1.5" />
              <circle cx="20" cy="20" r="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
            </svg>
            <span className="font-bold text-white text-lg">LENGA <span className="text-accent">MAPS</span></span>
          </Link>

          <h1 className="text-3xl font-black text-white mb-1">Create your account</h1>
          <p className="text-blue-300 mb-8">Get instant access to African GIS data.</p>

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

          {/* ── Plan selector ─────────────────────────────────────────────── */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-blue-200 mb-3">Choose Your Plan</label>

            {isBusiness ? (
              /* Business — single fixed plan */
              <div
                className="p-4 rounded-xl border-2"
                style={{ borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.12)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-white">Business</span>
                  <div className="text-right">
                    <span className="font-black text-lg text-purple-400">$60</span>
                    <span className="text-xs text-blue-300">/month</span>
                  </div>
                </div>
                <p className="text-xs text-blue-300">All datasets · 3 team seats · commercial rights</p>
              </div>
            ) : (
              /* Student / Professional — 3 plan options */
              <div className="space-y-2">
                {standardPlans.map((planId) => {
                  const isActive  = selectedPlan === planId
                  const priceData = PLAN_PRICING[accountType]?.[planId]
                  const color     = PLAN_COLORS[planId]
                  return (
                    <button
                      key={planId}
                      type="button"
                      onClick={() => setSelectedPlan(planId)}
                      style={isActive ? { borderColor: color, backgroundColor: `${color}14` } : {}}
                      className={`w-full p-3.5 rounded-xl border-2 text-left transition-all ${
                        isActive ? 'shadow-md' : 'border-white/20 hover:border-white/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-sm">{planId.charAt(0).toUpperCase() + planId.slice(1)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* ZMW price */}
                          {priceData?.zmw && (
                            <span className="font-black text-sm" style={{ color }}>
                              K{priceData.zmw}<span className="text-xs font-normal text-blue-300">/mo</span>
                            </span>
                          )}
                          {/* USD badge */}
                          {priceData?.usd && (
                            <span className="inline-flex items-center gap-0.5 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                              ${priceData.usd}/mo
                            </span>
                          )}
                          {/* radio dot */}
                          <div
                            className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                            style={{ borderColor: isActive ? color : 'rgba(255,255,255,0.3)' }}
                          >
                            {isActive && (
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-blue-300">{PLAN_DESCS[planId]}</p>
                    </button>
                  )
                })}
              </div>
            )}
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
