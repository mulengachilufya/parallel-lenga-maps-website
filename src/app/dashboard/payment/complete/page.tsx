'use client'

/**
 * /dashboard/payment/complete
 *
 * Landing page after a Lipila card payment redirect.
 * Lipila sends the user here after they complete (or abandon) the card form.
 * We poll /api/payments/verify/{reference} until we get a terminal status.
 */

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

type Status = 'polling' | 'successful' | 'failed' | 'error'

const MAX_ATTEMPTS   = 30   // 30 × 3 s = 90 s
const POLL_INTERVAL  = 3000

function CompleteInner() {
  const params    = useSearchParams()
  const router    = useRouter()
  const reference = params.get('reference')

  const [status, setStatus] = useState<Status>('polling')

  useEffect(() => {
    if (!reference) { setStatus('error'); return }

    let attempts = 0
    let timeout: NodeJS.Timeout

    const poll = async () => {
      if (attempts >= MAX_ATTEMPTS) { setStatus('error'); return }
      attempts++
      try {
        const res  = await fetch(`/api/payments/verify/${reference}`)
        const data = await res.json() as { status: string }
        if (data.status === 'successful') { setStatus('successful'); return }
        if (data.status === 'failed')     { setStatus('failed');     return }
        // pending / not_initiated — keep polling
        timeout = setTimeout(poll, POLL_INTERVAL)
      } catch {
        timeout = setTimeout(poll, POLL_INTERVAL)
      }
    }

    poll()
    return () => clearTimeout(timeout)
  }, [reference])

  // ── Polling ────────────────────────────────────────────────────────────
  if (status === 'polling') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-navy mb-2">Confirming your payment…</h2>
          <p className="text-sm text-gray-500">This usually takes a few seconds.</p>
        </div>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────
  if (status === 'successful') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-10 shadow-lg max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-navy mb-2">Payment confirmed!</h2>
          <p className="text-gray-500 mb-6">
            Your plan is now active. You can download datasets straight away.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-xl hover:bg-navy transition-all"
          >
            Go to dashboard
          </Link>
        </motion.div>
      </div>
    )
  }

  // ── Failed / Error ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-10 shadow-lg max-w-md w-full text-center"
      >
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle size={32} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-navy mb-2">
          {status === 'failed' ? 'Payment not completed' : 'Something went wrong'}
        </h2>
        <p className="text-gray-500 mb-6">
          {status === 'failed'
            ? 'Your card was not charged. You can try again or use Mobile Money.'
            : 'We could not confirm your payment. If you were charged, contact us and we\'ll sort it out.'}
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard/payment"
            className="inline-flex items-center justify-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-xl hover:bg-navy transition-all"
          >
            Try again
          </Link>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-primary py-1">
            Back to dashboard
          </Link>
        </div>
      </motion.div>
    </div>
  )
}

export default function PaymentCompletePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    }>
      <CompleteInner />
    </Suspense>
  )
}
