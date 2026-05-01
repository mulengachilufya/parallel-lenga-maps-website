'use client'

/**
 * /dashboard/api-keys
 *
 * Business+API users come here to mint, copy, label, and revoke their bearer
 * tokens. Plaintext is shown ONCE on creation in a green callout — they
 * can't get it back.
 *
 * Hidden / soft-blocked for non-Business users; the API itself enforces the
 * gate, but we don't want to show a blank generator either.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, KeyRound, Copy, CheckCircle2, AlertTriangle, Trash2, Loader2, BookOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface ApiKeySummary {
  id:                       string
  label:                    string
  key_last4:                string
  scopes:                   string[]
  last_used_at:             string | null
  requests_this_month:      number
  egress_bytes_this_month:  number
  created_at:               string
  revoked_at:               string | null
}

const QUOTA_REQUESTS = 5_000
const QUOTA_EGRESS_GB = 50

export default function ApiKeysPage() {
  const [loading,    setLoading]    = useState(true)
  const [eligible,   setEligible]   = useState(false)
  const [eligReason, setEligReason] = useState<string>('')
  const [keys,       setKeys]       = useState<ApiKeySummary[]>([])

  // New-key flow state
  const [newLabel,        setNewLabel]        = useState('')
  const [creating,        setCreating]        = useState(false)
  const [createError,     setCreateError]     = useState('')
  const [revealedKey,     setRevealedKey]     = useState<string | null>(null)
  const [copied,          setCopied]          = useState(false)

  // Fetch keys + check eligibility on mount
  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/account/api-keys', { cache: 'no-store' })
      if (res.status === 401) {
        setEligible(false); setEligReason('signin'); return
      }
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}))
        setEligible(false)
        setEligReason(j.error ?? 'business_only')
        return
      }
      if (!res.ok) throw new Error('list failed')
      const j = await res.json()
      setEligible(true)
      setKeys(j.keys ?? [])
    } catch {
      setEligible(false); setEligReason('error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    setCreateError('')
    if (!newLabel.trim()) { setCreateError('Add a label so you remember what this key is for.'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/account/api-keys', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ label: newLabel.trim() }),
      })
      const j = await res.json()
      if (!res.ok) { setCreateError(j.message ?? 'Failed to create key.'); return }
      setRevealedKey(j.plaintext)
      setNewLabel('')
      // Refresh the list (the new key shows up in the table too — minus the plaintext).
      refresh()
    } catch {
      setCreateError('Network error — try again.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this key? Any scripts using it will start getting 401s within seconds.')) return
    const res = await fetch(`/api/account/api-keys/${id}`, { method: 'DELETE' })
    if (res.ok) refresh()
  }

  // ── Loading / ineligible states ────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    )
  }

  if (!eligible) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors mb-6">
            <ArrowLeft size={16} /> Back to dashboard
          </Link>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <KeyRound className="text-amber-600" size={22} />
            </div>
            <h1 className="text-2xl font-black text-navy mb-2">API access is on the Business — On-site tier</h1>
            <p className="text-gray-500 max-w-lg mx-auto mb-6 text-sm leading-relaxed">
              {eligReason === 'signin'             && "Sign in with a Business — On-site account to mint API keys."}
              {eligReason === 'business_only'      && "Switch to a Business account to use the REST API. Email lengamaps@gmail.com to upgrade."}
              {eligReason === 'api_tier_required'  && "Your Business plan is the dashboard-only $75 tier. Upgrade to Business — On-site ($225/mo) for REST API access. Email lengamaps@gmail.com."}
              {eligReason === 'plan_inactive'      && "Your Business — On-site plan isn't active yet — finish payment to unlock API keys."}
              {eligReason === 'plan_expired'       && "Your Business — On-site plan has expired. Renew to keep API access."}
              {eligReason === 'error'              && "We couldn't verify your account just now. Refresh and try again."}
            </p>
            <Link href="/pricing" className="inline-flex items-center gap-2 bg-accent text-navy text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-yellow-400 transition-colors">
              See Business pricing
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Main UI ────────────────────────────────────────────────────────────
  const activeKeys = keys.filter((k) => !k.revoked_at)
  const revokedKeys = keys.filter((k) => k.revoked_at)

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors mb-6">
          <ArrowLeft size={16} /> Back to dashboard
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-navy flex items-center gap-3">
              <KeyRound className="text-primary" size={28} />
              API keys
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Long-lived bearer tokens for the Lenga Maps REST API. Use them in scripts, ETL jobs, and CI.
            </p>
          </div>
          <Link
            href="/docs/api"
            className="inline-flex items-center gap-2 bg-white border border-gray-200 text-sm text-navy font-semibold px-4 py-2 rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <BookOpen size={16} /> Read the API docs
          </Link>
        </div>

        {/* Quotas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Per-key quota</p>
            <p className="mt-1 text-2xl font-black text-navy">{QUOTA_REQUESTS.toLocaleString()} <span className="text-sm font-medium text-gray-400">requests / month</span></p>
            <p className="text-xs text-gray-400 mt-1">Hit the cap and the API returns 429 — email us for higher limits.</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Per-key egress</p>
            <p className="mt-1 text-2xl font-black text-navy">{QUOTA_EGRESS_GB} GB <span className="text-sm font-medium text-gray-400">/ month</span></p>
            <p className="text-xs text-gray-400 mt-1">Counted as the size of every file we sign for you.</p>
          </div>
        </div>

        {/* Create new key */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-navy mb-1">Generate a new key</h2>
          <p className="text-xs text-gray-500 mb-4">Label it so you can recognise it later (e.g. &ldquo;Production scraper&rdquo;).</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Production scraper"
              maxLength={100}
              className="flex-1 border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {creating ? 'Generating…' : 'Generate key'}
            </button>
          </div>
          {createError && (
            <div className="mt-3 flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertTriangle size={15} /> {createError}
            </div>
          )}
        </div>

        {/* One-time reveal */}
        <AnimatePresence>
          {revealedKey && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-3">
                  <CheckCircle2 className="text-emerald-700 mt-0.5 shrink-0" size={20} />
                  <div>
                    <h3 className="font-bold text-emerald-900">Copy your key now — this is the only time you&apos;ll see it.</h3>
                    <p className="text-xs text-emerald-800 mt-0.5">We store only a hash. If you lose it, revoke it and generate a new one.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-xs font-mono text-navy break-all">{revealedKey}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(revealedKey).then(() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                      })
                    }}
                    className="shrink-0 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
                  >
                    {copied ? <><CheckCircle2 size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                  </button>
                </div>
                <button onClick={() => setRevealedKey(null)} className="mt-3 text-xs text-emerald-800 hover:underline">
                  I&apos;ve saved it — dismiss this banner
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active keys */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-navy">Active keys ({activeKeys.length})</h2>
          </div>
          {activeKeys.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-500">No active keys yet. Generate one above to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {activeKeys.map((k) => (
                <KeyRow key={k.id} k={k} onRevoke={handleRevoke} />
              ))}
            </div>
          )}
        </div>

        {/* Revoked keys */}
        {revokedKeys.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-navy transition-colors py-2">
              Revoked keys ({revokedKeys.length})
            </summary>
            <div className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-100">
                {revokedKeys.map((k) => (
                  <KeyRow key={k.id} k={k} onRevoke={handleRevoke} />
                ))}
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

function KeyRow({ k, onRevoke }: { k: ApiKeySummary; onRevoke: (id: string) => void }) {
  const reqPct  = Math.min(100, Math.round((k.requests_this_month / QUOTA_REQUESTS) * 100))
  const egressGb = k.egress_bytes_this_month / (1024 ** 3)
  const egressPct = Math.min(100, Math.round((egressGb / QUOTA_EGRESS_GB) * 100))

  return (
    <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-navy truncate">{k.label}</p>
          {k.revoked_at && <span className="text-[10px] uppercase tracking-wider bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded">Revoked</span>}
        </div>
        <p className="text-xs text-gray-400 font-mono mt-0.5">lm_live_…{k.key_last4}</p>
        <p className="text-xs text-gray-400 mt-1">
          Created {new Date(k.created_at).toLocaleDateString()}
          {k.last_used_at && <> · last used {new Date(k.last_used_at).toLocaleDateString()}</>}
          {!k.last_used_at && <> · never used</>}
        </p>
      </div>

      <div className="hidden md:block w-48 shrink-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Requests</p>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${reqPct > 80 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${reqPct}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">{k.requests_this_month.toLocaleString()} / {QUOTA_REQUESTS.toLocaleString()}</p>
      </div>

      <div className="hidden md:block w-48 shrink-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Egress</p>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${egressPct > 80 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${egressPct}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">{egressGb.toFixed(2)} GB / {QUOTA_EGRESS_GB} GB</p>
      </div>

      {!k.revoked_at && (
        <button
          onClick={() => onRevoke(k.id)}
          className="shrink-0 text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Trash2 size={13} /> Revoke
        </button>
      )}
    </div>
  )
}

function DashboardHeader() {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user.email ?? null)
    })
  }, [])
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/images/branding/logo.png" alt="Lenga Maps" width={36} height={36} className="object-contain" />
          <span className="font-bold text-navy">LENGA <span className="text-accent">MAPS</span></span>
        </Link>
        {email && <div className="text-sm text-gray-600 hidden sm:block">{email}</div>}
      </div>
    </header>
  )
}
