'use client'

/**
 * /dashboard/payment
 *
 * Self-serve pay-now flow for the Individual PASS: pick 1, 6 or 12 months,
 * then pay. BankTransferPanel auto-emails bank details immediately, takes
 * proof of payment, and drops the submission into the admin queue
 * (/admin/payments) as 'pending'. Approving it there grants the pass -
 * see /api/admin/payments/verify. ?product=pass_6m (etc.) preselects a pass.
 *
 * An instant on-site payment option will sit next to the manual one here
 * later; both end by granting access the same way.
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
import { DEFAULT_PASS, PASSES, PASS_ORDER, isPassProduct, type PassProduct, type TierSlug } from '@/lib/pricing'
import BankTransferPanel from '@/components/BankTransferPanel'
import { track } from '@/lib/analytics'

function PaymentInner() {
  const router = useRouter()
  const params = useSearchParams()
  const planParam = params.get('plan') as TierSlug | null
  const productParam = params.get('product')
  const [product, setProduct] = useState<PassProduct>(isPassProduct(productParam) ? productParam : DEFAULT_PASS)

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

  const price = PASSES[product].price

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
          <p className="text-center text-sm font-semibold text-navy mb-4">
            Individual pass: every dataset, unlimited downloads
          </p>
          <div className="grid grid-cols-3 gap-2 mb-6" role="radiogroup" aria-label="Choose how long your pass lasts">
            {PASS_ORDER.map((id) => (
              <button
                key={id} type="button" role="radio" aria-checked={product === id}
                onClick={() => setProduct(id)}
                className={`rounded-xl border px-2 py-3 text-center transition-colors ${
                  product === id ? 'border-primary bg-primary/5 text-navy' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                <span className="block text-sm font-semibold">{PASSES[id].label}</span>
                <span className="block text-lg font-bold">${PASSES[id].price}</span>
                {PASSES[id].note && <span className="block text-[11px] text-green-600 font-semibold">{PASSES[id].note}</span>}
              </button>
            ))}
          </div>
          <BankTransferPanel
            key={product}
            plan="individual"
            product={product}
            amountLabel={`$${price} USD`}
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