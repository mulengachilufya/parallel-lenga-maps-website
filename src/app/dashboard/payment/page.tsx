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
import { Loader2, ArrowLeft, ShieldCheck, Zap, CreditCard, Smartphone, Landmark } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PASS, PASSES, PASS_ORDER, isPassProduct, type PassProduct, type TierSlug } from '@/lib/pricing'
import BankTransferPanel from '@/components/BankTransferPanel'
import LencoPayPanel from '@/components/LencoPayPanel'
import MobileMoneyManualPanel from '@/components/MobileMoneyManualPanel'
import { MOBILE_MONEY_NUMBERS } from '@/lib/mobile-money-numbers'
import { LENCO_MOBILE_MONEY_COUNTRIES, METHOD_LABEL, mobileMoneyAvailableIn, type PayMethod } from '@/lib/payment-methods'
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
  const [country, setCountry] = useState<string | null>(null)
  const [instantOn, setInstantOn] = useState(false)
  const [method, setMethod] = useState<PayMethod | null>(null)

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
        .select('full_name, country')
        .eq('id', session.user.id)
        .single()

      setCountry((profile as { country?: string | null } | null)?.country ?? null)
      // Is instant payment (Lenco) switched on? If not, the page only offers manual methods.
      try {
        const r = await fetch('/api/payments/lenco/init')
        const j = await r.json()
        setInstantOn(!!j.enabled)
      } catch { setInstantOn(false) }
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

  // Which methods can this person use?
  const available: PayMethod[] = [
    ...(instantOn ? (['card'] as PayMethod[]) : []),
    ...(instantOn && mobileMoneyAvailableIn(country) ? (['mobile-money'] as PayMethod[]) : []),
    'bank',
    ...(MOBILE_MONEY_NUMBERS.airtel ? (['airtel'] as PayMethod[]) : []),
    ...(MOBILE_MONEY_NUMBERS.mtn ? (['mtn'] as PayMethod[]) : []),
  ]
  const chosen: PayMethod = method && available.includes(method) ? method : available[0]
  const instantMethods = available.filter((m) => METHOD_LABEL[m].instant)
  const manualMethods  = available.filter((m) => !METHOD_LABEL[m].instant)
  const ICON: Record<PayMethod, typeof CreditCard> = { 'card': CreditCard, 'mobile-money': Smartphone, 'bank': Landmark, 'airtel': Smartphone, 'mtn': Smartphone }

  const methodButton = (m: PayMethod) => {
    const Icon = ICON[m]
    const on = chosen === m
    return (
      <button key={m} type="button" role="radio" aria-checked={on} onClick={() => setMethod(m)}
        className={`rounded-xl border px-3 py-3 text-left transition-colors ${on ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
        <span className="flex items-center gap-2 text-sm font-semibold text-navy"><Icon size={15} /> {METHOD_LABEL[m].title}</span>
        <span className="block text-[11px] text-gray-500 mt-0.5">
          {m === 'mobile-money' ? `Airtel or MTN (${LENCO_MOBILE_MONEY_COUNTRIES.join(', ')})` : METHOD_LABEL[m].sub}
        </span>
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="h-20" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors">
          <ArrowLeft size={14} /> Back
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <ShieldCheck size={13} /> {METHOD_LABEL[chosen].instant ? 'Instant, switched on when the payment is confirmed' : 'Reviewed by a human, usually within a few hours'}
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

          <p className="text-xs font-semibold text-gray-500 mb-2">How would you like to pay?</p>
          {instantMethods.length > 0 && (
            <>
              <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-green-700 mb-1.5"><Zap size={12} /> Pay instantly</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4" role="radiogroup" aria-label="Instant payment methods">{instantMethods.map(methodButton)}</div>
            </>
          )}
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Pay manually, we check it</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6" role="radiogroup" aria-label="Manual payment methods">{manualMethods.map(methodButton)}</div>

          {chosen === 'card' && <LencoPayPanel key={`${product}-card`} product={product} channel="card" amountLabel={`$${price} USD`} />}
          {chosen === 'mobile-money' && <LencoPayPanel key={`${product}-mm`} product={product} channel="mobile-money" amountLabel={`$${price} USD`} />}
          {chosen === 'bank' && (
            <BankTransferPanel key={`${product}-bank`} plan="individual" product={product}
              amountLabel={`$${price} USD`} userEmail={email} userName={name} />
          )}
          {(chosen === 'airtel' || chosen === 'mtn') && (
            <MobileMoneyManualPanel key={`${product}-${chosen}`} network={chosen} product={product} priceUsd={price} userEmail={email} />
          )}
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