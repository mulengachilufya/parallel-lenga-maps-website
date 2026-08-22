'use client'

/**
 * /dashboard/payment
 *
 * Self-serve pay-now flow for the Individual plan - the fast path for
 * someone who needs the data urgently and doesn't want to wait on a reply
 * first. BankTransferPanel auto-emails bank details immediately, takes
 * proof of payment, and drops the submission into the admin queue
 * (/admin/payments) as 'pending'. Approving it there grants access
 * immediately, no expiry - see /api/admin/payments/verify.
 *
 * This is a PARALLEL path, not a replacement for /contact-us. Some buyers
 * would rather talk first; this page is for the ones who'd rather just
 * pay and go.
 *
 * Team is never self-serve - seats need negotiating - so ?plan=team lands
 * here only by a stale link and gets redirected to /projects.
 */

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, ArrowLeft, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS, type TierSlug } from '@/lib/pricing'
import BankTransferPanel from '@/components/BankTransferPanel'
import { track } from '@/lib/analytics'

function PaymentInner() {
  const router = useRouter()
  const params = useSearchParams()
  const planParam = params.get('plan') as TierSlug | null

  const [loading, setLoading] = useState(true)
  const [email,   setEmail]   = useState('')
  const [name,    setName]    = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const next = encodeURIComponent(`/dashboard/payment${window.location.search}`)
        router.replace(`/login?next=${next}`)
        return
      }

      // Team isn't self-serve - bounce to the quote flow instead of
      // rendering a bank-transfer form for something that needs seats
      // negotiated first.
      if (planParam === 'team') {
        router.replace('/projects')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single()

      setEmail(session.user.email || '')
      setName(profile?.full_name || session.user.user_metadata?.full_name || '')
      setLoading(false)
      track('payment_page_visited', { plan: 'individual' })
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

  const plan = PLANS.individual

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="h-20" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors">
          <ArrowLeft size={14} /> Back
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <ShieldCheck size={13} /> Reviewed by a human, usually within a few hours
        </span>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-3xl p-7 sm:p-10 shadow-sm border border-gray-100">
          <BankTransferPanel
            plan={plan.slug}
            amountLabel={`${plan.priceLabel} USD`}
            userEmail={email}
            userName={name}
          />
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          Paying as <span className="font-medium text-gray-600">{email}</span> · Prefer to talk first?{' '}
          <Link href="/contact-us" className="text-primary hover:underline">Contact us</Link>
          {' '}· Buying for a team?{' '}
          <Link href="/projects" className="text-primary hover:underline">See team plans</Link>
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