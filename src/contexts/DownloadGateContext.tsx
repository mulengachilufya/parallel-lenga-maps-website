'use client'

import {
  createContext, useContext, useCallback,
  useEffect, useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import {
  FREE_DATASET_LIMIT, PLANS, PLAN_ORDER as TIERS, planCtaHref,
  type UserState, type DatasetSlug,
} from '@/lib/pricing'
import { DATASET_META } from '@/lib/teams'
import type { Access } from '@/lib/entitlements'
import Link from 'next/link'
import { track } from '@/lib/analytics'

// ─── Types ────────────────────────────────────────────────────
//
// A paid plan (individual or team) opens every dataset. A free account
// opens the 3 datasets it picked, plus its free team's 3. The server
// decides (GET /api/account/access); this context only mirrors it so the
// buttons know whether to download or explain.

interface GateUser {
  userState: UserState
  access:    Access
}

interface ModalState {
  open:          boolean
  /** 'paywall' = no active plan.
   *  'unavailable' = access GRANTED but the specific file has no R2 URL
   *  (file not in storage yet, signing failed, key missing). Different copy,
   *  no upsell — showing the paywall here was the production bug reported
   *  2026-06-18 where a Team-tier user clicked random rainfall rows and saw
   *  "Your free trial has ended". */
  kind:          'paywall' | 'unavailable'
  datasetSlug:   DatasetSlug | null
}

interface DownloadGateCtx {
  user:        GateUser | null
  loading:     boolean
  checkAccess: (slug: DatasetSlug) => boolean
  openGate:    (slug: DatasetSlug) => void
  /**
   * Call this when checkAccess() passed (user has access) but the specific
   * file row has no download_url — i.e. R2 signing failed or the file
   * hasn't been uploaded yet. Surfaces a "file not ready" modal instead of
   * the misleading "trial ended" paywall.
   */
  notifyUnavailable: (slug: DatasetSlug) => void
  /**
   * Server-side hop that decrements the trial download counter and returns
   * true iff the download should proceed. Always returns true for paid
   * accounts (the endpoint short-circuits). Returns false for: trial cap
   * reached, expired plan, anonymous. On false, the paywall is opened
   * automatically so call sites don't need to.
   */
  consumeDownload: (slug: DatasetSlug, country?: string) => Promise<boolean>
}

// ─── Context ──────────────────────────────────────────────────

const Ctx = createContext<DownloadGateCtx>({
  user: null, loading: true,
  checkAccess: () => false,
  openGate: () => {},
  notifyUnavailable: () => {},
  consumeDownload: async () => false,
})

export function useDownloadGate() { return useContext(Ctx) }

// ─── Provider ─────────────────────────────────────────────────

export default function DownloadGateProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<GateUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<ModalState>({ open: false, kind: 'paywall', datasetSlug: null })

  // Defensive load: wrapped in try/finally so setLoading(false) ALWAYS
  // runs. Each await is raced against a timeout that resolves to null on
  // expiry — a stalled refresh-token exchange (the classic returning-user
  // failure mode) can't keep the gate in `loading: true` forever and
  // silently break the download buttons.
  // PromiseLike (not Promise) so we can pass Supabase query builders
  // directly — they're thenable but not true Promises until awaited.
  const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> =>
    Promise.race<T | null>([
      p,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ])

  const load = useCallback(async () => {
    try {
      const sessionRes = await withTimeout(supabase.auth.getSession(), 5_000)
      const session = sessionRes?.data.session ?? null
      if (!session) { setUser(null); return }

      const res = await withTimeout(fetch('/api/account/access', { cache: 'no-store' }), 8_000)
      if (!res || !res.ok) { setUser(null); return }
      const access = await res.json() as Access
      setUser({ userState: access.state, access })
    } catch (err) {
      console.error('[gate] load failed:', err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()

    // Refresh on auth changes (sign-in / sign-out in any tab).
    //
    // CRITICAL: wipe state SYNCHRONOUSLY before the async load(). Without this,
    // signing out and back in (or switching between two accounts in the same
    // browser) leaves the previous account's `user` in context during the
    // re-fetch window. Buttons calling checkAccess() see the stale plan and
    // give the wrong answer — the exact "admin denied access to a dataset
    // because a test account didn't have it" production bug reported
    // 2026-06-18. Closing the gate by default (user=null, loading=true)
    // until load() finishes is always safer than serving stale entitlements.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setUser(null)
      setLoading(true)
      load()
    })

    // Refresh when the tab regains focus. Catches the case where a user
    // leaves a dashboard tab open while admin verifies their payment in
    // another tab, or while their trial ticks past expiry.
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load()
    })

    // Slow background poll for users who keep the tab focused for hours
    // (e.g., browsing through 54 countries). 5 minutes is the longest
    // anyone should be looking at stale gate state.
    const interval = setInterval(load, 5 * 60_000)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [load])

  function checkAccess(slug: DatasetSlug): boolean {
    if (!user) return false
    return user.access.paid || user.access.datasets.includes(slug)
  }

  function openGate(slug: DatasetSlug) {
    track('paywall_shown', { dataset: slug, user_state: user?.userState ?? 'anonymous' })
    setModal({ open: true, kind: 'paywall', datasetSlug: slug })
  }

  function notifyUnavailable(slug: DatasetSlug) {
    setModal({ open: true, kind: 'unavailable', datasetSlug: slug })
  }

  // consume-download re-checks the plan server-side and logs a
  // download_events row (team dashboard history). There is no cap.
  async function consumeDownload(slug: DatasetSlug, country?: string): Promise<boolean> {
    try {
      const res = await fetch('/api/usage/consume-download', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dataset: slug, country }),
      })
      if (res.ok) {
        load()
        return true
      }
      // 403 = plan not active / no access. Open the paywall.
      openGate(slug)
      return false
    } catch {
      // Network glitch — be permissive. The dataset API route would have
      // refused to attach a presigned URL anyway if the user truly lacks
      // access, so we won't accidentally serve gated data.
      return true
    }
  }

  return (
    <Ctx.Provider value={{ user, loading, checkAccess, openGate, notifyUnavailable, consumeDownload }}>
      {children}
      {modal.open && modal.kind === 'unavailable' && (
        <UnavailableModal
          onClose={() => setModal({ open: false, kind: 'paywall', datasetSlug: null })}
        />
      )}
      {modal.open && modal.kind === 'paywall' && (
        <PaywallModal
          user={user}
          slug={modal.datasetSlug}
          onClose={() => setModal({ open: false, kind: 'paywall', datasetSlug: null })}
        />
      )}
    </Ctx.Provider>
  )
}

// ─── Unavailable modal ────────────────────────────────────────
// Shown when the user HAS access but the specific file row has no
// download_url (R2 signing failed, file not uploaded yet, key missing).
// Brand-consistent with the Paywall modal but says nothing about plans —
// because plans aren't the problem.

function UnavailableModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-[#0D2B45] border border-blue-900/60 rounded-2xl max-w-md w-full p-7 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">This file isn&apos;t ready yet</h2>
            <p className="text-blue-300 text-sm">Your plan covers it, but the data isn&apos;t in our storage for this country right now.</p>
          </div>
          <button onClick={onClose} className="text-blue-500 hover:text-white transition-colors ml-3 text-xl leading-none">✕</button>
        </div>
        <div className="bg-[#112236] border border-blue-900/60 rounded-xl px-4 py-3.5 text-blue-200 text-[13px] leading-relaxed mb-5">
          We&apos;re still expanding country coverage. Other countries in this same
          dataset should work — try a neighbouring one, or email{' '}
          <a href="mailto:lengamaps@gmail.com" className="text-[#F5B800] hover:underline">
            lengamaps@gmail.com
          </a>{' '}
          and we&apos;ll prioritise this one.
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="bg-[#F5B800] hover:bg-[#FFC940] text-[#0D2B45] text-sm font-bold px-5 py-2.5 rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Paywall modal ────────────────────────────────────────────

const datasetName = (slug: string) => DATASET_META[slug as DatasetSlug]?.name ?? slug

/**
 * The free-plan part of the paywall: pick this dataset as one of your 3,
 * or see which 3 you already have. Signed-out visitors are sent to sign up.
 */
function FreePick({ user, slug }: { user: GateUser | null; slug: DatasetSlug | null }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirming, setConfirming] = useState(false)
  if (!slug) return null
  const name = datasetName(slug)

  if (!user) {
    return (
      <div className="bg-[#112236] border border-[#F5B800]/40 rounded-xl p-4 mb-5">
        <p className="text-white text-sm font-semibold">Free: choose {FREE_DATASET_LIMIT} datasets and keep them</p>
        <p className="text-blue-300 text-xs mt-1">Create a free account, pick {name} and two more, and download them for every country.</p>
        <Link href="/signup" className="mt-3 inline-block bg-[#F5B800] text-[#0D2B45] text-xs font-bold px-4 py-2 rounded-lg">Sign up free</Link>
      </div>
    )
  }
  const { personal } = user.access
  const picks = personal.picks
  if (personal.left <= 0) {
    return (
      <div className="bg-[#112236] border border-blue-900/60 rounded-xl p-4 mb-5">
        <p className="text-white text-sm font-semibold">You have used your {FREE_DATASET_LIMIT} free datasets</p>
        <p className="text-blue-300 text-xs mt-1">Your free datasets: {picks.map(datasetName).join(', ')}. They stay yours. Upgrade to add {name} and everything else.</p>
      </div>
    )
  }
  async function pick() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/account/free-datasets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasets: [slug] }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message || 'Could not save your choice')
      track('free_pick', { dataset: slug })
      window.location.reload()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save your choice'); setBusy(false) }
  }
  return (
    <div className="bg-[#112236] border border-[#F5B800]/50 rounded-xl p-4 mb-5">
      <p className="text-white text-sm font-semibold">Or make {name} one of your {FREE_DATASET_LIMIT} free datasets</p>
      <p className="text-blue-300 text-xs mt-1">
        You have {personal.left} of {FREE_DATASET_LIMIT} left{picks.length ? ` (you already have ${picks.map(datasetName).join(', ')})` : ''}.
        Once chosen, a free dataset is yours for every country, but it can&apos;t be swapped for another later.
      </p>
      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button disabled={busy} onClick={() => void pick()} className="bg-[#F5B800] text-[#0D2B45] text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-60">
            {busy ? 'Saving…' : `Yes, keep ${name} for good`}
          </button>
          <button onClick={() => setConfirming(false)} className="text-blue-300 text-xs">Not now</button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="mt-3 bg-[#F5B800] text-[#0D2B45] text-xs font-bold px-4 py-2 rounded-lg">
          Choose {name} for free
        </button>
      )}
      {err && <p className="text-red-300 text-xs mt-2">{err}</p>}
    </div>
  )
}

function PaywallModal({ onClose, user, slug }: { onClose: () => void; user: GateUser | null; slug: DatasetSlug | null }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 overflow-y-auto py-6">
      <div className="bg-[#0D2B45] border border-blue-900/60 rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Get full access</h2>
            <p className="text-blue-300 text-sm">
              Every dataset, every country, for 3 months. Nothing renews automatically.
            </p>
          </div>
          <button onClick={onClose} className="text-blue-500 hover:text-white transition-colors ml-4 text-xl leading-none">✕</button>
        </div>

        <FreePick user={user} slug={slug} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {TIERS.map((slug) => {
            const plan = PLANS[slug]
            return (
              <Link
                key={slug}
                href={planCtaHref(slug)}
                onClick={() => {
                  track('paywall_cta_clicked', { plan: slug })
                  onClose()
                }}
                className="block rounded-xl border border-blue-900/60 bg-[#112236] p-4 text-center transition-colors hover:border-[#F5B800]/60 group"
              >
                <p className="text-white font-semibold text-sm mb-1">{plan.name}</p>
                <p className="text-2xl font-bold text-white group-hover:text-[#F5B800] transition-colors">{plan.priceLabel}</p>
                <div className="mt-3 pt-3 border-t border-blue-900/40 text-left space-y-1">
                  <p className="text-blue-300 text-xs">All 15 datasets, all 54 countries</p>
                  <p className="text-blue-300 text-xs">3 months, unlimited downloads</p>
                  {slug === 'team' && <p className="text-blue-300 text-xs">Up to 4 or 12 seats</p>}
                </div>
                <div className="mt-3 bg-[#1E5F8E] group-hover:bg-[#F5B800] group-hover:text-[#0D2B45] text-white text-xs font-semibold py-2 rounded-lg transition-colors">
                  {plan.ctaLabel}
                </div>
              </Link>
            )
          })}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-blue-500 text-xs">
            Pay by bank transfer. Account activated within 24 hours.
          </p>
          <button onClick={onClose} className="text-blue-400 hover:text-white text-sm transition-colors">
            Browse only
          </button>
        </div>
      </div>
    </div>
  )
}