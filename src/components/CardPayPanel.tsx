'use client'

/**
 * CardPayPanel — primary payment method.
 *
 * Card flow on Lipila:
 *   1. POST /api/payments/create → reference
 *   2. POST /api/payments/initiate-card → cardRedirectionUrl
 *   3. window.location.href = cardRedirectionUrl
 *      (Lipila hosts the card form via 3GDirectPay; settlement is in ZMW,
 *       customer's bank converts from the card's own currency.)
 *   4. Lipila redirects back to /dashboard/payment/complete
 *
 * Lipila's card endpoint requires a phone number per the docs — used as
 * `accountNumber` and `customerInfo.phoneNumber` on the gateway. We collect
 * it here so the request body is complete before we even create the
 * pending record.
 */

import { useState, useEffect } from 'react'
import { Loader2, Lock, AlertCircle, ChevronRight, RefreshCw, Phone } from 'lucide-react'
import { VisaBadge, MastercardBadge } from '@/components/PaymentProviderIcons'

interface Props {
  plan:        string
  amountLabel: string         // e.g. "$12"
  name?:       string
  className?:  string
}

export default function CardPayPanel({ plan, amountLabel, name = '', className = '' }: Props) {
  const [phase,    setPhase]    = useState<'idle' | 'loading'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [phone,    setPhone]    = useState('')

  // We redirect to the hosted checkout via window.location. If the user hits
  // Back, the browser can restore this page from its back-forward cache (bfcache)
  // frozen mid-redirect with phase='loading', leaving the button stuck on
  // "Connecting to secure checkout...". Reset to idle on bfcache restore so the
  // button is clickable again.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) { setPhase('idle'); setErrorMsg('') }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  function isPhoneValid(value: string): boolean {
    const digits = value.replace(/[\s\-().+]/g, '')
    // Accept 0xxxxxxxxx (10), 26xxxxxxxxx (11), or 9-digit (7/9 leading)
    return /^(0\d{9}|26\d{9}|[79]\d{8})$/.test(digits)
  }

  async function pay() {
    if (!isPhoneValid(phone)) {
      setErrorMsg('Enter a valid Zambian phone number, e.g. 0961234567.')
      return
    }
    setPhase('loading'); setErrorMsg('')

    // 1. Create pending record
    let reference: string
    try {
      const r = await fetch('/api/payments/create', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ plan, account_type: 'individual' }),
      })
      if (!r.ok) throw new Error()
      reference = (await r.json()).reference as string
    } catch {
      setPhase('idle')
      setErrorMsg('Could not start payment. Please try again.')
      return
    }

    // 2. Get card redirect URL
    try {
      const r = await fetch('/api/payments/initiate-card', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ reference, name, phone }),
      })
      const d = await r.json() as { cardRedirectionUrl?: string; error?: string }
      if (!r.ok || d.error || !d.cardRedirectionUrl) {
        setPhase('idle')
        setErrorMsg(d.error ?? 'Could not start card payment.')
        return
      }
      window.location.href = d.cardRedirectionUrl
    } catch {
      setPhase('idle')
      setErrorMsg('Network error. Please try again.')
    }
  }

  return (
    <div className={className}>
      {/* Brand row — large, authentic, the trust anchor */}
      <div className="flex items-center justify-center gap-4 mb-7">
        <VisaBadge size={68} />
        <MastercardBadge size={68} />
      </div>

      {/* Headline */}
      <h2 className="text-2xl sm:text-3xl font-black text-navy text-center tracking-tight mb-1.5">
        Pay with your card
      </h2>
      <p className="text-center text-sm text-gray-500 mb-7 max-w-sm mx-auto">
        Visa or Mastercard. Charged in ZMW — your bank handles the conversion
        if your card is in another currency.
      </p>

      {/* Phone number — required by the Lipila card endpoint */}
      <div className="mb-4">
        <label className="block text-sm font-semibold text-navy mb-2">
          Phone number
        </label>
        <div className="relative">
          <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0961234567 or +260961234567"
            className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 bg-gray-50 transition text-sm"
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          Used by the payment processor for receipt and verification — your card never sees it.
        </p>
      </div>

      {/* The primary action */}
      <button
        onClick={pay}
        disabled={phase === 'loading'}
        className="group w-full flex items-center justify-center gap-3 bg-navy text-white font-bold py-4 sm:py-5 rounded-2xl text-base sm:text-lg shadow-[0_8px_24px_-12px_rgba(11,21,48,0.55)] hover:shadow-[0_12px_28px_-12px_rgba(11,21,48,0.7)] hover:translate-y-[-1px] transition-all disabled:opacity-60 disabled:translate-y-0 disabled:shadow-none"
      >
        {phase === 'loading' ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Connecting to secure checkout…
          </>
        ) : (
          <>
            Pay {amountLabel}
            <ChevronRight size={20} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>

      {errorMsg && (
        <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      {/* Trust strip */}
      <div className="mt-5 flex items-center justify-center gap-x-5 gap-y-2 flex-wrap text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <Lock size={12} className="text-gray-400" />
          Encrypted by Lipila
        </span>
        <span className="inline-flex items-center gap-1.5">
          <RefreshCw size={12} className="text-gray-400" />
          Cancel anytime
        </span>
      </div>
    </div>
  )
}
