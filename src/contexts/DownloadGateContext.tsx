'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { X, Lock, ArrowRight, Star, Zap, CreditCard, Clock } from 'lucide-react'
import { supabase, PLAN_PRICING, isPlanActive, canAccessDatasetTier, type AccountType, type DatasetTier, type PlanTier, type PlanStatus } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DownloadUser {
  email: string
  plan: PlanTier
  planStatus: PlanStatus
  planExpiresAt: string | null
  accountType: AccountType
}

// Three gate branches (cascade):
//   'signup'  — no session at all → sign in / create free account
//   'pay'     — logged in but plan not currently active → activate/renew their plan
//               (covers: plan_status='free', plan_status='pending', or plan_status='active'
//                but plan_expires_at has passed)
//   'upgrade' — active but current plan tier < required tier → upgrade to higher plan
type PayReason = 'free' | 'pending' | 'expired'

interface GateModal {
  type: 'signup' | 'pay' | 'upgrade'
  requiredTier: DatasetTier
  currentPlan?: PlanTier    // for 'pay' — the plan they originally selected
  payReason?: PayReason     // for 'pay' — which sub-state we're in
}

interface DownloadGateContextType {
  gateUser: DownloadUser | null
  gateLoading: boolean
  /** Required tier comes from the dataset, not the user. Same values as
   *  PlanTier ('basic' | 'pro' | 'max') but means "what plan does this
   *  file require". */
  guardDownload: (requiredTier: DatasetTier, fn: () => void) => void
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<DatasetTier, string> = {
  basic: '#1E5F8E',
  pro: '#F5B800',
  max: '#7c3aed',
}

const TIER_LABELS: Record<DatasetTier, string> = {
  basic: 'Basic',
  pro: 'Pro',
  max: 'Max',
}

// Counts match the canonical tier model (see DATASETS in lib/supabase).
const TIER_DESCS: Record<DatasetTier, string> = {
  basic: '4 datasets · 3 countries · 10 files/month',
  pro:   '8 datasets · all 54 countries · 25 files/month',
  max:   'All 12+ datasets · 54 countries · unlimited downloads',
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function DownloadGateModal({ modal, onClose }: { modal: GateModal; onClose: () => void }) {
  const requiredLabel = TIER_LABELS[modal.requiredTier]
  const requiredColor = TIER_COLORS[modal.requiredTier]
  const isPending = modal.type === 'pay' && modal.payReason === 'pending'
  const isExpired = modal.type === 'pay' && modal.payReason === 'expired'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* colour bar */}
        <div className="h-1.5 w-full" style={{ backgroundColor: requiredColor }} />

        <div className="p-6">
          {/* icon + close */}
          <div className="flex items-start justify-between mb-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${requiredColor}18` }}
            >
              {modal.type === 'pay'
                ? (isPending
                    ? <Clock size={20} style={{ color: requiredColor }} />
                    : <CreditCard size={20} style={{ color: requiredColor }} />)
                : <Lock size={20} style={{ color: requiredColor }} />}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={17} />
            </button>
          </div>

          {modal.type === 'signup' ? (
            /* ── SIGN UP GATE ─────────────────────────────────────────────── */
            <>
              <h2 className="text-xl font-black text-navy mb-1">Sign in to download</h2>
              <p className="text-gray-500 text-sm mb-5">
                Create a free account to start downloading GIS data for Africa.
              </p>

              <div className="space-y-2 mb-5">
                {(['basic', 'pro', 'max'] as PlanTier[]).map((tier) => {
                  const price = PLAN_PRICING.student[tier]
                  const isRecommended = tier === modal.requiredTier
                  return (
                    <Link
                      key={tier}
                      href={`/signup?plan=${tier}`}
                      onClick={onClose}
                      className="flex items-center justify-between px-3.5 py-3 rounded-xl border-2 transition-all hover:shadow-md hover:-translate-y-0.5"
                      style={{
                        borderColor: isRecommended ? requiredColor : '#e5e7eb',
                        backgroundColor: isRecommended ? `${requiredColor}08` : 'white',
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-navy text-sm">{TIER_LABELS[tier]}</span>
                          {isRecommended && (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-tight"
                              style={{ backgroundColor: requiredColor }}
                            >
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{TIER_DESCS[tier]}</p>
                      </div>
                      <div className="text-right ml-3 shrink-0">
                        {price?.zmw && (
                          <div className="font-black text-sm leading-none" style={{ color: TIER_COLORS[tier] }}>
                            K{price.zmw}
                            <span className="text-[10px] font-normal text-gray-400">/mo</span>
                          </div>
                        )}
                        {price?.usd && (
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            ${price.usd}
                            <span className="text-[9px] text-gray-400">/mo</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>

              <Link
                href="/signup"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-primary text-white hover:bg-navy transition-all hover:shadow-md"
              >
                Create Free Account <ArrowRight size={14} />
              </Link>
              <p className="text-center text-xs text-gray-400 mt-3">
                Already have an account?{' '}
                <Link href="/login" onClick={onClose} className="text-primary font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          ) : modal.type === 'pay' ? (
            /* ── PAY / ACTIVATE GATE ──────────────────────────────────────── */
            <>
              <h2 className="text-xl font-black text-navy mb-1">
                {isPending
                  ? 'Payment under review'
                  : isExpired
                    ? 'Your plan has expired'
                    : 'Activate your plan to download'}
              </h2>
              <p className="text-gray-500 text-sm mb-5">
                {isPending
                  ? 'Your payment is being verified. You\u2019ll get download access as soon as we confirm it (usually within a few hours).'
                  : isExpired
                    ? 'Your monthly access period has ended. Renew your plan below to keep downloading — it\u2019s the same quick MTN / Airtel flow.'
                    : 'You have an account, but no active plan yet. Choose and pay for a plan to start downloading.'}
              </p>

              {!isPending && (
                <div className="space-y-2 mb-5">
                  {(['basic', 'pro', 'max'] as PlanTier[]).map((tier) => {
                    const price = PLAN_PRICING.student[tier]
                    const isRecommended = tier === modal.requiredTier
                    return (
                      <Link
                        key={tier}
                        href={`/dashboard/payment?plan=${tier}`}
                        onClick={onClose}
                        className="flex items-center justify-between px-3.5 py-3 rounded-xl border-2 transition-all hover:shadow-md hover:-translate-y-0.5"
                        style={{
                          borderColor: isRecommended ? requiredColor : '#e5e7eb',
                          backgroundColor: isRecommended ? `${requiredColor}08` : 'white',
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-navy text-sm">{TIER_LABELS[tier]}</span>
                            {isRecommended && (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-tight"
                                style={{ backgroundColor: requiredColor }}
                              >
                                Needed for this file
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{TIER_DESCS[tier]}</p>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          {price?.zmw && (
                            <div className="font-black text-sm leading-none" style={{ color: TIER_COLORS[tier] }}>
                              K{price.zmw}
                              <span className="text-[10px] font-normal text-gray-400">/mo</span>
                            </div>
                          )}
                          {price?.usd && (
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              ${price.usd}
                              <span className="text-[9px] text-gray-400">/mo</span>
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}

              {isPending ? (
                <Link
                  href="/dashboard"
                  onClick={onClose}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-primary text-white hover:bg-navy transition-all"
                >
                  Back to dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href={`/dashboard/payment?plan=${modal.requiredTier}`}
                    onClick={onClose}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
                    style={{ backgroundColor: requiredColor }}
                  >
                    Pay for {requiredLabel} <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/pricing"
                    onClick={onClose}
                    className="mt-2 w-full flex items-center justify-center py-2.5 rounded-xl font-medium text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Compare plans
                  </Link>
                </>
              )}
            </>
          ) : (
            /* ── UPGRADE GATE ─────────────────────────────────────────────── */
            <>
              <h2 className="text-xl font-black text-navy mb-1">
                {requiredLabel} plan required
              </h2>
              <p className="text-gray-500 text-sm mb-5">
                This dataset is only available on the{' '}
                <strong style={{ color: requiredColor }}>{requiredLabel}</strong> plan.
                Upgrade to unlock it and{' '}
                {modal.requiredTier === 'max' ? 'all other datasets' : 'more premium datasets'}.
              </p>

              <div
                className="p-4 rounded-xl border-2 mb-5"
                style={{ borderColor: requiredColor, backgroundColor: `${requiredColor}08` }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {modal.requiredTier === 'pro' ? (
                      <Star size={15} style={{ color: requiredColor }} fill={requiredColor} />
                    ) : (
                      <Zap size={15} style={{ color: requiredColor }} fill={requiredColor} />
                    )}
                    <span className="font-black text-navy">{requiredLabel}</span>
                  </div>
                  <div className="text-right">
                    {PLAN_PRICING.student[modal.requiredTier]?.zmw && (
                      <span className="font-black text-base leading-none" style={{ color: requiredColor }}>
                        K{PLAN_PRICING.student[modal.requiredTier]!.zmw}
                        <span className="text-xs font-normal text-gray-400">/mo</span>
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500">{TIER_DESCS[modal.requiredTier]}</p>
              </div>

              <Link
                href={`/dashboard/payment?plan=${modal.requiredTier}`}
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
                style={{ backgroundColor: requiredColor }}
              >
                Upgrade to {requiredLabel} <ArrowRight size={14} />
              </Link>
              <Link
                href="/pricing"
                onClick={onClose}
                className="mt-2 w-full flex items-center justify-center py-2.5 rounded-xl font-medium text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                View all plans
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ── Context ────────────────────────────────────────────────────────────────────

const DownloadGateContext = createContext<DownloadGateContextType>({
  gateUser: null,
  gateLoading: true,
  guardDownload: () => {},
})

// ── Provider ───────────────────────────────────────────────────────────────────

export function DownloadGateProvider({ children }: { children: ReactNode }) {
  const [gateUser, setGateUser] = useState<DownloadUser | null>(null)
  const [gateLoading, setGateLoading] = useState(true)
  const [modal, setModal] = useState<GateModal | null>(null)

  const loadProfile = async (userId: string, email: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, plan_status, plan_expires_at, account_type')
      .eq('id', userId)
      .single()
    setGateUser({
      email,
      plan: (profile?.plan || 'basic') as PlanTier,
      // Default to 'free' if column is missing or empty — never silently grant access.
      planStatus: (profile?.plan_status || 'free') as PlanStatus,
      planExpiresAt: (profile?.plan_expires_at as string | null) ?? null,
      accountType: (profile?.account_type || 'student') as AccountType,
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadProfile(session.user.id, session.user.email || '')
      }
      setGateLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadProfile(session.user.id, session.user.email || '')
      } else {
        setGateUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const guardDownload = (requiredTier: DatasetTier, fn: () => void) => {
    // Cascade: no session → sign up / sign in
    if (!gateUser) {
      setModal({ type: 'signup', requiredTier })
      return
    }
    // Pay gate covers three sub-states (never paid, pending review, expired).
    const active = isPlanActive(gateUser.planStatus, gateUser.planExpiresAt)
    if (!active) {
      let payReason: PayReason = 'free'
      if (gateUser.planStatus === 'pending') {
        payReason = 'pending'
      } else if (
        gateUser.planStatus === 'active' &&
        gateUser.planExpiresAt &&
        new Date(gateUser.planExpiresAt).getTime() <= Date.now()
      ) {
        payReason = 'expired'
      }
      setModal({
        type: 'pay',
        requiredTier,
        currentPlan: gateUser.plan,
        payReason,
      })
      return
    }
    // Active plan but insufficient tier for this file → upgrade modal.
    // canAccessDatasetTier handles the three-tier ladder AND the Business
    // override (Business at any plan = full max-equivalent access). Single
    // call, no manual rank checks.
    if (!canAccessDatasetTier(gateUser.plan, gateUser.accountType, requiredTier)) {
      setModal({ type: 'upgrade', requiredTier })
      return
    }
    fn()
  }

  return (
    <DownloadGateContext.Provider value={{ gateUser, gateLoading, guardDownload }}>
      {children}
      <AnimatePresence>
        {modal && <DownloadGateModal modal={modal} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </DownloadGateContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useDownloadGate() {
  return useContext(DownloadGateContext)
}
