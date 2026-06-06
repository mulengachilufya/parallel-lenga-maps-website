'use client'

/**
 * MomoPayPanel — secondary payment method for Zambian customers.
 *
 * STK push flow:
 *   1. POST /api/payments/create → reference
 *   2. POST /api/payments/initiate (server converts USD→ZMW) → push sent
 *   3. Customer approves on their phone (sees Kwacha in their MNO prompt
 *      — the site itself stays USD)
 *   4. Poll /api/payments/verify until terminal status
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, Smartphone, AlertCircle, ChevronRight } from 'lucide-react'
import { MtnBadge, AirtelBadge } from '@/components/PaymentProviderIcons'

interface Props {
  plan:       string
  className?: string
  onSuccess:  () => void
}

type Phase = 'idle' | 'loading' | 'polling' | 'error'

const MAX_POLL_ATTEMPTS = 40
const POLL_INTERVAL_MS  = 3000

/** Zambian mobile validation — 7xx / 9xx + 9/10/12 digit variants. */
function isValidPhone(v: string): boolean {
  const d = v.replace(/[\s\-().+]/g, '')
  return /^(260[79]\d{8}|0[79]\d{8}|[79]\d{8})$/.test(d)
}

export default function MomoPayPanel({ plan, className = '', onSuccess }: Props) {
  const [phase,    setPhase]    = useState<Phase>('idle')
  const [phone,    setPhone]    = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  function poll(reference: string, attempt = 0) {
    if (attempt >= MAX_POLL_ATTEMPTS) {
      setPhase('error')
      setErrorMsg('Verification timed out. If you approved, it will activate within minutes — check your dashboard.')
      return
    }
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/payments/verify/${reference}`)
        const d = await r.json() as { status: string }
        if (d.status === 'successful')      onSuccess()
        else if (d.status === 'failed') { setPhase('error'); setErrorMsg('Payment was not completed.') }
        else                                 poll(reference, attempt + 1)
      } catch { poll(reference, attempt + 1) }
    }, POLL_INTERVAL_MS)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidPhone(phone)) {
      setErrorMsg('Enter a valid Zambian mobile number (MTN or Airtel).')
      inputRef.current?.focus()
      return
    }
    setPhase('loading'); setErrorMsg('')

    let reference: string
    try {
      const r = await fetch('/api/payments/create', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ plan, account_type:'individual' }),
      })
      if (!r.ok) throw new Error()
      reference = (await r.json()).reference as string
    } catch { setPhase('error'); setErrorMsg('Could not start payment.'); return }

    try {
      const r = await fetch('/api/payments/initiate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ reference, phone }),
      })
      const d = await r.json() as { error?: string }
      if (!r.ok || d.error) { setPhase('error'); setErrorMsg(d.error ?? 'Check your number and try again.'); return }
    } catch { setPhase('error'); setErrorMsg('Network error. Try again.'); return }

    setPhase('polling')
    poll(reference)
  }

  if (phase === 'polling') {
    return (
      <div className={`flex flex-col items-center gap-4 py-8 text-center ${className}`}>
        <div className="relative w-16 h-16">
          <Loader2 size={64} className="animate-spin text-primary opacity-20 absolute inset-0" />
          <Smartphone size={28} className="text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div>
          <p className="font-bold text-navy text-lg">Check your phone</p>
          <p className="text-sm text-gray-500 mt-1 max-w-xs">
            We sent a payment prompt to <strong>{phone}</strong>. Approve it to continue.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className={className}>
      <div className="flex items-center gap-2 mb-4">
        <MtnBadge size={44} />
        <AirtelBadge size={44} />
        <span className="ml-1 text-xs text-gray-500">
          Charged in Kwacha at today&apos;s rate
        </span>
      </div>

      <label htmlFor="momo-phone" className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
        Mobile money number
      </label>
      <div className="flex items-center gap-2 bg-white border border-gray-200 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/10 rounded-xl px-4 py-3 transition-all">
        <span className="text-sm font-medium text-gray-500 shrink-0">+260</span>
        <input
          id="momo-phone"
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          placeholder="97 123 4567"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setErrorMsg('') }}
          disabled={phase === 'loading'}
          className="flex-1 text-base bg-transparent outline-none text-gray-900 placeholder-gray-400 disabled:opacity-50"
          autoComplete="tel"
        />
      </div>
      {errorMsg && (
        <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12} /> {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={phase === 'loading' || !phone.trim()}
        className="mt-3 w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-navy hover:bg-gray-50 text-navy font-bold py-3.5 rounded-xl transition-all disabled:opacity-60"
      >
        {phase === 'loading' ? (
          <><Loader2 size={16} className="animate-spin" /> Sending request…</>
        ) : (
          <>Send payment prompt <ChevronRight size={16} /></>
        )}
      </button>
    </form>
  )
}
