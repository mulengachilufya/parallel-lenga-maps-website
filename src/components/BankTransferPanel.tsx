'use client'

/**
 * BankTransferPanel — the self-serve payment method for the Individual plan.
 *
 * Flow:
 *   1. User clicks "Get bank details".
 *   2. POST /api/payments/bank-details → emails them our bank details (inline
 *      HTML via the dedicated Resend key), alerts the founder with the amount
 *      and reference to expect, AND returns the details for inline display.
 *   3. User transfers from their card/bank, then taps "I've paid".
 *   4. POST /api/payments/manual (payment_method='bank', no screenshot) → pending row +
 *      admin-verify pipeline. We show a "we'll verify shortly" confirmation —
 *      the plan is NOT active until an admin approves.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Landmark, Loader2, Lock, AlertCircle, ChevronRight, Mail, Check, ShieldCheck,
} from 'lucide-react'
import type { BankDetails } from '@/lib/bank-details'
import type { TierSlug } from '@/lib/pricing'

interface Props {
  plan:        TierSlug
  amountLabel: string          // e.g. "$12 USD"
  userEmail:   string
  userName?:   string
}

type Phase = 'intro' | 'details' | 'submitted'

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className="font-mono font-bold text-navy truncate">{value}</p>
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

export default function BankTransferPanel({ plan, amountLabel, userEmail, userName = '' }: Props) {
  const [phase,     setPhase]     = useState<Phase>('intro')
  const [loading,   setLoading]   = useState(false)
  const [errorMsg,  setErrorMsg]  = useState('')
  const [bank,      setBank]      = useState<BankDetails | null>(null)
  const [emailed,   setEmailed]   = useState(false)
  const [bankRef,   setBankRef]   = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [reference,  setReference]  = useState('')

  async function getBankDetails() {
    setLoading(true); setErrorMsg('')
    try {
      const r = await fetch('/api/payments/bank-details', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      })
      const d = await r.json() as { emailed?: boolean; email?: string; reference?: string; bankDetails?: BankDetails; error?: string }
      if (!r.ok) { setErrorMsg(d.error ?? 'Could not load bank details.'); return }
      setBank(d.bankDetails ?? null)
      setEmailed(Boolean(d.emailed))
      setBankRef(d.reference ?? '')
      setPhase('details')
    } catch {
      setErrorMsg('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function claimPaid() {
    setSubmitting(true); setErrorMsg('')
    const fd = new FormData()
    fd.append('plan',           plan)
    fd.append('payment_method', 'bank')
    fd.append('region',         '')          // not applicable to bank transfer
    fd.append('sender_name',    userName)
    try {
      const res  = await fetch('/api/payments/manual', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data.error || 'Could not send. Please try again.'); return }
      setReference(data.reference)
      setPhase('submitted')
    } catch {
      setErrorMsg('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Submitted / pending ────────────────────────────────────────────────
  if (phase === 'submitted') {
    return (
      <div className="text-center py-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Check size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-black text-navy tracking-tight mb-2">Thanks, we&apos;re on it</h2>
        <p className="text-gray-500 mb-1">
          We&apos;ll verify your transfer and switch on your plan — usually within a few hours.
        </p>
        {reference && (
          <p className="text-sm text-gray-400">
            Reference: <span className="font-mono font-bold text-gray-600">{reference}</span>
          </p>
        )}
        <p className="mt-4 text-xs text-gray-400">
          We&apos;ll email <span className="font-medium text-gray-600">{userEmail}</span> the moment it&apos;s active.
        </p>
      </div>
    )
  }

  // ── Intro ──────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div>
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-navy/5 flex items-center justify-center">
            <Landmark size={30} className="text-navy" />
          </div>
        </div>

        <h2 className="text-2xl sm:text-3xl font-black text-navy text-center tracking-tight mb-1.5">
          Pay by card or bank transfer
        </h2>
        <p className="text-center text-sm text-gray-500 mb-7 max-w-sm mx-auto">
          We&apos;ll email your bank details and show them here. Transfer {amountLabel}, tap
          &ldquo;I&apos;ve paid&rdquo;, and we activate your plan, usually within a few hours.
        </p>

        <button
          onClick={getBankDetails}
          disabled={loading}
          className="group w-full flex items-center justify-center gap-3 bg-navy text-white font-bold py-4 sm:py-5 rounded-2xl text-base sm:text-lg shadow-[0_8px_24px_-12px_rgba(11,21,48,0.55)] hover:shadow-[0_12px_28px_-12px_rgba(11,21,48,0.7)] hover:translate-y-[-1px] transition-all disabled:opacity-60 disabled:translate-y-0 disabled:shadow-none"
        >
          {loading ? (
            <><Loader2 size={20} className="animate-spin" /> Getting your details…</>
          ) : (
            <>Get bank details <ChevronRight size={20} className="transition-transform group-hover:translate-x-0.5" /></>
          )}
        </button>

        {errorMsg && (
          <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{errorMsg}</p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-center gap-x-5 gap-y-2 flex-wrap text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5"><Lock size={12} className="text-gray-400" /> Reviewed by a human</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} className="text-gray-400" /> No card details entered online</span>
        </div>
      </div>
    )
  }

  // ── Details + proof upload ─────────────────────────────────────────────
  return (
    <div>
      {/* Email status + spam nudge */}
      <div className={`flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5 ${emailed ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
        <Mail size={16} className={`shrink-0 mt-0.5 ${emailed ? 'text-green-600' : 'text-amber-600'}`} />
        <p className={`text-sm ${emailed ? 'text-green-800' : 'text-amber-800'}`}>
          {emailed ? (
            <>We&apos;ve emailed these details to <strong>{userEmail}</strong>. Can&apos;t find it?
            Check your <strong>spam / promotions</strong> folder.</>
          ) : (
            <>Here are your bank details below. (We couldn&apos;t email them just now — no problem,
            everything you need is on this page.)</>
          )}
        </p>
      </div>

      <h3 className="text-xl font-black text-navy tracking-tight mb-1">Transfer {amountLabel}</h3>
      <p className="text-sm text-gray-500 mb-5">
        Put <strong className="text-gray-700 font-mono">{bankRef || userEmail}</strong> in the payment reference field so we can match your transfer.
      </p>

      {bank && (
        <div className="space-y-2 mb-6">
          <CopyRow label="Account name"   value={bank.accountName} />
          <CopyRow label="Bank"           value={bank.bankName} />
          <CopyRow label="Account number" value={bank.accountNumber} />
          <CopyRow label="Branch code"    value={bank.branchCode} />
          <CopyRow label="SWIFT / BIC"    value={bank.swift} />
          <CopyRow label="Bank address"   value={bank.bankAddress} />
          <CopyRow label="Payment reference" value={bankRef || userEmail} />
          <p className="text-xs text-gray-500 px-1 pt-1 leading-relaxed">
            <strong className="text-gray-700">Transfer fees are on us.</strong> Send exactly {amountLabel}. If your
            bank asks who pays the charges, choose <strong className="text-gray-700">BEN</strong> (beneficiary)
            so the fees come out of what we receive, not your pocket.
          </p>
        </div>
      )}

      {/* One tap once the money has gone: we check the bank and switch the plan on. */}
      <div className="border-t border-gray-100 pt-5">
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => void claimPaid()}
          disabled={submitting}
          className="w-full bg-[#F5B800] text-[#1a1200] font-black text-lg py-4 rounded-2xl hover:bg-[#ffc81f] transition disabled:opacity-60 flex items-center justify-center gap-2 shadow-[0_10px_24px_-10px_rgba(201,162,39,0.9)]"
        >
          {submitting ? <><Loader2 className="animate-spin" size={18} /> Sending…</> : <>I&apos;ve paid <Check size={20} /></>}
        </button>
        <p className="mt-2 text-center text-xs text-gray-500">We check our bank and switch your plan on, usually within a few hours.</p>
      </div>
    </div>
  )
}
