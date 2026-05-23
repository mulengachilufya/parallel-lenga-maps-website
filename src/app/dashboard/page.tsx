'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShieldCheck, Loader2, ArrowLeft, Smartphone, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS, PLAN_ORDER, type TierSlug } from '@/lib/pricing'
import ManualPaymentFlow from '@/components/ManualPaymentFlow'

function PaymentPageInner() {
  const router = useRouter()
  const params = useSearchParams()

  const planParam = params.get('plan') as TierSlug | null

  const [loading,   setLoading]   = useState(true)
  const [plan,      setPlan]      = useState<TierSlug>('starter')
  const [userEmail, setUserEmail] = useState('')
  const [userName,  setUserName]  = useState('')
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
          <h2 className="text-2xl font-black text-navy mb-2">Payment submitted!</h2>
          <p className="text-gray-500 mb-6">
            Your <strong>{planData.name}</strong> plan will be activated once we verify your payment —
            usually within a few hours.
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
            <ShieldCheck size={14} /> Secure manual payment
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">

        {/* Plan switcher */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Paying for</p>
          <div className="flex flex-wrap gap-2">
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
          <div className="mt-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-navy">{planData.name} Plan</h2>
              <p className="text-sm text-gray-500 mt-0.5">30-day access · all 54 African countries</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-primary">{priceLabel}</span>
              <span className="text-sm text-gray-400">/month</span>
            </div>
          </div>
          {/* Currency disclaimer */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>All prices are in USD.</strong> Please convert to your local currency at
              today's rate when making the transfer. Include your email address as the payment
              reference so we can match your transfer to your account.
            </p>
          </div>
        </div>

        {/* Manual payment flow */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Smartphone size={18} className="text-gray-500" />
            <h3 className="font-bold text-navy">Pay via Mobile Money or Bank Transfer</h3>
          </div>
          <ManualPaymentFlow
            plan={plan}
            userEmail={userEmail}
            userName={userName}
            onSuccess={() => setPaid(true)}
          />
        </div>

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