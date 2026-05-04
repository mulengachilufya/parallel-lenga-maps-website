'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldCheck, Loader2, ArrowLeft } from 'lucide-react'
import { supabase, type AccountType, type PlanTier, PLAN_PRICING } from '@/lib/supabase'
import ManualPaymentFlow from '@/components/ManualPaymentFlow'

function PaymentPageInner() {
  const router = useRouter()
  const params = useSearchParams()

  const planParam = params.get('plan') as PlanTier | null
  const typeParam = params.get('type') as AccountType | null

  const [loading, setLoading] = useState(true)
  const [plan, setPlan]             = useState<PlanTier>('basic')
  const [accountType, setAccountType] = useState<AccountType>('student')
  const [userEmail, setUserEmail]   = useState('')
  const [userName, setUserName]     = useState('')

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
        .select('plan, account_type, full_name')
        .eq('id', session.user.id)
        .single()

      // Plan / accountType: URL params win, then profile, then defaults
      const resolvedPlan = (planParam && ['basic','pro','max'].includes(planParam))
        ? planParam
        : ((profile?.plan as PlanTier) || 'basic')
      const resolvedType = (typeParam && ['student','professional','business'].includes(typeParam))
        ? typeParam
        : ((profile?.account_type as AccountType) || 'student')

      // Validate pricing exists for this combination
      if (!PLAN_PRICING[resolvedType]?.[resolvedPlan]) {
        router.replace('/pricing')
        return
      }

      setPlan(resolvedPlan)
      setAccountType(resolvedType)
      setUserEmail(session.user.email || '')
      setUserName(profile?.full_name || session.user.user_metadata?.full_name || '')
      setLoading(false)
    }
    load()
  }, [planParam, typeParam, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Spacer to clear the fixed Navbar (h-20 = 80px). Logo + email +
          Sign Out are handled by the global Navbar; the old per-page
          header strip would have stacked on top of it. */}
      <div className="h-20" />

      {/* Secure-payment trust strip — slim, no logo. */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-end">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
            <ShieldCheck size={14} /> Secure payment
          </span>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
        <ManualPaymentFlow
          plan={plan}
          accountType={accountType}
          userEmail={userEmail}
          userName={userName}
        />
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
