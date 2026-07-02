'use client'

/**
 * /admin/users
 *
 * Admin-only roster that shows every signed-up user side-by-side with
 * their plan + plan_status + plan_expires_at. Solves the Supabase Auth
 * UI gap (auth.users alone doesn't expose profile fields), and replaces
 * the need to write ad-hoc SQL just to answer "who's on Pro right now?"
 *
 * Auth flow:
 *   1. Anonymous → "Sign in" CTA
 *   2. Signed in, not admin → "Not authorised" page
 *   3. Signed in admin → roster table with status tabs + search
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, RefreshCw, Search, ShieldCheck, XCircle, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sectorLabel } from '@/lib/sectors'

type EffectiveStatus = 'active' | 'pending' | 'trial' | 'free' | 'expired'

interface UserRow {
  id:                string
  email:             string
  full_name:         string | null
  first_name:        string | null
  last_name:         string | null
  country:           string | null
  sector:            string | null
  plan:              string | null
  plan_status:       string | null
  effective_status:  EffectiveStatus
  plan_expires_at:   string | null
  days_left:         number | null
  created_at:        string
}

interface Summary {
  total:   number
  active:  number
  pending: number
  trial:   number
  free:    number
  expired: number
}

type TabValue = 'all' | EffectiveStatus

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all',     label: 'All' },
  { value: 'active',  label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'trial',   label: 'Free trial' },
  { value: 'free',    label: 'Free (no plan)' },
  { value: 'expired', label: 'Expired' },
]

const STATUS_CHIP: Record<EffectiveStatus, string> = {
  active:  'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  // Trial = Max access for 72h — use the Max plan's purple to make that read
  // instantly against an active paid plan (green).
  trial:   'bg-violet-100 text-violet-700',
  free:    'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-700',
}

const STATUS_LABEL: Record<EffectiveStatus, string> = {
  active:  'active',
  pending: 'pending',
  trial:   'free trial',
  free:    'free',
  expired: 'expired',
}

export default function AdminUsersPage() {
  const [authState, setAuthState] = useState<'loading' | 'anon' | 'forbidden' | 'ok'>('loading')
  const [users,    setUsers]      = useState<UserRow[]>([])
  const [summary,  setSummary]    = useState<Summary>({ total: 0, active: 0, pending: 0, trial: 0, free: 0, expired: 0 })
  const [tab,      setTab]        = useState<TabValue>('all')
  const [q,        setQ]          = useState('')
  const [loading,  setLoading]    = useState(false)
  const [err,      setErr]        = useState<string | null>(null)

  const load = useCallback(async (status: TabValue, search: string) => {
    setLoading(true)
    setErr(null)
    try {
      const params = new URLSearchParams({ status, q: search })
      const res = await fetch(`/api/admin/users/list?${params}`)
      if (res.status === 403) { setAuthState('forbidden'); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setUsers(json.users || [])
      setSummary(json.summary || { total: 0, active: 0, pending: 0, trial: 0, free: 0, expired: 0 })
      setAuthState('ok')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const boot = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setAuthState('anon'); return }
      await load(tab, q)
    }
    boot()
    // tab/q changes are picked up via the useEffect below; this one just
    // does the initial admin-status resolution + first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch on tab change or debounced search.
  useEffect(() => {
    if (authState !== 'ok') return
    const id = setTimeout(() => load(tab, q), 250)
    return () => clearTimeout(id)
  }, [tab, q, authState, load])

  const formattedSummary = useMemo(() => (
    [
      { label: 'Total',      value: summary.total,   color: 'text-navy' },
      { label: 'Active',     value: summary.active,  color: 'text-green-700' },
      { label: 'Pending',    value: summary.pending, color: 'text-amber-700' },
      { label: 'Free trial', value: summary.trial,   color: 'text-violet-700' },
      { label: 'Free',       value: summary.free,    color: 'text-gray-600' },
      { label: 'Expired',    value: summary.expired, color: 'text-red-700' },
    ]
  ), [summary])

  // ── Auth gates ───────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
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
          <Link href="/login?next=%2Fadmin%2Fusers" className="bg-primary text-white px-6 py-3 rounded-xl font-bold inline-flex items-center gap-2">Sign in</Link>
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
            Your account is not on the admin allow-list. Add your email to{' '}
            <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">ADMIN_EMAILS</code> in Vercel and redeploy.
          </p>
          <Link href="/dashboard" className="text-primary font-semibold">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary">
            <ArrowLeft size={14} />
            Back to dashboard
          </Link>
          <h1 className="text-lg font-black text-navy flex items-center gap-2">
            <Users size={18} className="text-primary" />
            Users &amp; plans
          </h1>
          <button
            onClick={() => load(tab, q)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-navy disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Summary chips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {formattedSummary.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  tab === t.value
                    ? 'bg-navy text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-navy hover:text-navy'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-md sm:ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email, name, country, plan…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        {err && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Country</th>
                  <th className="px-4 py-3 font-semibold">Sector</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Expires</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 text-navy font-medium">{u.email || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-700">{u.full_name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-700">{u.country || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{u.sector ? sectorLabel(u.sector) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {u.plan
                        ? <span className="capitalize font-semibold">{u.plan}</span>
                        : u.effective_status === 'trial'
                          ? (
                            <span className="font-semibold text-violet-700">
                              Free trial
                              <span className="block text-[10px] font-normal text-violet-500/80">Max access</span>
                            </span>
                          )
                          : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[u.effective_status]}`}>
                        {STATUS_LABEL[u.effective_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.plan_expires_at
                        ? (
                          <>
                            {new Date(u.plan_expires_at).toLocaleDateString()}
                            {u.days_left !== null && (
                              <span className={`block text-[10px] mt-0.5 ${u.days_left >= 0 ? (u.effective_status === 'trial' ? 'text-violet-500' : 'text-gray-400') : 'text-red-500'}`}>
                                {u.days_left >= 0
                                  ? `${u.days_left}d ${u.effective_status === 'trial' ? 'trial left' : 'left'}`
                                  : `${Math.abs(u.days_left)}d ago`}
                              </span>
                            )}
                          </>
                        )
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </motion.tr>
                ))}
                {users.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">
                      No users match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Joins <code>profiles</code> with <code>auth.users</code> via the service role. Status is
          &ldquo;effective&rdquo; — a row with <code>plan_status=&apos;active&apos;</code> but a past{' '}
          <code>plan_expires_at</code> shows as <em>Expired</em>. To change someone&apos;s plan, edit
          the profile row in Supabase SQL Editor or process a fresh payment via{' '}
          <Link href="/admin/payments" className="text-primary font-semibold">/admin/payments</Link>.
        </p>
      </div>
    </div>
  )
}
