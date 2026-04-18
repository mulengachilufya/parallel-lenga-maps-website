'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { X, Lock, ArrowRight, Star, Zap } from 'lucide-react'
import { supabase, PLAN_PRICING, type AccountType, type PlanTier } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DownloadUser {
  email: string
  plan: PlanTier
  accountType: AccountType
}

interface GateModal {
  type: 'signup' | 'upgrade'
  requiredTier: PlanTier
}

interface DownloadGateContextType {
  gateUser: DownloadUser | null
  gateLoading: boolean
  guardDownload: (requiredTier: PlanTier, fn: () => void) => void
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TIER_ORDER: Record<PlanTier, number> = { basic: 0, pro: 1, max: 2 }

const TIER_COLORS: Record<PlanTier, string> = {
  basic: '#1E5F8E',
  pro: '#F5B800',
  max: '#7c3aed',
}

const TIER_LABELS: Record<PlanTier, string> = {
  basic: 'Basic',
  pro: 'Pro',
  max: 'Max',
}

const TIER_DESCS: Record<PlanTier, string> = {
  basic: '4 datasets · 3 countries · 10 files/month',
  pro: '9 datasets · all 54 countries · 25 files/month',
  max: 'All 15+ datasets · 54 countries · unlimited downloads',
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function DownloadGateModal({ modal, onClose }: { modal: GateModal; onClose: () => void }) {
  const isSignup = modal.type === 'signup'
  const requiredLabel = TIER_LABELS[modal.requiredTier]
  const requiredColor = TIER_COLORS[modal.requiredTier]

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
              <Lock size={20} style={{ color: requiredColor }} />
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={17} />
            </button>
          </div>

          {isSignup ? (
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
                href="/pricing"
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
      .select('plan, account_type')
      .eq('id', userId)
      .single()
    setGateUser({
      email,
      plan: (profile?.plan || 'basic') as PlanTier,
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

  const guardDownload = (requiredTier: PlanTier, fn: () => void) => {
    if (!gateUser) {
      setModal({ type: 'signup', requiredTier })
      return
    }
    if (TIER_ORDER[gateUser.plan] < TIER_ORDER[requiredTier]) {
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
