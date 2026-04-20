'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Check, Copy, Upload, AlertCircle,
  CheckCircle2, Flag, Globe2, Loader2,
} from 'lucide-react'
import { PLAN_PRICING, type AccountType, type PlanTier } from '@/lib/supabase'
import { MtnBadge, AirtelBadge } from '@/components/PaymentProviderIcons'

// ─── Constants ──────────────────────────────────────────────────────────────

const MTN_NUMBER    = '+260 965 699 359'
const AIRTEL_NUMBER = '+260 779 187 025'
const RECEIVER_NAME = 'Mulenga Chilufya'

type Region = 'zambian' | 'international'
type Method = 'mtn' | 'airtel'

interface Props {
  plan: PlanTier
  accountType: AccountType
  userEmail: string
  userName: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between bg-white rounded-xl border-2 border-gray-200 px-5 py-4">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
          {label}
        </div>
        <div className="text-xl sm:text-2xl font-black text-navy truncate select-all">
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value.replace(/\s/g, ''))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch { /* clipboard API blocked — user can long-press to copy */ }
        }}
        className={`ml-4 shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${
          copied ? 'bg-green-600 text-white' : 'bg-navy text-white hover:bg-primary'
        }`}
      >
        {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
      </button>
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ManualPaymentFlow({ plan, accountType, userEmail, userName }: Props) {
  const price = PLAN_PRICING[accountType]?.[plan]

  // Region default: if the plan has a local ZMW price, default to zambian; else international
  const [region, setRegion] = useState<Region | null>(null)
  const [step, setStep]     = useState<1 | 2 | 3>(1)

  const [method, setMethod]         = useState<Method>('mtn')
  const [countryName, setCountry]   = useState('')
  const [senderPhone, setPhone]     = useState('')
  const [senderName, setSenderName] = useState(userName || '')
  const [txnRef, setTxnRef]         = useState('')
  const [file, setFile]             = useState<File | null>(null)
  const [preview, setPreview]       = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [done, setDone]             = useState<{ reference: string } | null>(null)

  const amountLabel = useMemo(() => {
    if (!price) return '—'
    if (region === 'zambian' && price.zmw) return `K${price.zmw.toLocaleString()}`
    return `$${price.usd.toLocaleString()}`
  }, [price, region])

  const receiverNumber = method === 'mtn' ? MTN_NUMBER : AIRTEL_NUMBER

  // ── File change ───────────────────────────────────────────────────────────
  const handleFile = (f: File | null) => {
    if (!f) { setFile(null); setPreview(null); return }
    if (f.size > 5 * 1024 * 1024) {
      setError('Screenshot must be 5 MB or smaller.')
      return
    }
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type)) {
      setError('Screenshot must be a JPG, PNG, WEBP or HEIC image.')
      return
    }
    setError(null)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!file) { setError('Please attach the payment screenshot.'); return }
    if (!region) { setError('Please pick your region first.'); return }

    const fd = new FormData()
    fd.append('plan', plan)
    fd.append('account_type', accountType)
    fd.append('region', region)
    fd.append('payment_method', method)
    fd.append('country_name', countryName)
    fd.append('sender_phone', senderPhone)
    fd.append('sender_name', senderName)
    fd.append('txn_reference', txnRef)
    fd.append('screenshot', file)

    setSubmitting(true)
    try {
      const res = await fetch('/api/payments/manual', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Submission failed.')
        return
      }
      setDone({ reference: data.reference })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Success screen
  // ─────────────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border-2 border-green-200 p-8 sm:p-10 shadow-sm text-center"
      >
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={42} className="text-green-600" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-navy mb-3">Payment submitted</h2>
        <p className="text-lg text-gray-600 mb-6 max-w-md mx-auto leading-relaxed">
          We&apos;ve received your screenshot. Your account will be upgraded as soon as we verify the transfer
          — usually within a few hours.
        </p>
        <div className="inline-block bg-gray-50 border border-gray-200 rounded-xl px-6 py-3 mb-6">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Reference</div>
          <div className="font-mono text-xl font-bold text-navy">{done.reference}</div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/datasets"
            className="inline-flex items-center justify-center gap-2 bg-primary text-white font-bold px-6 py-3.5 rounded-xl hover:bg-navy transition"
          >
            Browse datasets <ArrowRight size={18} />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-gray-100 text-navy font-semibold px-6 py-3.5 rounded-xl hover:bg-gray-200 transition"
          >
            Go to dashboard
          </Link>
        </div>
      </motion.div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 — region picker
  // ─────────────────────────────────────────────────────────────────────────
  if (step === 1 || !region) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-navy mb-2">Where are you paying from?</h1>
          <p className="text-lg text-gray-500">
            This determines which currency and transfer method you&apos;ll use.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <button
            onClick={() => { setRegion('zambian'); setStep(2) }}
            className="group text-left bg-white border-2 border-gray-200 hover:border-green-500 hover:shadow-lg transition-all rounded-2xl p-7"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <Flag size={24} className="text-green-700" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-green-700">Zambia</span>
            </div>
            <h3 className="text-2xl font-black text-navy mb-2">I&apos;m in Zambia</h3>
            <p className="text-gray-500 mb-4 leading-relaxed">
              Pay in Zambian Kwacha using MTN Mobile Money or Airtel Money.
            </p>
            {price?.zmw != null && (
              <div className="inline-block bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <span className="text-3xl font-black text-green-700">K{price.zmw.toLocaleString()}</span>
                <span className="text-sm text-green-700 ml-1">/month</span>
              </div>
            )}
          </button>

          <button
            onClick={() => { setRegion('international'); setStep(2) }}
            className="group text-left bg-white border-2 border-gray-200 hover:border-primary hover:shadow-lg transition-all rounded-2xl p-7"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Globe2 size={24} className="text-primary" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">International</span>
            </div>
            <h3 className="text-2xl font-black text-navy mb-2">I&apos;m outside Zambia</h3>
            <p className="text-gray-500 mb-4 leading-relaxed">
              Pay in US Dollars via MTN or Airtel cross-country mobile money transfer.
            </p>
            {price?.usd != null && (
              <div className="inline-block bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                <span className="text-3xl font-black text-primary">${price.usd.toLocaleString()}</span>
                <span className="text-sm text-primary ml-1">/month</span>
              </div>
            )}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center pt-2">
          Signed in as <span className="font-semibold">{userEmail}</span>.
          Every submission is linked to your account.
        </p>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — payment instructions + form
  // ─────────────────────────────────────────────────────────────────────────
  const isIntl = region === 'international'

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Header with back */}
      <div>
        <button
          type="button"
          onClick={() => setStep(1)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-3"
        >
          <ArrowLeft size={14} /> Change region
        </button>
        <h1 className="text-3xl sm:text-4xl font-black text-navy mb-2">
          Pay {amountLabel}
        </h1>
        <p className="text-lg text-gray-500">
          {isIntl
            ? 'Follow the steps below to send the transfer from your country to Zambia.'
            : 'Follow the steps below to send the transfer using your phone.'}
        </p>
      </div>

      {/* ── Amount — oversize ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-navy to-primary text-white rounded-2xl p-8 text-center shadow-lg">
        <div className="text-sm uppercase tracking-[0.2em] text-blue-200 mb-3">Amount to send</div>
        <div className="text-6xl sm:text-7xl font-black mb-2 leading-none">{amountLabel}</div>
        <div className="text-blue-200 text-sm">
          Plan: <span className="text-white font-semibold capitalize">{plan}</span> ·{' '}
          Type: <span className="text-white font-semibold capitalize">{accountType}</span>
        </div>
      </div>

      {/* ── Method toggle ─────────────────────────────────────────────── */}
      <div>
        <div className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">
          Choose payment provider
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMethod('mtn')}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition ${
              method === 'mtn'
                ? 'border-yellow-400 bg-yellow-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <MtnBadge size={44} />
            <div className="text-left">
              <div className="font-black text-navy text-lg">MTN</div>
              <div className="text-xs text-gray-500">Mobile Money</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMethod('airtel')}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition ${
              method === 'airtel'
                ? 'border-red-500 bg-red-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <AirtelBadge size={44} />
            <div className="text-left">
              <div className="font-black text-navy text-lg">Airtel</div>
              <div className="text-xs text-gray-500">Airtel Money</div>
            </div>
          </button>
        </div>
      </div>

      {/* ── Receiver details ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <CopyRow label={`${method === 'mtn' ? 'MTN' : 'Airtel'} number to send to`} value={receiverNumber} />
        <CopyRow label="Receiver name" value={RECEIVER_NAME} />
      </div>

      {/* ── Step-by-step instructions ─────────────────────────────────── */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
        <h3 className="text-xl font-black text-navy mb-4">How to send</h3>
        <ol className="space-y-3 text-base">
          {(isIntl
            ? [
                `From your MTN MoMo / Airtel Money app, choose "Send money abroad" (or "Cross-border transfer") to Zambia.`,
                `Enter the ${method === 'mtn' ? 'MTN' : 'Airtel'} number above and confirm the receiver name "${RECEIVER_NAME}".`,
                `Enter the equivalent of ${amountLabel} in your local currency — your provider will quote the exact rate.`,
                `Complete the transfer and wait for the confirmation SMS.`,
                `Take a clear screenshot of the confirmation (showing amount, receiver, and transaction ID) and upload it below.`,
              ]
            : [
                `Dial ${method === 'mtn' ? '*303#' : '*115#'} or open your ${method === 'mtn' ? 'MTN MoMo' : 'Airtel Money'} app.`,
                `Choose "Send money" and enter the number above.`,
                `Enter ${amountLabel} and confirm the receiver name "${RECEIVER_NAME}".`,
                `Complete the transfer with your PIN and wait for the confirmation SMS.`,
                `Take a clear screenshot of the confirmation and upload it below.`,
              ]
          ).map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white font-black text-sm flex items-center justify-center">
                {i + 1}
              </span>
              <span className="pt-1 text-gray-700 leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Form fields ───────────────────────────────────────────────── */}
      <div className="space-y-5">
        <h3 className="text-xl font-black text-navy">Confirm your payment</h3>

        {isIntl && (
          <div>
            <label className="block text-sm font-bold text-navy mb-2">Your country</label>
            <input
              type="text"
              value={countryName}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. Kenya, Nigeria, South Africa"
              className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary bg-white text-navy"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-navy mb-2">
            Name on your mobile-money account
          </label>
          <input
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Your full name"
            className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary bg-white text-navy"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-navy mb-2">
            Your phone number <span className="text-gray-400 font-normal">(optional but helpful)</span>
          </label>
          <input
            type="tel"
            value={senderPhone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +260 97 123 4567"
            className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary bg-white text-navy"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-navy mb-2">
            Transaction ID from your confirmation SMS{' '}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={txnRef}
            onChange={(e) => setTxnRef(e.target.value)}
            placeholder="e.g. MTN123ABC456 or MP240420.1234.A1234"
            className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary bg-white text-navy font-mono"
          />
        </div>

        {/* Upload */}
        <div>
          <label className="block text-sm font-bold text-navy mb-2">
            Payment screenshot <span className="text-red-500">*</span>
          </label>
          <label className="block cursor-pointer">
            <div className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
              preview ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-primary hover:bg-blue-50'
            }`}>
              {preview ? (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Payment screenshot" className="max-h-64 mx-auto rounded-lg shadow-sm" />
                  <p className="text-sm font-semibold text-green-700">
                    <Check size={16} className="inline mr-1" />
                    {file?.name} — tap to replace
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload size={32} className="mx-auto text-gray-400" />
                  <p className="text-base font-semibold text-navy">Tap to upload screenshot</p>
                  <p className="text-xs text-gray-500">JPG, PNG, WEBP or HEIC — up to 5 MB</p>
                </div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
          >
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Submit ────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={submitting || !file}
        className="w-full bg-primary text-white font-black text-xl py-5 rounded-2xl shadow-md hover:shadow-lg hover:bg-navy transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <><Loader2 className="animate-spin" size={20} /> Submitting…</>
        ) : (
          <>Submit {amountLabel} payment <ArrowRight size={20} /></>
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Signed in as <span className="font-semibold">{userEmail}</span>. Submission is linked to your account.
      </p>
    </form>
  )
}
