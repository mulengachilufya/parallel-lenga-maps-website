'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Check, AlertCircle, Loader2, ArrowRight, ArrowLeft, Flag, Globe2 } from 'lucide-react'
import { PLANS, type TierSlug } from '@/lib/pricing'

const RECEIVER_NAME = 'Lenga Maps'
const MTN_NUMBER    = '+260 965 699 359'
const AIRTEL_NUMBER = '+260 779 187 025'

interface Props {
  plan:       TierSlug
  userEmail:  string
  userName:   string
  onSuccess:  (ref: string) => void
}

type Region = 'zambian' | 'international'
type Method = 'mtn' | 'airtel'
type Step   = 1 | 2

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
      <div>
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className="font-mono font-bold text-navy">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
        className="text-xs font-semibold text-primary hover:text-navy transition-colors shrink-0"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}

export default function ManualPaymentFlow({ plan, userEmail, userName, onSuccess }: Props) {
  const planData    = PLANS[plan]
  const amountLabel = `${planData.priceLabel} USD`

  const [step,        setStep]   = useState<Step>(1)
  const [region,      setRegion] = useState<Region | null>(null)
  const [method,      setMethod] = useState<Method>('mtn')
  const [countryName, setCountry] = useState('')
  const [senderName,  setSenderName] = useState(userName)
  const [senderPhone, setPhone]  = useState('')
  const [txnRef,      setTxnRef] = useState('')
  const [file,        setFile]   = useState<File | null>(null)
  const [preview,     setPreview] = useState<string | null>(null)
  const [submitting,  setSubmitting] = useState(false)
  const [error,       setError]  = useState('')
  const [done,        setDone]   = useState<{ reference: string } | null>(null)

  const receiverNumber = method === 'mtn' ? MTN_NUMBER : AIRTEL_NUMBER

  function handleFile(f: File | null) {
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('Please attach your payment screenshot.'); return }
    if (!senderName.trim()) { setError('Please enter the name on your mobile money account.'); return }
    setSubmitting(true)
    setError('')

    const fd = new FormData()
    fd.append('plan',           plan)
    fd.append('region',         region!)
    fd.append('payment_method', method)
    fd.append('country_name',   countryName)
    fd.append('sender_name',    senderName)
    fd.append('sender_phone',   senderPhone)
    fd.append('txn_reference',  txnRef)
    fd.append('screenshot',     file)

    try {
      const res  = await fetch('/api/payments/manual', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Submission failed. Please try again.'); return }
      setDone({ reference: data.reference })
      onSuccess(data.reference)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="text-5xl mb-4">✅</div>
        <h3 className="text-xl font-bold text-navy mb-2">Payment proof received</h3>
        <p className="text-gray-500 text-sm mb-2">
          Reference: <span className="font-mono font-bold">{done.reference}</span>
        </p>
        <p className="text-gray-500 text-sm">
          We'll verify and activate your account within 24 hours.
        </p>
      </div>
    )
  }

  // Step 1 — region picker
  if (step === 1 || !region) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-bold text-navy mb-1">Where are you paying from?</h3>
          <p className="text-sm text-gray-500">This determines which transfer method you'll use.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <button
            onClick={() => { setRegion('zambian'); setStep(2) }}
            className="text-left bg-white border-2 border-gray-200 hover:border-green-500 hover:shadow-md transition-all rounded-2xl p-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <Flag size={20} className="text-green-700" />
              <span className="text-xs font-bold uppercase tracking-wider text-green-700">Zambia</span>
            </div>
            <h4 className="text-lg font-black text-navy mb-1">I'm in Zambia</h4>
            <p className="text-sm text-gray-500">Pay via MTN MoMo or Airtel Money in Zambia.</p>
            <p className="mt-3 text-2xl font-black text-green-700">{amountLabel}</p>
          </button>
          <button
            onClick={() => { setRegion('international'); setStep(2) }}
            className="text-left bg-white border-2 border-gray-200 hover:border-primary hover:shadow-md transition-all rounded-2xl p-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <Globe2 size={20} className="text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">International</span>
            </div>
            <h4 className="text-lg font-black text-navy mb-1">I'm outside Zambia</h4>
            <p className="text-sm text-gray-500">
              Convert {amountLabel} to your local currency at today's rate and transfer internationally.
            </p>
            <p className="mt-3 text-2xl font-black text-primary">{amountLabel}</p>
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center">
          Signed in as <span className="font-semibold">{userEmail}</span>
        </p>
      </div>
    )
  }

  // Step 2 — payment instructions + form
  const isIntl = region === 'international'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary"
        >
          <ArrowLeft size={14} /> Change region
        </button>
      </div>

      {/* Amount */}
      <div className="bg-gradient-to-br from-navy to-primary text-white rounded-2xl p-6 text-center">
        <p className="text-xs uppercase tracking-widest text-blue-200 mb-2">Amount to send</p>
        <p className="text-5xl font-black mb-2">{amountLabel}</p>
        <p className="text-blue-200 text-sm">Plan: <span className="text-white font-semibold">{planData.name}</span></p>
        {isIntl && (
          <p className="text-blue-300 text-xs mt-2">
            Convert to your local currency at today's rate. We verify the equivalent on our end.
          </p>
        )}
      </div>

      {/* Method toggle */}
      <div>
        <p className="text-sm font-bold text-navy mb-2">Payment provider</p>
        <div className="grid grid-cols-2 gap-3">
          {(['mtn', 'airtel'] as Method[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`py-3 rounded-xl border-2 font-bold text-sm transition ${
                method === m
                  ? m === 'mtn' ? 'border-yellow-400 bg-yellow-50 text-yellow-800' : 'border-red-400 bg-red-50 text-red-800'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {m === 'mtn' ? 'MTN MoMo' : 'Airtel Money'}
            </button>
          ))}
        </div>
      </div>

      {/* Receiver details */}
      <div className="space-y-2">
        <CopyRow label={`${method === 'mtn' ? 'MTN' : 'Airtel'} number`} value={receiverNumber} />
        <CopyRow label="Receiver name" value={RECEIVER_NAME} />
        <CopyRow label="Payment reference (use your email)" value={userEmail} />
      </div>

      {/* Instructions */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
        <h4 className="font-bold text-navy mb-3">How to send</h4>
        <ol className="space-y-2 text-sm">
          {(isIntl ? [
            `From your ${method === 'mtn' ? 'MTN MoMo' : 'Airtel Money'} app, choose "Send money abroad" to Zambia.`,
            `Enter the number above and confirm receiver: "${RECEIVER_NAME}".`,
            `Enter the equivalent of ${amountLabel} in your local currency — your app will show the rate.`,
            `Use your email address (${userEmail}) as the payment reference.`,
            `Screenshot the confirmation and upload it below.`,
          ] : [
            `Dial ${method === 'mtn' ? '*303#' : '*115#'} or open your ${method === 'mtn' ? 'MTN MoMo' : 'Airtel Money'} app.`,
            `Choose "Send money" and enter the number above.`,
            `Enter ${amountLabel} and confirm receiver: "${RECEIVER_NAME}".`,
            `Use your email (${userEmail}) as the reference.`,
            `Screenshot the confirmation and upload it below.`,
          ]).map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <span className="text-gray-700 pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        {isIntl && (
          <div>
            <label className="block text-sm font-bold text-navy mb-1">Your country</label>
            <input
              type="text"
              value={countryName}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. Kenya, Nigeria, South Africa"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary text-navy"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-navy mb-1">Name on your mobile money account</label>
          <input
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Your full name"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary text-navy"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-navy mb-1">
            Your phone number <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="tel"
            value={senderPhone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+260 97 123 4567"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary text-navy"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-navy mb-1">
            Transaction ID <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={txnRef}
            onChange={(e) => setTxnRef(e.target.value)}
            placeholder="From your confirmation SMS"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary text-navy font-mono"
          />
        </div>

        {/* Screenshot upload */}
        <div>
          <label className="block text-sm font-bold text-navy mb-1">
            Payment screenshot <span className="text-red-500">*</span>
          </label>
          <label className="block cursor-pointer">
            <div className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
              preview ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-primary hover:bg-blue-50'
            }`}>
              {preview ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Payment screenshot" className="max-h-48 mx-auto rounded-lg" />
                  <p className="text-sm font-semibold text-green-700">
                    <Check size={14} className="inline mr-1" />{file?.name} — tap to replace
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload size={28} className="mx-auto text-gray-400" />
                  <p className="text-sm font-semibold text-navy">Tap to upload screenshot</p>
                  <p className="text-xs text-gray-400">JPG, PNG, WEBP or HEIC — max 5MB</p>
                </div>
              )}
            </div>
            <input type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0] || null)} className="hidden" />
          </label>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={submitting || !file}
        className="w-full bg-primary text-white font-black text-lg py-4 rounded-2xl hover:bg-navy transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting
          ? <><Loader2 className="animate-spin" size={18} /> Submitting…</>
          : <>Submit payment proof <ArrowRight size={18} /></>
        }
      </button>
    </form>
  )
}