'use client'

/**
 * /dashboard/billing
 *
 * Subscription & billing management.
 * - Shows current plan, renewal date, cancellation state
 * - Lets the user cancel (keeps access until expiry) or resume
 * - Lists recent payments
 */
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Loader2, ArrowLeft, CheckCircle2, AlertTriangle, Calendar,
  ChevronRight, Receipt, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS, type TierSlug } from '@/lib/pricing'

interface Profile {
  plan:                TierSlug | null
  plan_status:         string | null
  plan_expires_at:     string | null
  auto_renew_enabled:  boolean | null
  cancelled_at:        string | null
}

interface PaymentRow {
  reference:    string
  plan:         string
  status:       string
  amount_zmw:   number | null
  operator:     string | null
  created_at:   string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysUntil(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

function BillingInner() {
  const [loading,   setLoading]   = useState(true)
  const [profile,   setProfile]   = useState<Profile | null>(null)
  const [email,     setEmail]     = useState('')
  const [payments,  setPayments]  = useState<PaymentRow[]>([])
  const [busy,      setBusy]      = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error,     setError]     = useState('')

  const load = useCallback(async () => {
    // getUser() — server-verified, so billing + payment history always belong
    // to the REAL signed-in account, never a stale/swapped cookie's id.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Never redirect from here — see src/app/dashboard/page.tsx for the
      // login-loop story. Middleware already gates /dashboard/*. A transient
      // null-user client-side is a cookie race, not a real sign-out.
      setLoading(false)
      return
    }
    setEmail(user.email || '')

    const [profRes, payRes] = await Promise.all([
      supabase.from('profiles')
        .select('plan, plan_status, plan_expires_at, auto_renew_enabled, cancelled_at')
        .eq('id', user.id).single(),
      supabase.from('payments')
        .select('reference, plan, status, amount_zmw, operator, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    setProfile(profRes.data as Profile | null)
    setPayments((payRes.data || []) as PaymentRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Sign out anywhere → leave this billing page immediately (hard nav).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.location.href = '/'
    })
    return () => subscription.unsubscribe()
  }, [])

  async function doCancel() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/subscription/cancel', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'cancel failed' }))
        setError(d.error || 'Could not cancel.')
      } else {
        setConfirmCancel(false)
        await load()
      }
    } catch { setError('Network error. Try again.') }
    finally { setBusy(false) }
  }

  async function doResume() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/subscription/resume', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'resume failed' }))
        setError(d.error || 'Could not resume.')
      } else { await load() }
    } catch { setError('Network error. Try again.') }
    finally { setBusy(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  const isActive = profile?.plan_status === 'active'
  const isCancelled = isActive && profile?.auto_renew_enabled === false
  const planSlug = (profile?.plan as TierSlug) || 'starter'
  const planData = PLANS[planSlug]
  const days = daysUntil(profile?.plan_expires_at ?? null)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-20" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-6">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>

        <h1 className="text-3xl sm:text-4xl font-black text-navy tracking-tight mb-2">Billing</h1>
        <p className="text-gray-500 mb-8">Manage your subscription and view payment history.</p>

        {/* ── Subscription card ───────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6"
        >
          {/* Status banner */}
          {isCancelled && (
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle size={16} />
              <span>
                <strong>Cancelled.</strong> Your plan stays active until {formatDate(profile?.plan_expires_at ?? null)} ({days} day{days === 1 ? '' : 's'} left).
              </span>
            </div>
          )}
          {isActive && !isCancelled && (
            <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center gap-2 text-sm text-green-800">
              <CheckCircle2 size={16} />
              <span><strong>Active subscription.</strong> Renews on {formatDate(profile?.plan_expires_at ?? null)}.</span>
            </div>
          )}
          {!isActive && (
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center gap-2 text-sm text-gray-700">
              <span><strong>No active plan.</strong> Upgrade to download datasets.</span>
            </div>
          )}

          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Current plan</p>
                <h2 className="text-3xl font-black text-navy">{planData?.name ?? 'Free'}</h2>
                <p className="text-sm text-gray-500 mt-1">{planData?.description}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-primary">{planData?.priceLabel ?? '—'}</p>
                <p className="text-xs text-gray-400">USD / month</p>
              </div>
            </div>

            {/* Key dates */}
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-gray-100">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Status</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {isCancelled ? 'Cancelled' : isActive ? 'Active' : 'Free'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  {isCancelled ? 'Access until' : isActive ? 'Renews' : 'Expires'}
                </dt>
                <dd className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                  <Calendar size={13} className="text-gray-400" />
                  {formatDate(profile?.plan_expires_at ?? null)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Billed to</dt>
                <dd className="text-sm font-medium text-gray-900 truncate">{email}</dd>
              </div>
            </dl>

            {/* Actions */}
            {error && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {!isActive && (
                <Link
                  href="/dashboard/payment"
                  className="inline-flex items-center gap-2 bg-primary text-white font-bold px-5 py-2.5 rounded-xl hover:bg-navy transition-all"
                >
                  Choose a plan <ChevronRight size={16} />
                </Link>
              )}

              {isActive && (
                <Link
                  href={`/dashboard/payment?plan=${planSlug}&renew=1`}
                  className="inline-flex items-center gap-2 bg-primary text-white font-bold px-5 py-2.5 rounded-xl hover:bg-navy transition-all"
                >
                  {isCancelled ? 'Renew now' : 'Renew early'} <ChevronRight size={16} />
                </Link>
              )}

              {isActive && !isCancelled && !confirmCancel && (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="inline-flex items-center gap-2 bg-white text-gray-700 font-medium px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all"
                  disabled={busy}
                >
                  Cancel subscription
                </button>
              )}

              {isActive && isCancelled && (
                <button
                  onClick={doResume}
                  disabled={busy}
                  className="inline-flex items-center gap-2 bg-white text-gray-700 font-medium px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-60"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                  Reactivate auto-renew
                </button>
              )}
            </div>

            {/* Inline confirm */}
            {confirmCancel && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-amber-900 mb-1">Cancel your {planData?.name} subscription?</p>
                    <p className="text-sm text-amber-800">
                      You&apos;ll keep access to everything until{' '}
                      <strong>{formatDate(profile?.plan_expires_at ?? null)}</strong>.
                      After that you&apos;ll need to pay again to download datasets.
                    </p>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={doCancel}
                        disabled={busy}
                        className="inline-flex items-center gap-2 bg-red-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-red-700 transition-all disabled:opacity-60 text-sm"
                      >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                        Yes, cancel
                      </button>
                      <button
                        onClick={() => setConfirmCancel(false)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 bg-white text-gray-700 font-medium px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
                      >
                        Keep my plan
                      </button>
                    </div>
                  </div>
                  <button onClick={() => setConfirmCancel(false)} className="text-amber-600 hover:text-amber-800">
                    <X size={18} />
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* ── Payment history ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Receipt size={16} className="text-gray-400" />
            <h3 className="font-bold text-navy">Payment history</h3>
          </div>
          {payments.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-500 text-center">No payments yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {payments.map((p) => (
                <div key={p.reference} className="px-6 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-900 capitalize">{p.plan} plan</p>
                    <p className="text-xs text-gray-500">
                      {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {p.operator ? ` · ${p.operator.toUpperCase()}` : ' · Card'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {p.amount_zmw != null ? `K${p.amount_zmw.toLocaleString()}` : '—'}
                    </p>
                    <p className={`text-xs font-semibold ${
                      p.status === 'successful' ? 'text-green-600'
                        : p.status === 'failed'  ? 'text-red-600'
                        : 'text-amber-600'
                    }`}>
                      {p.status === 'successful' ? 'Paid' : p.status === 'failed' ? 'Failed' : 'Pending'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    }>
      <BillingInner />
    </Suspense>
  )
}
