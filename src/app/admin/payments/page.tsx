'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  Loader2, CheckCircle2, XCircle, Clock, ShieldCheck, AlertCircle,
  Phone, User, Mail, Calendar, Hash, ArrowLeft, RefreshCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type PaymentStatus = 'pending' | 'verified' | 'rejected'

interface Payment {
  id: number
  reference: string
  user_id: string
  user_email: string
  user_name: string | null
  region: string
  country_name: string | null
  plan: string
  account_type: string
  amount_zmw: number | null
  amount_usd: number | null
  currency: string
  payment_method: string
  sender_phone: string | null
  sender_name: string | null
  txn_reference: string | null
  status: PaymentStatus
  admin_note: string | null
  submitted_at: string
  verified_at: string | null
  screenshot_url: string
}

const TABS: { id: PaymentStatus | 'all'; label: string }[] = [
  { id: 'pending',  label: 'Pending'  },
  { id: 'verified', label: 'Verified' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all',      label: 'All'      },
]

export default function AdminPaymentsPage() {
  const [authState, setAuthState] = useState<'loading' | 'anon' | 'forbidden' | 'ok'>('loading')
  const [tab, setTab] = useState<PaymentStatus | 'all'>('pending')
  const [payments, setPayments] = useState<Payment[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [actioning, setActioning] = useState<string | null>(null) // reference being acted on
  const [rejectingRef, setRejectingRef] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const load = useCallback(async (which: PaymentStatus | 'all') => {
    setListLoading(true)
    try {
      const res = await fetch(`/api/admin/payments/list?status=${which}`)
      if (res.status === 403) {
        setAuthState('forbidden')
        return
      }
      const data = await res.json()
      setPayments(data.payments || [])
      setAuthState('ok')
    } catch {
      setFlash({ kind: 'err', msg: 'Could not load payments.' })
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    const boot = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setAuthState('anon'); return }
      await load(tab)
    }
    boot()
  }, [load, tab])

  const act = async (reference: string, action: 'verify' | 'reject', note?: string) => {
    setActioning(reference)
    setFlash(null)
    try {
      const res = await fetch('/api/admin/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, action, note }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFlash({ kind: 'err', msg: data.error || 'Action failed.' })
      } else {
        setFlash({
          kind: 'ok',
          msg: action === 'verify'
            ? `Verified. Customer activated and emailed.`
            : `Rejected. Customer notified to resubmit.`,
        })
        setRejectingRef(null)
        setRejectNote('')
        await load(tab)
      }
    } catch {
      setFlash({ kind: 'err', msg: 'Network error.' })
    } finally {
      setActioning(null)
    }
  }

  // ── Auth states ───────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    )
  }
  if (authState === 'anon') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <ShieldCheck size={40} className="text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-black text-navy mb-2">Admin area</h1>
          <p className="text-gray-500 mb-6">Sign in with an authorised admin account to continue.</p>
          <Link href="/login?next=%2Fadmin%2Fpayments" className="bg-primary text-white px-6 py-3 rounded-xl font-bold inline-flex items-center gap-2">Sign in</Link>
        </div>
      </div>
    )
  }
  if (authState === 'forbidden') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <XCircle size={40} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-navy mb-2">Not authorised</h1>
          <p className="text-gray-500 mb-6">
            Your account is not on the admin allow-list. Contact the site owner to be added
            to <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">ADMIN_EMAILS</code>.
          </p>
          <Link href="/dashboard" className="text-primary font-semibold">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  // ── Main admin UI ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary">
            <ArrowLeft size={14} />
            Back to dashboard
          </Link>
          <h1 className="text-lg font-black text-navy">Manual payments</h1>
          <button
            onClick={() => load(tab)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary"
          >
            <RefreshCw size={14} className={listLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                  active ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {flash && (
          <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
            flash.kind === 'ok'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {flash.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {flash.msg}
          </div>
        )}

        {listLoading ? (
          <div className="py-16 flex justify-center">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-16 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
            No payments with status &ldquo;{tab}&rdquo;.
          </div>
        ) : (
          <div className="space-y-4">
            {payments.map((p) => (
              <PaymentCard
                key={p.id}
                p={p}
                isRejecting={rejectingRef === p.reference}
                rejectNote={rejectNote}
                setRejectNote={setRejectNote}
                startReject={() => { setRejectingRef(p.reference); setRejectNote('') }}
                cancelReject={() => { setRejectingRef(null); setRejectNote('') }}
                confirmReject={() => act(p.reference, 'reject', rejectNote)}
                verify={() => act(p.reference, 'verify')}
                busy={actioning === p.reference}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Single payment card ─────────────────────────────────────────────────────

function PaymentCard({
  p, isRejecting, rejectNote, setRejectNote,
  startReject, cancelReject, confirmReject, verify, busy,
}: {
  p: Payment
  isRejecting: boolean
  rejectNote: string
  setRejectNote: (v: string) => void
  startReject: () => void
  cancelReject: () => void
  confirmReject: () => void
  verify: () => void
  busy: boolean
}) {
  const amount = p.currency === 'ZMW' ? `K${p.amount_zmw}` : `$${p.amount_usd}`
  const badge =
    p.status === 'pending'  ? { bg: 'bg-amber-50 border-amber-200 text-amber-700', icon: <Clock size={14} />, label: 'Pending' } :
    p.status === 'verified' ? { bg: 'bg-green-50 border-green-200 text-green-700', icon: <CheckCircle2 size={14} />, label: 'Verified' } :
                              { bg: 'bg-red-50 border-red-200 text-red-700',       icon: <XCircle size={14} />,       label: 'Rejected' }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <div className="grid md:grid-cols-[280px,1fr] gap-0">
        {/* screenshot */}
        <div className="relative bg-gray-100 aspect-[3/4] md:aspect-auto md:min-h-[240px]">
          {p.screenshot_url ? (
            <a href={p.screenshot_url} target="_blank" rel="noopener noreferrer">
              <Image
                src={p.screenshot_url}
                alt={`screenshot ${p.reference}`}
                fill
                className="object-contain"
                unoptimized
              />
            </a>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">No screenshot</div>
          )}
        </div>

        {/* details */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                  {badge.icon} {badge.label}
                </span>
                <span className="text-xs text-gray-400 font-mono">{p.reference}</span>
              </div>
              <h3 className="font-black text-navy text-lg">
                {p.plan.toUpperCase()} · {p.account_type} · <span className="text-accent">{amount}</span>
              </h3>
            </div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-gray-400">
              {p.payment_method} · {p.region}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4 text-sm text-gray-600 mb-4">
            <InfoRow icon={<User size={13} />}     label="Name"     value={p.user_name || '—'} />
            <InfoRow icon={<Mail size={13} />}     label="Email"    value={p.user_email} />
            <InfoRow icon={<Phone size={13} />}    label="Sender"   value={p.sender_phone || '—'} />
            <InfoRow icon={<Hash size={13} />}     label="Txn ref"  value={p.txn_reference || '—'} />
            {p.country_name && <InfoRow icon={<Phone size={13} />} label="Country" value={p.country_name} />}
            <InfoRow icon={<Calendar size={13} />} label="Submitted" value={new Date(p.submitted_at).toLocaleString()} />
            {p.verified_at && <InfoRow icon={<Calendar size={13} />} label={p.status === 'verified' ? 'Verified' : 'Decided'} value={new Date(p.verified_at).toLocaleString()} />}
            {p.admin_note && <InfoRow icon={<AlertCircle size={13} />} label="Note" value={p.admin_note} />}
          </div>

          {p.status === 'pending' && (
            isRejecting ? (
              <div className="space-y-2">
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Reason (shown to the customer) — e.g. Screenshot unreadable, amount too low, wrong recipient."
                  rows={2}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={confirmReject}
                    disabled={busy}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-red-600 text-white text-sm font-bold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                    Confirm reject
                  </button>
                  <button
                    onClick={cancelReject}
                    disabled={busy}
                    className="flex-1 text-sm font-semibold text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={verify}
                  disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-green-600 text-white text-sm font-bold py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Approve &amp; activate
                </button>
                <button
                  onClick={startReject}
                  disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white border border-red-200 text-red-600 text-sm font-bold py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle size={14} /> Reject
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </motion.div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="text-gray-400 text-xs shrink-0">{label}:</span>
      <span className="truncate font-medium text-gray-700">{value}</span>
    </div>
  )
}
