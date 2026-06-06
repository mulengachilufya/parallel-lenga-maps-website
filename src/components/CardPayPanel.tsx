'use client'

/**
 * CardPayPanel — primary payment method.
 *
 * Card flow on Lipila:
 *   1. POST /api/payments/create → reference
 *   2. POST /api/payments/initiate-card → cardRedirectionUrl
 *   3. window.location.href = cardRedirectionUrl
 *      (Lipila hosts the card form; the customer's bank does FX,
 *       so they see USD on their statement — their own currency.)
 *   4. Lipila redirects back to /dashboard/payment/complete
 */

import { useState } from 'react'
import { Loader2, Lock, AlertCircle, ChevronRight, RefreshCw } from 'lucide-react'
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

  async function pay() {
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
        body: JSON.stringify({ reference, name }),
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
        Visa or Mastercard. Charged in USD — your bank handles the conversion.
      </p>

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
