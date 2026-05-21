'use client'

/**
 * LencoPayButton
 *
 * Loads the Lenco inline payment widget and opens it when the user clicks
 * the button. Handles the full flow:
 *   1. Button click → create payment record (POST /api/payments/create)
 *   2. Load Lenco inline script (once, on first click)
 *   3. Open widget via LencoPay.getPaid()
 *   4. On success callback: poll /api/payments/verify/{reference}
 *   5. On confirmed: call onSuccess() to let the parent redirect
 *
 * The LENCO_SECRET_KEY never leaves the server. Only the public key
 * (NEXT_PUBLIC_LENCO_PUBLIC_KEY) is sent to the browser, which is how
 * Lenco's widget model is designed.
 */

import { useState, useEffect, useRef } from 'react'
import { Loader2, CreditCard } from 'lucide-react'

interface LencoPayButtonProps {
  plan:        string
  accountType: string
  /** Amount in the given currency (ZMW for Zambia, USD for business) */
  amount:      number
  currency?:   string       // 'ZMW' (default) or 'USD'
  email:       string
  name?:       string
  onSuccess:   () => void
  onClose?:    () => void
  className?:  string
  children?:   React.ReactNode
}

// The global LencoPay object injected by the inline script
declare global {
  interface Window {
    LencoPay?: {
      getPaid: (opts: Record<string, unknown>) => void
    }
  }
}

const LENCO_SCRIPT_SANDBOX = 'https://pay.sandbox.lenco.co/js/v1/inline.js'
const LENCO_SCRIPT_LIVE    = 'https://pay.lenco.co/js/v1/inline.js'
const MAX_POLL_ATTEMPTS    = 20
const POLL_INTERVAL_MS     = 3000

export default function LencoPayButton({
  plan,
  accountType,
  amount,
  currency = 'ZMW',
  email,
  name,
  onSuccess,
  onClose,
  className = '',
  children,
}: LencoPayButtonProps) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'open' | 'polling' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const scriptLoadedRef = useRef(false)

  // Cleanup polling on unmount
  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current)
  }, [])

  // Load the Lenco inline script (only once per page)
  const loadScript = (): Promise<void> => new Promise((resolve, reject) => {
    if (scriptLoadedRef.current || window.LencoPay) {
      scriptLoadedRef.current = true
      resolve()
      return
    }
    const isSandbox = process.env.NEXT_PUBLIC_LENCO_SANDBOX !== 'false'
    const src = isSandbox ? LENCO_SCRIPT_SANDBOX : LENCO_SCRIPT_LIVE
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      existing.addEventListener('load', () => { scriptLoadedRef.current = true; resolve() })
      return
    }
    const script = document.createElement('script')
    script.src  = src
    script.async = true
    script.onload = () => { scriptLoadedRef.current = true; resolve() }
    script.onerror = () => reject(new Error('Failed to load Lenco payment script'))
    document.body.appendChild(script)
  })

  // Poll until Lenco confirms the payment
  const pollVerify = (reference: string, attempts = 0) => {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      setPhase('error')
      setErrorMsg('Payment verification timed out. If you paid, it will activate within minutes — check your dashboard.')
      return
    }
    pollRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/payments/verify/${reference}`)
        const data = await res.json()
        if (data.status === 'successful') {
          setPhase('idle')
          onSuccess()
        } else if (data.status === 'failed') {
          setPhase('error')
          setErrorMsg('Payment failed. Please try again.')
        } else {
          // pending / pay-offline — keep polling
          pollVerify(reference, attempts + 1)
        }
      } catch {
        pollVerify(reference, attempts + 1)
      }
    }, POLL_INTERVAL_MS)
  }

  const handleClick = async () => {
    setPhase('loading')
    setErrorMsg('')

    // 1. Create a payment record to get a unique reference
    let reference: string
    try {
      const res = await fetch('/api/payments/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan, account_type: accountType, amount_zmw: currency === 'ZMW' ? amount : null }),
      })
      if (!res.ok) throw new Error('Could not create payment record')
      const data = await res.json()
      reference = data.reference
    } catch (err) {
      console.error('[LencoPayButton] create failed:', err)
      setPhase('error')
      setErrorMsg('Could not start payment. Please try again.')
      return
    }

    // 2. Load the inline script
    try {
      await loadScript()
    } catch {
      setPhase('error')
      setErrorMsg('Could not load the payment widget. Check your connection and try again.')
      return
    }

    if (!window.LencoPay) {
      setPhase('error')
      setErrorMsg('Payment widget failed to initialise. Please refresh and try again.')
      return
    }

    // 3. Open the Lenco widget
    setPhase('open')
    const publicKey = process.env.NEXT_PUBLIC_LENCO_PUBLIC_KEY ?? ''

    window.LencoPay.getPaid({
      key:      publicKey,
      reference,
      email,
      amount,
      currency,
      label:    `Lenga Maps — ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
      channels: ['mobile-money', 'card'],
      customer: { firstName: name?.split(' ')[0], lastName: name?.split(' ').slice(1).join(' ') || undefined },

      onSuccess: () => {
        // Widget confirmed — start polling to activate the plan
        setPhase('polling')
        pollVerify(reference)
      },

      onClose: () => {
        // User closed the widget before paying
        setPhase('idle')
        onClose?.()
      },

      onConfirmationPending: () => {
        // User closed after initiating but before Lenco confirmed — keep polling
        setPhase('polling')
        pollVerify(reference)
      },
    })
  }

  // ── Polling overlay ───────────────────────────────────────────────────────
  if (phase === 'polling') {
    return (
      <div className={`flex flex-col items-center gap-3 py-4 ${className}`}>
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-sm text-gray-600 text-center">
          Verifying your payment — this usually takes under 30 seconds…
        </p>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-red-600 text-center">{errorMsg}</p>
        <button
          onClick={() => { setPhase('idle'); setErrorMsg('') }}
          className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all ${className}`}
        >
          Try again
        </button>
      </div>
    )
  }

  // ── Normal / Loading button ───────────────────────────────────────────────
  return (
    <button
      onClick={handleClick}
      disabled={phase === 'loading' || phase === 'open'}
      className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all disabled:opacity-60 ${className}`}
    >
      {phase === 'loading' || phase === 'open' ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          {phase === 'loading' ? 'Starting…' : 'Complete payment in the pop-up…'}
        </>
      ) : (
        children ?? (
          <>
            <CreditCard size={18} />
            Pay with Lenco
          </>
        )
      )}
    </button>
  )
}
