'use client'

/**
 * /dashboard/payment
 *
 * Card-first checkout. Layout hierarchy:
 *   1. Hero: plan summary with subtle plan switcher (the WHAT)
 *   2. Card payment panel — primary, large, authentic logos (the HOW)
 *   3. Mobile money — collapsed disclosure under a thin divider
 *
 * The page is intentionally not "card-equal-tabs". Cards work everywhere;
 * mobile money is the local-market fallback.
 */

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowLeft, ShieldCheck, CheckCircle2, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS, SELF_SERVE_PLAN_ORDER, type TierSlug } from '@/lib/pricing'
import CardPayPanel from '@/components/CardPayPanel'
import MomoPayPanel from '@/components/MomoPayPanel'
import { track } from '@/lib/analytics'

function PaymentInner() {
  const router = useRouter()
  const params = useSearchParams()
  const planParam  = params.get('plan')  as TierSlug | null
  const isRenewal  = params.get('renew') === '1'

  const [loading,  setLoading]  = useState(true)
  const [plan,     setPlan]     = useState<TierSlug>('starter')
  const [email,    setEmail]    = useState('')
  const [name,     setName]     = useState('')
  const [paid,     setPaid]     = useState(false)
  const [showMomo, setShowMomo] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const next = encodeURIComponent(`/dashboard/payment${window.location.search}`)
        router.replace(`/login?next=${next}`)
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, full_name')
        .eq('id', session.user.id)
        .single()

      // Checkout handles self-serve tiers only — enterprise is legacy and
      // team is quote-based, so both fall back to starter here.
      const resolved =
        (planParam && SELF_SERVE_PLAN_ORDER.includes(planParam))
          ? planParam
          : (SELF_SERVE_PLAN_ORDER.includes((profile?.plan as TierSlug) ?? 'starter')
              ? (profile?.plan as TierSlug)
              : 'starter')

      setPlan(resolved)
      setEmail(session.user.email || '')
      setName(profile?.full_name || session.user.user_metadata?.full_name || '')
      setLoading(false)
      track('payment_initiated', {
        plan: resolved,
        renewal: isRenewal,
      })
    }
    load()
  }, [planParam, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  const planData   = PLANS[plan]
  const priceLabel = planData.priceLabel

  // ── Success screen ─────────────────────────────────────────────────────
  if (paid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-10 sm:p-12 shadow-xl max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-3xl font-black text-navy tracking-tight mb-2">You&apos;re in.</h2>
          <p className="text-gray-500 mb-6">
            Your <strong>{planData.name}</strong> plan is active. Every dataset is ready to download.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-navy text-white font-bold px-6 py-3 rounded-xl hover:bg-primary transition-all"
          >
            Go to dashboard
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="h-20" />

      {/* Slim top bar */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors">
          <ArrowLeft size={14} /> Back
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <ShieldCheck size={13} /> Secured by Lipila
        </span>
      </div>

      {/* ── HERO: plan summary + asymmetric typography ─────────────────── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 mb-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-navy text-white rounded-3xl p-7 sm:p-10 shadow-[0_24px_48px_-24px_rgba(11,21,48,0.4)] relative overflow-hidden"
        >
          {/* Decorative accent */}
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-40" />

          <div className="relative">
            {isRenewal && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-widest bg-accent/20 text-accent px-2.5 py-1 rounded-full mb-4">
                Renewing
              </span>
            )}
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-3">
              {isRenewal ? 'Renew your plan' : 'Activate your plan'}
            </p>

            <div className="flex items-end gap-3 flex-wrap mb-1">
              <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-none">
                {planData.name}
              </h1>
              <div className="pb-1.5">
                <span className="text-2xl sm:text-3xl font-black text-accent">{priceLabel}</span>
                <span className="text-sm text-white/60 ml-1">/month</span>
              </div>
            </div>
            <p className="text-sm text-white/70 max-w-md mb-6">{planData.description}</p>

            {/* Subtle plan switcher */}
            <details className="group">
              <summary className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white cursor-pointer list-none">
                Change plan
                <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SELF_SERVE_PLAN_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPlan(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      s === plan
                        ? 'bg-white text-navy'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    {PLANS[s].name} <span className="opacity-60">· {PLANS[s].priceLabel}</span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        </motion.div>
      </div>

      {/* ── CARD PANEL — primary, large, the visual focus ───────────────── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-7 sm:p-10 shadow-sm border border-gray-100"
        >
          <CardPayPanel
            plan={plan}
            amountLabel={`${priceLabel} USD`}
            name={name}
          />
        </motion.div>

        {/* ── Mobile money disclosure ──────────────────────────────────── */}
        <div className="mt-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
          <span className="flex-1 h-px bg-gray-200" />
          <span>Or pay another way</span>
          <span className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          onClick={() => setShowMomo((s) => !s)}
          className="mt-4 w-full flex items-center justify-between bg-white rounded-2xl border border-gray-200 hover:border-gray-300 px-5 py-4 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center -space-x-1">
              {/* Mini provider chips */}
              <span className="w-8 h-8 rounded-md bg-[#FFCB05] flex items-center justify-center text-[10px] font-black text-navy ring-2 ring-white">MTN</span>
              <span className="w-8 h-8 rounded-md bg-[#E40000] flex items-center justify-center text-[9px] font-black text-white ring-2 ring-white">airtel</span>
            </div>
            <div>
              <p className="font-bold text-navy text-sm">Mobile Money (Zambia)</p>
              <p className="text-xs text-gray-500">MTN · Airtel · charged in Kwacha</p>
            </div>
          </div>
          <ChevronDown
            size={18}
            className={`text-gray-400 transition-transform ${showMomo ? 'rotate-180' : ''}`}
          />
        </button>

        <AnimatePresence>
          {showMomo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
                <MomoPayPanel plan={plan} onSuccess={() => setPaid(true)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer note */}
        <p className="mt-8 text-center text-xs text-gray-400">
          Paying as <span className="font-medium text-gray-600">{email}</span> · Need help?{' '}
          <Link href="/contact-us" className="text-primary hover:underline">Contact us</Link>
        </p>
      </div>

      <div className="h-20" />
    </div>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    }>
      <PaymentInner />
    </Suspense>
  )
}
