'use client'

import {
  createContext, useContext, useCallback,
  useEffect, useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import {
  getUserState, DATASET_MIN_TIER, PLAN_ORDER,
  PLANS, PLAN_ORDER as TIERS, getTierLabel,
  type UserState, type TierSlug, type DatasetSlug,
} from '@/lib/pricing'
import Link from 'next/link'
import { track } from '@/lib/analytics'

// ─── Types ────────────────────────────────────────────────────

interface GateUser {
  plan:            TierSlug | null
  planStatus:      string
  planExpiresAt:   string | null
  trialStartedAt:  string | null
  userState:       UserState
}

interface ModalState {
  open:          boolean
  requiredTier:  TierSlug
  datasetSlug:   DatasetSlug | null
}

interface DownloadGateCtx {
  user:        GateUser | null
  loading:     boolean
  checkAccess: (slug: DatasetSlug) => boolean
  openGate:    (slug: DatasetSlug) => void
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
  consumeDownload: async () => false,
})

export function useDownloadGate() { return useContext(Ctx) }

// ─── Provider ─────────────────────────────────────────────────

export default function DownloadGateProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<GateUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<ModalState>({ open: false, requiredTier: 'starter', datasetSlug: null })

  // Defensive load: wrapped in try/finally so setLoading(false) ALWAYS
  // runs. Profile query gets a 6 s race so a stalled refresh-token
  // exchange (the classic returning-user failure mode) can't keep the
  // gate in `loading: true` forever and silently break the download
  // buttons.
  const load = useCallback(async () => {
    try {
      const sessionRes = await Promise.race([
        supabase.auth.getSession(),
        new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } } as Awaited<ReturnType<typeof supabase.auth.getSession>>), 5_000),
        ),
      ])
      const session = sessionRes.data.session
      if (!session) { setUser(null); return }

      const profileRes = await Promise.race([
        supabase
          .from('profiles')
          .select('plan, plan_status, plan_expires_at, trial_started_at')
          .eq('id', session.user.id)
          .single(),
        new Promise<{ data: null }>((resolve) =>
          setTimeout(() => resolve({ data: null }), 6_000),
        ),
      ])
      const profile = profileRes.data

      if (!profile) { setUser(null); return }

      const userState = getUserState(
        profile.plan,
        profile.trial_started_at,
        profile.plan_status,
      )

      setUser({
        plan:           profile.plan as TierSlug | null,
        planStatus:     profile.plan_status,
        planExpiresAt:  profile.plan_expires_at,
        trialStartedAt: profile.trial_started_at,
        userState,
      })
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => load())

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
    const { userState } = user
    if (userState === 'free_trial') return true
    if (userState === 'free' || !user.plan) return false
    return PLAN_ORDER.indexOf(user.plan) >= PLAN_ORDER.indexOf(DATASET_MIN_TIER[slug])
  }

  function openGate(slug: DatasetSlug) {
    const requiredTier = DATASET_MIN_TIER[slug]
    track('paywall_shown', {
      dataset: slug,
      required_tier: requiredTier,
      user_state: user?.userState ?? 'anonymous',
    })
    setModal({ open: true, requiredTier, datasetSlug: slug })
  }

  async function consumeDownload(slug: DatasetSlug, country?: string): Promise<boolean> {
    try {
      const res = await fetch('/api/usage/consume-download', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dataset: slug, country }),
      })
      if (res.ok) {
        // Refresh local state so the trial banner's remaining-count is
        // accurate after the next render.
        load()
        return true
      }
      // 403 with reason=trial_cap_reached, plan_expired, or no_access.
      // Open the paywall so the user sees a CTA instead of a silent fail.
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
    <Ctx.Provider value={{ user, loading, checkAccess, openGate, consumeDownload }}>
      {children}
      {modal.open && (
        <PaywallModal
          requiredTier={modal.requiredTier}
          userState={user?.userState ?? 'free'}
          onClose={() => setModal({ open: false, requiredTier: 'starter', datasetSlug: null })}
        />
      )}
    </Ctx.Provider>
  )
}

// ─── Paywall modal ────────────────────────────────────────────

function PaywallModal({
  requiredTier,
  userState,
  onClose,
}: {
  requiredTier: TierSlug
  userState:    UserState
  onClose:      () => void
}) {
  const isExpired = userState === 'free'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-[#0D2B45] border border-blue-900/60 rounded-2xl max-w-2xl w-full p-8 shadow-2xl">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              {isExpired ? 'Your free trial has ended' : 'This dataset requires a paid plan'}
            </h2>
            <p className="text-blue-300 text-sm">
              {isExpired
                ? 'Choose a plan to keep accessing your datasets.'
                : `This dataset is available on the ${getTierLabel(requiredTier)} plan and above.`}
            </p>
          </div>
          <button onClick={onClose} className="text-blue-500 hover:text-white transition-colors ml-4 text-xl leading-none">✕</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {TIERS.map((slug) => {
            const plan = PLANS[slug]
            const isRequired = slug === requiredTier
            return (
              <Link
                key={slug}
                href={`/dashboard/payment?plan=${slug}`}
                onClick={() => {
                  track('paywall_cta_clicked', { plan: slug, required_tier: requiredTier })
                  onClose()
                }}
                className={`block rounded-xl border p-4 text-center transition-colors hover:border-[#F5B800]/60 group ${
                  isRequired
                    ? 'border-[#F5B800]/50 bg-[#1a3a5c]'
                    : 'border-blue-900/60 bg-[#112236]'
                }`}
              >
                {isRequired && (
                  <p className="text-[#F5B800] text-xs font-bold uppercase tracking-wide mb-2">Required</p>
                )}
                <p className="text-white font-semibold text-sm mb-1">{plan.name}</p>
                <p className="text-2xl font-bold text-white group-hover:text-[#F5B800] transition-colors">{plan.priceLabel}</p>
                <p className="text-blue-400 text-xs">/month</p>
                <div className="mt-3 pt-3 border-t border-blue-900/40 text-left space-y-1">
                  <p className="text-blue-300 text-xs">
                    {plan.datasetCount === -1 ? 'All datasets' : `${plan.datasetCount} datasets`}
                  </p>
                  <p className="text-blue-300 text-xs">
                    {plan.downloadLimit === -1 ? 'Unlimited downloads' : `${plan.downloadLimit}/mo`}
                  </p>
                  {plan.apiAccess && <p className="text-blue-300 text-xs">API access</p>}
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
            Pay by bank transfer or mobile money. Account activated within 24 hours.
          </p>
          <button onClick={onClose} className="text-blue-400 hover:text-white text-sm transition-colors">
            Browse only
          </button>
        </div>
      </div>
    </div>
  )
}
