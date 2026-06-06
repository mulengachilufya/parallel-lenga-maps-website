'use client'

/**
 * LipilaPayButton
 *
 * Two payment methods in one component:
 *
 * MoMo tab:
 *   1. Phone number form
 *   2. POST /api/payments/create → POST /api/payments/initiate (STK push)
 *   3. Poll /api/payments/verify until confirmed
 *
 * Card tab (Visa / Mastercard):
 *   1. POST /api/payments/create → POST /api/payments/initiate-card
 *   2. Redirect to Lipila's hosted card page (cardRedirectionUrl)
 *   3. Lipila redirects back to /dashboard/payment/complete after payment
 */

import { useState, useEffect, useRef } from 'react'
import { Loader2, Smartphone, CreditCard, AlertCircle } from 'lucide-react'
import { MtnBadge, AirtelBadge, VisaBadge, MastercardBadge } from '@/components/PaymentProviderIcons'

interface LipilaPayButtonProps {
  plan:        string
  accountType: string
  amountLabel: string
  email:       string
  name?:       string
  onSuccess:   () => void
  onClose?:    () => void
  className?:  string
}

type Tab   = 'momo' | 'card'
type Phase = 'idle' | 'loading' | 'polling' | 'error'

const MAX_POLL_ATTEMPTS = 40
const POLL_INTERVAL_MS  = 3000

/**
 * Zambian phone validation.
 * UI shows +260 prefix, so users type without a leading 0.
 * Zambian mobile numbers start 7 (Airtel 77 / MTN 76 / Zamtel 75) or
 * 9 (MTN 96 / Airtel 97 / Zamtel 95).
 * Accepts: 970000000 (9 digits) | 0970000000 (10 digits) | 260970000000 (12 digits)
 */
function isValidPhone(v: string): boolean {
  const d = v.replace(/[\s\-().+]/g, '')
  return /^(260[79]\d{8}|0[79]\d{8}|[79]\d{8})$/.test(d)
}

export default function LipilaPayButton({
  plan,
  accountType,
  amountLabel,
  email,
  name = '',
  onSuccess,
  onClose,
  className = '',
}: LipilaPayButtonProps) {
  const [tab,      setTab]      = useState<Tab>('momo')
  const [phase,    setPhase]    = useState<Phase>('idle')
  const [phone,    setPhone]    = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef  = useRef<NodeJS.Timeout | null>(null)
  const phoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current)
  }, [])

  // Reset state when switching tabs
  function switchTab(t: Tab) {
    setTab(t)
    setPhase('idle')
    setErrorMsg('')
  }

  // ── MoMo polling ────────────────────────────────────────────────────────
  function startPolling(reference: string, attempt = 0) {
    if (attempt >= MAX_POLL_ATTEMPTS) {
      setPhase('error')
      setErrorMsg('Verification timed out. If you approved, it will activate within a few minutes — check your dashboard.')
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

  // ── Create payment record (shared) ──────────────────────────────────────
  async function createRecord(): Promise<string | null> {
    try {
      const res = await fetch('/api/payments/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan, account_type: accountType }),
      })
      if (!res.ok) throw new Error('create failed')
      return (await res.json()).reference as string
    } catch {
      setPhase('error')
      setErrorMsg('Could not start payment. Please try again.')
      return null
    }
  }

  // ── MoMo submit ─────────────────────────────────────────────────────────
  async function handleMomoSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidPhone(phone)) {
      setErrorMsg('Please enter a valid Zambian mobile number (MTN or Airtel).')
      phoneRef.current?.focus()
      return
    }

    setPhase('loading')
    setErrorMsg('')

    const reference = await createRecord()
    if (!reference) return

    try {
      const res  = await fetch('/api/payments/initiate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reference, phone }),
      })
      const data = await res.json() as { error?: string }
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

    setPhase('polling')
    startPolling(reference)
  }

  // ── Card submit ──────────────────────────────────────────────────────────
  async function handleCardClick() {
    setPhase('loading')
    setErrorMsg('')

    const reference = await createRecord()
    if (!reference) return

    try {
      const res  = await fetch('/api/payments/initiate-card', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reference, name }),
      })
      const data = await res.json() as { cardRedirectionUrl?: string; error?: string }
      if (!res.ok || data.error) {
        setPhase('error')
        setErrorMsg(data.error ?? 'Could not start card payment. Please try again.')
        return
      }
      if (data.cardRedirectionUrl) {
        window.location.href = data.cardRedirectionUrl
        return
      }
      setPhase('error')
      setErrorMsg('No redirect URL returned. Please try again.')
    } catch {
      setPhase('error')
      setErrorMsg('Could not reach payment provider. Check your connection and try again.')
    }
  }

  // ── Polling screen (MoMo only) ───────────────────────────────────────────
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
        <p className="text-xs text-gray-400 mt-1">Waiting for confirmation — usually under 30 seconds…</p>
      </div>
    )
  }

  // ── Error screen ──────────────────────────────────────────────────────────
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
          <button onClick={onClose} className="w-full text-sm text-gray-500 hover:text-primary py-1">
            ← Choose a different method
          </button>
        )}
      </div>
    )
  }

  // ── Tab selector + forms ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Tab switcher */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => switchTab('momo')}
          className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-3 transition-all ${
            tab === 'momo'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-1">
            <MtnBadge size={30} />
            <AirtelBadge size={30} />
          </div>
          <span className={`text-xs font-bold ${tab === 'momo' ? 'text-primary' : 'text-gray-600'}`}>
            Mobile Money
          </span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('card')}
          className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-3 transition-all ${
            tab === 'card'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-1">
            <VisaBadge size={30} />
            <MastercardBadge size={30} />
          </div>
          <span className={`text-xs font-bold ${tab === 'card' ? 'text-primary' : 'text-gray-600'}`}>
            Debit / Credit Card
          </span>
        </button>
      </div>

      {/* MoMo form */}
      {tab === 'momo' && (
        <form onSubmit={handleMomoSubmit} className="flex flex-col gap-3">
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
                <AlertCircle size={12} /> {errorMsg}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1.5">
              MTN or Airtel Money — you&apos;ll get a prompt on your phone
            </p>
          </div>
          <button
            type="submit"
            disabled={phase === 'loading' || !phone.trim()}
            className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all disabled:opacity-60 ${className}`}
          >
            {phase === 'loading' ? (
              <><Loader2 size={18} className="animate-spin" /> Sending payment request…</>
            ) : (
              <><Smartphone size={18} /> Pay {amountLabel} with MoMo</>
            )}
          </button>
        </form>
      )}

      {/* Card form */}
      {tab === 'card' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <VisaBadge size={34} />
              <MastercardBadge size={34} />
            </div>
            <p className="text-sm text-blue-700">
              You&apos;ll be redirected to a secure card payment page.
              Visa and Mastercard accepted.
            </p>
          </div>
          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleCardClick}
            disabled={phase === 'loading'}
            className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all disabled:opacity-60 ${className}`}
          >
            {phase === 'loading' ? (
              <><Loader2 size={18} className="animate-spin" /> Preparing card payment…</>
            ) : (
              <><CreditCard size={18} /> Pay {amountLabel} with Card</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
