'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

declare global {
  interface Window {
    LencoPay?: {
      getPaid: (options: LencoPayOptions) => void
    }
  }
}

interface LencoPayOptions {
  publicKey: string
  reference: string
  amount: number
  currency: string
  email: string
  firstName?: string
  channels: string[]
  onSuccess: (ref: string) => void
  onClose: () => void
  onConfirmationPending: (ref: string) => void
}

interface Props {
  userId: string
  email: string
  firstName?: string
  plan: string
  accountType: string
  amountZmw: number
  onSuccess: (plan: string) => void
  onError: (msg: string) => void
}

export default function LencoPayWidget({
  userId,
  email,
  firstName,
  plan,
  accountType,
  amountZmw,
  onSuccess,
  onError,
}: Props) {
  const [loading, setLoading]   = useState(false)
  const [ready, setReady]       = useState(false)
  const [reference, setRef]     = useState<string | null>(null)

  // Load the Lenco inline script
  useEffect(() => {
    const isSandbox = process.env.NEXT_PUBLIC_LENCO_SANDBOX !== 'false'
    const src = isSandbox
      ? 'https://pay.sandbox.lenco.co/js/v1/inline.js'
      : 'https://pay.lenco.co/js/v1/inline.js'

    if (document.querySelector(`script[src="${src}"]`)) {
      setReady(true)
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.onload = () => setReady(true)
    script.onerror = () => onError('Failed to load payment widget. Please refresh and try again.')
    document.body.appendChild(script)
  }, [onError])

  // Create the pending payment record and open the widget
  async function openWidget() {
    if (!ready || !window.LencoPay) {
      onError('Payment widget not ready. Please refresh.')
      return
    }
    setLoading(true)

    try {
      // Create pending payment record (gets a server-generated reference)
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, account_type: accountType, amount_zmw: amountZmw }),
      })

      if (!res.ok) throw new Error('Could not initiate payment. Please try again.')
      const { reference: ref } = await res.json()
      setRef(ref)

      window.LencoPay.getPaid({
        publicKey: process.env.NEXT_PUBLIC_LENCO_PUBLIC_KEY!,
        reference: ref,
        amount: amountZmw,
        currency: 'ZMW',
        email,
        firstName,
        channels: ['mobile-money'], // MTN + Airtel only — no card
        onSuccess: async (successRef) => {
          await verify(successRef)
        },
        onClose: () => {
          setLoading(false)
        },
        onConfirmationPending: async (pendingRef) => {
          // Widget closed before Lenco confirmed — poll verify once
          await verify(pendingRef)
        },
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Payment failed.')
      setLoading(false)
    }
  }

  async function verify(ref: string) {
    try {
      const res = await fetch(`/api/payments/verify/${ref}`)
      const data = await res.json()
      if (data.status === 'successful') {
        onSuccess(data.plan)
      } else {
        // Payment pending — webhook will handle it when it arrives
        onSuccess(plan) // optimistic: proceed and let webhook confirm later
      }
    } catch {
      onSuccess(plan) // don't block the user; webhook is backup
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={openWidget}
      disabled={loading || !ready}
      className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3.5 rounded-xl transition-all shadow-md disabled:opacity-60"
    >
      {loading ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          Opening payment…
        </>
      ) : (
        <>
          Pay K{amountZmw} via MTN / Airtel
        </>
      )}
    </button>
  )
}
