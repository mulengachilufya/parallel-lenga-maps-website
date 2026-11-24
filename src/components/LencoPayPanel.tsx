'use client'

/**
 * LencoPayPanel - instant payment by card or mobile money through Lenco.
 *
 * Flow (nothing here is trusted by the server, it re-checks with Lenco):
 *   1. POST /api/payments/lenco/init    -> server picks the price, makes a
 *                                          pending row, returns widget details
 *   2. Lenco's popup widget takes the payment (card form, or the phone prompt)
 *   3. POST /api/payments/lenco/verify  -> server asks Lenco "did it arrive?"
 *                                          and, only if yes, grants the pass
 *   4. If Lenco is still confirming, we ask again every few seconds.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, Smartphone, Loader2, CheckCircle2, AlertCircle, Lock } from 'lucide-react'
import { LICENCE_TERMS, type PassProduct } from '@/lib/pricing'
import type { LencoChannel } from '@/lib/lenco'

interface LencoWidgetOptions {
  key: string; reference: string; email: string; amount: number; currency: string
  channels: string[]; label?: string
  customer?: { firstName?: string; lastName?: string }
  onSuccess: (response: { reference: string }) => void
  onClose: () => void
  onConfirmationPending: () => void
}
declare global { interface Window { LencoPay?: { getPaid: (o: LencoWidgetOptions) => void } } }

type Phase = 'idle' | 'starting' | 'paying' | 'verifying' | 'success' | 'error'
interface VerifyResult { state: 'granted' | 'already' | 'pending' | 'failed' | 'unknown' | 'error'; message: string }

function loadWidget(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.LencoPay) return resolve()
    const existing = document.querySelector<HTMLScriptElement>('script[data-lenco-widget]')
    const el = existing ?? document.createElement('script')
    el.addEventListener('load', () => resolve())
    el.addEventListener('error', () => reject(new Error('Could not load the payment window.')))
    if (!existing) { el.src = src; el.async = true; el.dataset.lencoWidget = '1'; document.body.appendChild(el) }
  })
}

export default function LencoPayPanel({ product, channel, amountLabel }: {
  product: PassProduct; channel: LencoChannel; amountLabel: string
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted = useRef(false)
  useEffect(() => () => { unmounted.current = true; if (pollTimer.current) clearTimeout(pollTimer.current) }, [])

  const isCard = channel === 'card'

  /** Ask our server (which asks Lenco). Retries while the payment is pending. */
  const verify = useCallback(async function verify(reference: string, attempt = 0): Promise<void> {
    if (unmounted.current) return
    setPhase('verifying'); setMessage('Confirming your payment…')
    let result: VerifyResult | null = null
    try {
      const res = await fetch('/api/payments/lenco/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference }),
      })
      result = await res.json()
    } catch { /* network blip: treated like pending below */ }

    if (result?.state === 'granted' || result?.state === 'already') {
      setPhase('success'); setMessage(result.message); return
    }
    if (result?.state === 'failed') {
      setPhase('error'); setMessage(result.message); return
    }
    if (attempt < 10) {
      pollTimer.current = setTimeout(() => void verify(reference, attempt + 1), 4000)
      return
    }
    setPhase('error')
    setMessage('We have not had confirmation yet. If you paid, your pass will switch on automatically when it is confirmed. Check your dashboard in a few minutes, or contact us with your reference: ' + reference)
  }, [])

  async function start() {
    setPhase('starting'); setMessage('')
    try {
      const res = await fetch('/api/payments/lenco/init', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product, channel }),
      })
      const j = await res.json()
      if (!res.ok) { setPhase('error'); setMessage(j.error ?? 'Could not start the payment.'); return }

      await loadWidget(j.widgetUrl)
      if (!window.LencoPay) throw new Error('Could not load the payment window.')

      setPhase('paying')
      window.LencoPay.getPaid({
        key: j.publicKey,
        reference: j.reference,
        email: j.email,
        amount: j.amount,
        currency: j.currency,
        channels: [channel],
        label: 'Lenga Maps pass',
        customer: { firstName: j.firstName, lastName: j.lastName },
        onSuccess: () => void verify(j.reference),
        onClose: () => {
          // They may have paid and closed straight away: check once.
          void verify(j.reference, 9)
          setPhase((p) => (p === 'verifying' || p === 'success' ? p : 'idle'))
        },
        onConfirmationPending: () => void verify(j.reference),
      })
    } catch (err) {
      setPhase('error'); setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  if (phase === 'success') {
    return (
      <div className="text-center py-6">
        <CheckCircle2 size={44} className="mx-auto text-green-500" />
        <h3 className="mt-3 text-xl font-bold text-navy">You are in</h3>
        <p className="mt-2 text-sm text-gray-600">{message} Every dataset is unlocked.</p>
        <button type="button" onClick={() => { router.push('/dashboard'); router.refresh() }}
          className="mt-5 bg-[#F5B800] text-[#0D2B45] font-bold text-sm px-6 py-3 rounded-xl">
          Go to my datasets
        </button>
      </div>
    )
  }

  const busy = phase === 'starting' || phase === 'paying' || phase === 'verifying'
  return (
    <div>
      <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
        {isCard ? <CreditCard size={20} className="text-primary mt-0.5 shrink-0" /> : <Smartphone size={20} className="text-primary mt-0.5 shrink-0" />}
        <p className="text-sm text-gray-600 leading-relaxed">
          {isCard
            ? 'Pay with a Mastercard or Visa card in a secure popup. Your pass switches on the moment the payment is confirmed.'
            : 'Pay with Airtel or MTN mobile money. You will get a prompt on your phone to approve with your PIN, and your pass switches on right after.'}
        </p>
      </div>

      {message && (
        <div className={`flex items-start gap-2 text-sm rounded-xl p-3 mb-4 ${phase === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-800'}`}>
          {phase === 'error' ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />}
          <span>{message}</span>
        </div>
      )}

      <button type="button" onClick={start} disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 bg-[#F5B800] text-[#0D2B45] font-bold text-sm py-3.5 rounded-xl disabled:opacity-60">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
        {phase === 'starting' ? 'Starting…' : phase === 'paying' ? 'Complete the payment in the popup…' : phase === 'verifying' ? 'Confirming…' : `Pay ${amountLabel}`}
      </button>
      <p className="mt-3 text-[11px] text-gray-400 text-center leading-relaxed">
        Charged in kwacha at today&apos;s rate where needed. {LICENCE_TERMS}
      </p>
    </div>
  )
}
