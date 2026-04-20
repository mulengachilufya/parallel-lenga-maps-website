'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldCheck, Loader2 } from 'lucide-react'
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
      {/* Header strip */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <svg viewBox="0 0 40 40" className="w-8 h-8">
              <circle cx="20" cy="20" r="18" fill="#1E5F8E" />
              <ellipse cx="20" cy="20" rx="8" ry="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
              <line x1="2" y1="20" x2="38" y2="20" stroke="#F5B800" strokeWidth="1.5" />
              <circle cx="20" cy="20" r="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
            </svg>
            <span className="font-bold text-navy">Lenga <span className="text-accent">Maps</span></span>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
            <ShieldCheck size={14} /> Secure payment
          </span>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
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
