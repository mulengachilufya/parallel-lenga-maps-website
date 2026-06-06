'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShieldCheck, Loader2, ArrowLeft, Smartphone, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS, PLAN_ORDER, type TierSlug } from '@/lib/pricing'
import LipilaPayButton from '@/components/LipilaPayButton'
import ManualPaymentFlow from '@/components/ManualPaymentFlow'
import { MtnBadge, AirtelBadge, VisaBadge, MastercardBadge } from '@/components/PaymentProviderIcons'

type PaymentMode = 'choose' | 'lipila' | 'manual'

function PaymentPageInner() {
  const router = useRouter()
  const params = useSearchParams()

  const planParam = params.get('plan') as TierSlug | null

  const [loading,   setLoading]   = useState(true)
  const [plan,      setPlan]      = useState<TierSlug>('starter')
  const [userEmail, setUserEmail] = useState('')
  const [userName,  setUserName]  = useState('')
  const [mode,      setMode]      = useState<PaymentMode>('choose')
  const [paid,      setPaid]      = useState(false)

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

      const resolvedPlan = (planParam && PLAN_ORDER.includes(planParam))
        ? planParam
        : ((profile?.plan as TierSlug) || 'starter')

      setPlan(resolvedPlan)
      setUserEmail(session.user.email || '')
      setUserName(profile?.full_name || session.user.user_metadata?.full_name || '')
      setLoading(false)
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
          className="bg-white rounded-2xl p-10 shadow-lg max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-navy mb-2">Payment confirmed!</h2>
          <p className="text-gray-500 mb-6">
            Your <strong>{planData.name}</strong> plan is now active.
            You can download datasets straight away.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-xl hover:bg-navy transition-all"
          >
            Go to dashboard
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-20" />

      {/* Trust strip */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
            <ShieldCheck size={14} /> Secure payment — powered by Lipila
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        {/* Plan switcher */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Paying for</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {PLAN_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => setPlan(s)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  s === plan
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {PLANS[s].name} — {PLANS[s].priceLabel}/mo
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-navy">{planData.name} Plan</h2>
              <p className="text-sm text-gray-500 mt-0.5">30-day access · all 54 African countries</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-primary">{priceLabel}</span>
              <span className="text-sm text-gray-400"> USD/month</span>
            </div>
          </div>
        </div>

        {/* ── Method chooser ─────────────────────────────────────────────── */}
        {mode === 'choose' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <p className="text-sm font-semibold text-gray-700 mb-1">Choose how to pay</p>

            {/* Lipila — primary (MoMo + Card) */}
            <button
              onClick={() => setMode('lipila')}
              className="w-full flex items-start gap-4 bg-white border-2 border-primary rounded-2xl p-5 hover:bg-primary/5 transition-all group text-left"
            >
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                <MtnBadge size={34} />
                <AirtelBadge size={34} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-bold text-navy">Pay instantly online</span>
                  <span className="text-[10px] font-bold bg-accent text-navy px-2 py-0.5 rounded-full uppercase tracking-wider">Recommended</span>
                </div>
                <p className="text-sm text-gray-500">
                  MTN · Airtel Money · Visa · Mastercard
                </p>
                <p className="text-xs text-green-600 font-medium mt-1">
                  ✓ Instantly activated once payment clears
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-1 shrink-0 mt-0.5">
                <VisaBadge size={34} />
                <MastercardBadge size={34} />
              </div>
            </button>

            {/* Manual — fallback */}
            <button
              onClick={() => setMode('manual')}
              className="w-full flex items-start gap-4 bg-white border-2 border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-all text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                <Smartphone size={20} className="text-gray-500" />
              </div>
              <div>
                <span className="font-bold text-navy block mb-0.5">Pay manually via MoMo</span>
                <p className="text-sm text-gray-500">
                  Send to our number then upload your screenshot.
                  Manually verified within a few hours.
                </p>
              </div>
            </button>
          </motion.div>
        )}

        {/* ── Lipila MoMo flow ──────────────────────────────────────────── */}
        {mode === 'lipila' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
          >
            <div className="mb-5">
              <h3 className="text-lg font-bold text-navy mb-1">Pay with Mobile Money</h3>
              <p className="text-sm text-gray-500">
                Enter your MTN or Airtel number below. You&apos;ll receive a payment
                prompt on your phone to approve — no app needed.
              </p>
            </div>

            <LipilaPayButton
              plan={plan}
              accountType="individual"
              amountLabel={`${priceLabel} USD`}
              email={userEmail}
              name={userName}
              onSuccess={() => setPaid(true)}
              onClose={() => setMode('choose')}
              className="bg-primary text-white hover:bg-navy"
            />

            <button
              onClick={() => setMode('choose')}
              className="w-full mt-3 text-sm text-gray-500 hover:text-primary py-2"
            >
              ← Choose a different method
            </button>
          </motion.div>
        )}

        {/* ── Manual flow ───────────────────────────────────────────────── */}
        {mode === 'manual' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <button
              onClick={() => setMode('choose')}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4"
            >
              <ArrowLeft size={14} /> Choose a different method
            </button>
            <ManualPaymentFlow
              plan={plan}
              userEmail={userEmail}
              userName={userName}
              onSuccess={() => setPaid(true)}
            />
          </motion.div>
        )}
      </div>
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
      <PaymentPageInner />
    </Suspense>
  )
}
