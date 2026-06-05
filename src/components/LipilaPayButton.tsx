'use client'

/**
 * LipilaPayButton
 *
 * Handles the full Lipila Mobile Money payment flow:
 *   1. Collects the customer's phone number
 *   2. POST /api/payments/create → get a unique reference
 *   3. POST /api/payments/initiate (with phone) → Lipila STK push sent to phone
 *   4. Shows "Check your phone" holding screen while polling
 *   5. Polls /api/payments/verify/{reference} every 3 s
 *   6. On confirmed → calls onSuccess()
 *
 * Unlike Lenco there is no external widget script — everything is server-side.
 */

import { useState, useEffect, useRef } from 'react'
import { Loader2, Smartphone, AlertCircle } from 'lucide-react'

interface LipilaPayButtonProps {
  plan:        string
  accountType: string
  /** Display-only amount label e.g. "K50" or "$15" */
  amountLabel: string
  email:       string
  onSuccess:   () => void
  onClose?:    () => void
  className?:  string
}

type Phase =
  | 'idle'      // showing phone form
  | 'loading'   // creating record + calling Lipila
  | 'polling'   // STK push sent, waiting for customer
  | 'error'     // something went wrong

const MAX_POLL_ATTEMPTS = 40   // 40 × 3 s = 2 minutes
const POLL_INTERVAL_MS  = 3000

/**
 * Zambian phone validation.
 * UI shows +260 prefix, so users type the local part without a leading 0.
 * Accepts:  779187025 (9 digits, no leading 0 — most common)
 *           0779187025 (10 digits with leading 0)
 *           260779187025 (full international without +)
 */
function isValidPhone(v: string): boolean {
  const d = v.replace(/[\s\-().+]/g, '')
  return /^(260[67]\d{8}|0[67]\d{8}|[67]\d{8})$/.test(d)
}

export default function LipilaPayButton({
  plan,
  accountType,
  amountLabel,
  onSuccess,
  onClose,
  className = '',
}: LipilaPayButtonProps) {
  const [phase,    setPhase]    = useState<Phase>('idle')
  const [phone,    setPhone]    = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef  = useRef<NodeJS.Timeout | null>(null)
  const phoneRef = useRef<HTMLInputElement>(null)

  // Cleanup polling on unmount
  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current)
  }, [])

  // ── Polling ─────────────────────────────────────────────────────────────
  function startPolling(reference: string, attempt = 0) {
    if (attempt >= MAX_POLL_ATTEMPTS) {
      setPhase('error')
      setErrorMsg(
        'Verification timed out. If you approved the payment it will activate within a few minutes — check your dashboard.'
      )
      return
    }
    pollRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/payments/verify/${reference}`)
        const data = await res.json() as { status: string }
        if (data.status === 'successful') {
          onSuccess()
        } else if (data.status === 'failed') {
          setPhase('error')
          setErrorMsg('Payment was not completed. Please try again.')
        } else {
          startPolling(reference, attempt + 1)
        }
      } catch {
        startPolling(reference, attempt + 1)
      }
    }, POLL_INTERVAL_MS)
  }

  // ── Submit handler ───────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidPhone(phone)) {
      setErrorMsg('Please enter a valid Zambian mobile number (MTN or Airtel).')
      phoneRef.current?.focus()
      return
    }

    setPhase('loading')
    setErrorMsg('')

    // Step 1 — create a pending payment record
    let reference: string
    try {
      const res = await fetch('/api/payments/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan, account_type: accountType }),
      })
      if (!res.ok) throw new Error('create failed')
      reference = (await res.json()).reference as string
    } catch {
      setPhase('error')
      setErrorMsg('Could not start payment. Please try again.')
      return
    }

    // Step 2 — trigger STK push via Lipila
    try {
      const res = await fetch('/api/payments/initiate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reference, phone }),
      })
      const data = await res.json() as { status?: string; error?: string }
      if (!res.ok || data.error) {
        setPhase('error')
        setErrorMsg(data.error ?? 'Could not send payment request. Check your number and try again.')
        return
      }
    } catch {
      setPhase('error')
      setErrorMsg('Could not send payment request. Check your connection and try again.')
      return
    }

    // Step 3 — wait for customer approval
    setPhase('polling')
    startPolling(reference)
  }

  // ── Polling / waiting screen ─────────────────────────────────────────────
  if (phase === 'polling') {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="relative w-16 h-16">
          <Loader2 size={64} className="animate-spin text-primary opacity-20 absolute inset-0" />
          <Smartphone size={28} className="text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div>
          <p className="font-bold text-navy text-lg">Check your phone</p>
          <p className="text-sm text-gray-500 mt-1 max-w-xs">
            A payment prompt has been sent to <strong>{phone}</strong>.
            Approve it to activate your plan.
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Waiting for confirmation — this usually takes under 30 seconds…
        </p>
      </div>
    )
  }

  // ── Error screen ─────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
        <button
          onClick={() => { setPhase('idle'); setErrorMsg('') }}
          className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all ${className}`}
        >
          Try again
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="w-full text-sm text-gray-500 hover:text-primary py-1"
          >
            ← Choose a different method
          </button>
        )}
      </div>
    )
  }

  // ── Phone form (idle / loading) ──────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="lipila-phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
          Mobile money number
        </label>
        <div className="flex items-center gap-2 border-2 border-gray-200 focus-within:border-primary rounded-xl px-4 py-3 transition-colors bg-white">
          <span className="text-sm font-medium text-gray-500 shrink-0">+260</span>
          <input
            id="lipila-phone"
            ref={phoneRef}
            type="tel"
            inputMode="numeric"
            placeholder="97 123 4567"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setErrorMsg('') }}
            disabled={phase === 'loading'}
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400 disabled:opacity-50"
            autoComplete="tel"
          />
        </div>
        {errorMsg && (
          <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
            <AlertCircle size={12} />
            {errorMsg}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1.5">
          MTN or Airtel Money — you&apos;ll get a prompt to approve on your phone
        </p>
      </div>

      <button
        type="submit"
        disabled={phase === 'loading' || !phone.trim()}
        className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all disabled:opacity-60 ${className}`}
      >
        {phase === 'loading' ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Sending payment request…
          </>
        ) : (
          <>
            <Smartphone size={18} />
            Pay {amountLabel} with MoMo
          </>
        )}
      </button>
    </form>
  )
}
