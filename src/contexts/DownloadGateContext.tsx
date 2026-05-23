'use client'

import {
  createContext, useContext, useCallback,
  useEffect, useRef, useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import {
  getUserState, canAccessFiles, DATASET_MIN_TIER, PLAN_ORDER,
  PLANS, PLAN_ORDER as TIERS, getTierLabel,
  type UserState, type TierSlug, type DatasetSlug,
} from '@/lib/pricing'
import Link from 'next/link'

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
}

// ─── Context ──────────────────────────────────────────────────

const Ctx = createContext<DownloadGateCtx>({
  user: null, loading: true,
  checkAccess: () => false,
  openGate: () => {},
})

export function useDownloadGate() { return useContext(Ctx) }

// ─── Provider ─────────────────────────────────────────────────

export default function DownloadGateProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<GateUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<ModalState>({ open: false, requiredTier: 'starter', datasetSlug: null })

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUser(null); setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, plan_status, plan_expires_at, trial_started_at')
      .eq('id', session.user.id)
      .single()

    if (!profile) { setUser(null); setLoading(false); return }

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
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => load())
    return () => subscription.unsubscribe()
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
    setModal({ open: true, requiredTier, datasetSlug: slug })
  }

  return (
    <Ctx.Provider value={{ user, loading, checkAccess, openGate }}>
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
                href={`/manual-payment?plan=${slug}`}
                onClick={onClose}
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
