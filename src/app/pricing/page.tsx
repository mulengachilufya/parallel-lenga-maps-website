'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, Download, ArrowRight, ShieldCheck, Star, GraduationCap, Briefcase, Building2, Copy } from 'lucide-react'
import { MtnBadge, AirtelBadge } from '@/components/PaymentProviderIcons'
import Footer from '@/components/Footer'
import { supabase, PLAN_PRICING, type AccountType, type PlanPrice } from '@/lib/supabase'

// Real mobile-money destinations — kept in sync with ManualPaymentFlow.tsx.
// These are shown publicly on the pricing page so customers can see exactly
// who / what number they'll be sending to before they even sign up.
const MTN_NUMBER    = '+260 965 699 359'
const AIRTEL_NUMBER = '+260 779 187 025'
const RECEIVER_NAME = 'Mulenga Chilufya'

type FeatureItem = string | { main: string; subs: string[] }

type PlanDef = {
  id: 'basic' | 'pro' | 'max'
  name: string
  tagline: string
  description: string
  color: string
  highlight: boolean
  features: FeatureItem[]
  cta: string
}

const basePlans: PlanDef[] = [
  {
    id: 'basic',
    name: 'Basic',
    tagline: 'Starter',
    description: 'Core African spatial data for your everyday mapping needs.',
    color: '#1E5F8E',
    highlight: false,
    features: [
      '3 countries of your choice',
      {
        main: '4 core datasets included',
        subs: [
          'Administrative Boundaries',
          'River Networks & Watersheds',
          'Rainfall Data',
          'Temperature Data',
        ],
      },
      'Shapefile & GeoJSON formats',
      'Standard resolution data',
      'Email support',
      'Download up to 10 files/month',
    ],
    cta: 'Get Basic Access',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Most Popular',
    description: 'Access to 9 datasets across all 54 countries.',
    color: '#F5B800',
    highlight: true,
    features: [
      'All 54 African countries',
      {
        main: '9 datasets included',
        subs: [
          'Admin Boundaries, Rivers, Lakes',
          'LULC, Rainfall, Temperature',
          'Drought Index (SPI-12), Aquifers, Population',
        ],
      },
      'Watersheds (HydroBASINS) — coming soon',
      'All formats: Shapefile, GeoJSON, GeoTIFF, KML',
      'Highest available resolution',
      'Priority email & WhatsApp support',
      '25 file downloads/month',
      'New datasets as they launch',
    ],
    cta: 'Get Pro Access',
  },
  {
    id: 'max',
    name: 'Max',
    tagline: 'Maximum Power',
    description: 'Every dataset, every country, unlimited downloads, commercial rights.',
    color: '#7c3aed',
    highlight: false,
    features: [
      'All 54 African countries',
      'All 9 Pro datasets',
      'All formats: Shapefile, GeoJSON, GeoTIFF, KML',
      'Highest available resolution',
      'Commercial use licence included',
      'Bulk & batch download tools',
      'Unlimited file downloads',
      'Priority data request queue',
      'Dedicated WhatsApp support line',
      'Early access to new datasets',
    ],
    cta: 'Get Max Access',
  },
]

// Two business sub-tiers. Both include 3 team seats and everything in Max.
//   · Business ($75) — manual dashboard access, no programmatic API
//   · Business — On-site ($225) — adds REST API + up to 2 on-site visits/year
//     (client covers travel + expenses)
type BusinessPlanDef = {
  id: 'basic' | 'pro'
  name: string
  tagline: string
  description: string
  highlight: boolean
  features: string[]
  price: number
  cta: string
}

const businessPlans: BusinessPlanDef[] = [
  {
    id: 'basic',
    name: 'Business',
    tagline: 'For Teams',
    description:
      'Complete GIS data access for commercial operations, development firms, and enterprise teams.',
    highlight: false,
    features: [
      'Everything in Max',
      'Up to 3 team seats',
      'Commercial redistribution rights',
      'Custom data extracts on request',
      'Dedicated account manager',
      'Invoice & PO billing available',
      'SLA-backed data delivery',
    ],
    price: 75,
    cta: 'Contact Us to Subscribe',
  },
  {
    id: 'pro',
    name: 'Business — On-site',
    tagline: 'Premium',
    description:
      'Everything in Business, plus programmatic REST API access and engineering visits to your office.',
    highlight: true,
    features: [
      'Everything in Business',
      'REST API access (5,000 calls + 50 GB / month per key)',
      'Up to 2 on-site engineering visits/year (you cover travel & expenses)',
      'Custom integration support',
      'Priority WhatsApp & email queue',
      'Reproducible data pulls for your CI / ETL',
    ],
    price: 225,
    cta: 'Contact Us to Subscribe',
  },
]

const accountTypes: {
  id: AccountType
  label: string
  blurb: string
  icon: React.ReactNode
  color: string
}[] = [
  {
    id: 'student',
    label: 'Student',
    blurb: 'Subsidised rates for researchers and students',
    icon: <GraduationCap size={22} />,
    color: '#15803d',
  },
  {
    id: 'professional',
    label: 'GIS Professional',
    blurb: 'Commercial rates for consultants, firms, and agencies',
    icon: <Briefcase size={22} />,
    color: '#1E5F8E',
  },
  {
    id: 'business',
    label: 'Business / Company',
    blurb: 'Enterprise pricing for teams and organisations',
    icon: <Building2 size={22} />,
    color: '#7c3aed',
  },
]

const paymentMethods = [
  {
    name: 'MTN Mobile Money',
    badge: <MtnBadge size={56} />,
    description: 'Pay via MTN MoMo — works from Zambia and any MTN country across Africa.',
  },
  {
    name: 'Airtel Money',
    badge: <AirtelBadge size={56} />,
    description: 'Pay via Airtel Money — cross-country transfers supported, no bank account needed.',
  },
]

// ── Copyable value pill used in the "How to pay" section ─────────────────────
function PayCopy({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2 last:mb-0">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className="text-base sm:text-lg font-black text-navy truncate select-all">{value}</div>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value.replace(/\s/g, ''))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch { /* clipboard blocked — user can long-press */ }
        }}
        className={`ml-3 shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
          copied ? 'bg-green-600 text-white' : 'bg-navy text-white hover:bg-primary'
        }`}
      >
        {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
      </button>
    </div>
  )
}

export default function PricingPage() {
  const [accountType, setAccountType] = useState<AccountType>('student')
  const [isSignedIn, setIsSignedIn] = useState(false)

  // Detect session so we can route the plan CTAs smartly:
  //   · signed in  → skip signup, go straight to /dashboard/payment?plan=X&type=Y
  //                  (that's where the MTN/Airtel numbers + instructions live)
  //   · signed out → /signup?plan=X&type=Y (preserves intent; user can still
  //                  skip to the free dashboard after signing up if they change
  //                  their mind — we don't force payment after signup)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsSignedIn(!!session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const planHref = (planId: 'basic' | 'pro' | 'max') =>
    isSignedIn
      ? `/dashboard/payment?plan=${planId}&type=${accountType}`
      : `/signup?plan=${planId}&type=${accountType}`

  // "How to pay" section region toggle — Zambian users dial *303# / *115#,
  // international users go through "Send money abroad" in their MoMo app.
  const [payRegion, setPayRegion] = useState<'zambian' | 'international'>('zambian')

  const isBusiness = accountType === 'business'
  const activeType = accountTypes.find((t) => t.id === accountType)!

  return (
    <>
      {/* ── HERO ── */}
      <section className="pt-32 pb-16 gradient-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block bg-accent/20 text-accent text-sm font-semibold px-4 py-2 rounded-full mb-6">
              Simple Pricing
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white mb-4">
              Download GIS Data for Africa
            </h1>
            <p className="text-blue-200 text-xl max-w-2xl mx-auto">
              Affordable plans built for African researchers, government agencies, and enterprises.
              Priced in Zambian Kwacha — USD shown for non-Zambians.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── PRICING CARDS ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Account type tabs */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex flex-wrap justify-center gap-2 bg-white rounded-2xl p-2 shadow-md border border-gray-200">
              {accountTypes.map((type) => {
                const isActive = accountType === type.id
                return (
                  <button
                    key={type.id}
                    onClick={() => setAccountType(type.id)}
                    style={isActive ? { backgroundColor: type.color, color: 'white' } : {}}
                    className={`flex items-center gap-2.5 px-7 py-4 rounded-xl text-base font-bold transition-all ${
                      isActive
                        ? 'shadow-lg scale-105'
                        : 'text-gray-500 hover:text-navy hover:bg-gray-50'
                    }`}
                  >
                    <span style={isActive ? { color: 'white' } : { color: type.color }}>
                      {type.icon}
                    </span>
                    {type.label}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="text-center text-gray-500 text-sm mb-10 -mt-4">
            {activeType.blurb}
          </p>

          {/* Business — two cards (manual + on-site/API) */}
          {isBusiness ? (
            <>
              <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto items-start">
                {businessPlans.map((plan, i) => (
                  <motion.div
                    key={`business-${plan.id}`}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.12 }}
                    className={`relative rounded-2xl overflow-hidden bg-white ${
                      plan.highlight
                        ? 'shadow-2xl ring-2 ring-purple-500'
                        : 'shadow-lg border border-gray-200'
                    }`}
                  >
                    {plan.highlight && (
                      <div className="bg-purple-600 text-white text-xs font-black uppercase tracking-widest text-center py-2.5 flex items-center justify-center gap-1.5">
                        <Building2 size={12} />
                        Most Premium
                        <Building2 size={12} />
                      </div>
                    )}
                    <div className="p-7">
                      <div className="flex items-start justify-between mb-5">
                        <div className="flex-1 pr-4">
                          <h2 className="text-2xl font-black text-navy">{plan.name}</h2>
                          <p className="text-gray-500 text-sm mt-1 leading-snug">{plan.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-3xl font-black text-purple-600">
                            ${plan.price}
                            <span className="text-base font-normal text-gray-400">/mo</span>
                          </div>
                          <div className="text-xs text-purple-500 font-semibold mt-1">
                            {plan.tagline}
                          </div>
                        </div>
                      </div>
                      <ul className="space-y-2.5 mb-7">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Check size={12} className="text-purple-600" strokeWidth={3} />
                            </div>
                            <span className="text-gray-700 text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        href={`/contact-us?subject=business-${plan.id}-plan`}
                        className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                          plan.highlight
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-navy text-white hover:bg-primary'
                        }`}
                      >
                        {plan.cta}
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </motion.div>
                ))}
              </div>
              <p className="text-center text-xs text-gray-500 mt-6 max-w-2xl mx-auto leading-relaxed">
                Both Business tiers include 3 team seats. The On-site tier is for organisations
                that want a Lenga Maps engineer in their office — travel and accommodation are
                billed back at cost (not included in the monthly fee).
              </p>
            </>
          ) : (
            /* Student / Professional — 3-column grid */
            <div className="grid md:grid-cols-3 gap-6 items-start">
              {basePlans.map((plan, i) => {
                const priceData = PLAN_PRICING[accountType]?.[plan.id] as PlanPrice | undefined
                return (
                  <motion.div
                    key={`${accountType}-${plan.id}`}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.12 }}
                    className={`relative rounded-2xl overflow-hidden ${
                      plan.highlight
                        ? 'shadow-2xl ring-2 ring-accent'
                        : 'shadow-lg border border-gray-200'
                    } bg-white`}
                  >
                    {plan.highlight && (
                      <div className="bg-accent text-navy text-xs font-black uppercase tracking-widest text-center py-2.5 flex items-center justify-center gap-1.5">
                        <Star size={12} fill="currentColor" />
                        Most Popular
                        <Star size={12} fill="currentColor" />
                      </div>
                    )}

                    <div className="p-7">
                      <div className="mb-5">
                        <h2 className="text-2xl font-black text-navy">{plan.name}</h2>
                        <p className="text-gray-500 text-sm mt-1 leading-snug">{plan.description}</p>
                      </div>

                      {/* Price display */}
                      <div className="mb-6 pb-5 border-b border-gray-100">
                        {priceData?.zmw && priceData.usd ? (
                          <div className="flex items-stretch gap-2">
                            {/* In Zambia — Kwacha */}
                            <div
                              className="relative flex-1 rounded-lg px-3 py-2 overflow-hidden"
                              style={{ backgroundColor: `${plan.color}15`, borderWidth: 1, borderStyle: 'solid', borderColor: `${plan.color}40` }}
                            >
                              <span className="absolute top-1 right-1.5 text-[11px] opacity-40 leading-none">🇿🇲</span>
                              <div className="text-[9px] font-bold uppercase tracking-wider opacity-70 mb-0.5" style={{ color: plan.color }}>
                                In Zambia
                              </div>
                              <div className="text-xl font-black leading-none" style={{ color: plan.color }}>
                                K{priceData.zmw}
                                <span className="text-xs font-normal opacity-75">/mo</span>
                              </div>
                            </div>
                            {/* Outside Zambia — USD */}
                            <div className="flex-1 bg-red-600 text-white rounded-lg px-3 py-2">
                              <div className="text-[9px] font-bold uppercase tracking-wider opacity-80 mb-0.5">
                                Outside Zambia
                              </div>
                              <div className="text-xl font-black leading-none">
                                ${priceData.usd}
                                <span className="text-xs font-normal opacity-75">/mo</span>
                              </div>
                            </div>
                          </div>
                        ) : priceData?.zmw ? (
                          <div className="text-3xl font-black" style={{ color: plan.color }}>
                            K{priceData.zmw}
                            <span className="text-base font-normal text-gray-400">/mo</span>
                          </div>
                        ) : priceData ? (
                          <div className="text-3xl font-black" style={{ color: plan.color }}>
                            ${priceData.usd}
                            <span className="text-base font-normal text-gray-400">/mo</span>
                          </div>
                        ) : null}
                        <div className="text-xs text-green-600 font-semibold mt-2">{plan.tagline}</div>
                      </div>

                      <ul className="space-y-2.5 mb-7">
                        {plan.features.map((feature, fi) => {
                          const isObj = typeof feature === 'object'
                          const label = isObj ? feature.main : feature
                          return (
                            <li key={fi} className="flex items-start gap-3">
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: `${plan.color}20` }}
                              >
                                <Check size={12} style={{ color: plan.color }} strokeWidth={3} />
                              </div>
                              <div>
                                <span className="text-gray-700 text-sm">{label}</span>
                                {isObj && feature.subs.length > 0 && (
                                  <ul className="mt-1.5 space-y-0.5">
                                    {feature.subs.map((sub, si) => (
                                      <li key={si} className="flex items-center gap-1.5 text-gray-500 text-xs">
                                        <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                                        {sub}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>

                      <Link
                        href={planHref(plan.id)}
                        className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                          plan.highlight
                            ? 'bg-accent text-navy hover:bg-yellow-400'
                            : plan.id === 'max'
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-primary text-white hover:bg-navy'
                        }`}
                      >
                        {isSignedIn ? 'Continue to payment' : plan.cta}
                        <ArrowRight size={16} />
                      </Link>

                      {plan.id === 'basic' && !isSignedIn && (
                        <p className="text-center text-xs text-gray-400 mt-3">
                          No credit card required for trial
                        </p>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </section>


      {/* ── PAYMENT METHODS ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-block bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full mb-4">
              Payment Options
            </span>
            <h2 className="text-3xl font-black text-navy">Pay Your Way</h2>
            <p className="mt-3 text-gray-500 max-w-lg mx-auto">
              Mobile money only — MTN or Airtel. Pay, upload your screenshot, and your account is activated once we confirm.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {paymentMethods.map((method, i) => (
              <motion.div
                key={method.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-start gap-4"
              >
                <div className="shrink-0">{method.badge}</div>
                <div>
                  <h3 className="font-bold text-navy mb-2">{method.name}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{method.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ShieldCheck size={18} className="text-primary" />
              <span className="font-semibold text-navy">Manual verification</span>
            </div>
            <p className="text-gray-500 text-sm">
              After you pay, upload the transaction screenshot from your dashboard. We confirm and activate your plan within hours.
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW TO PAY — real numbers + step-by-step ── */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <span className="inline-block bg-accent/20 text-navy text-sm font-semibold px-4 py-2 rounded-full mb-4">
              How to Pay
            </span>
            <h2 className="text-3xl font-black text-navy">The exact numbers to send to</h2>
            <p className="mt-3 text-gray-500 max-w-xl mx-auto">
              These are the real mobile-money accounts. Same numbers work for in-country Zambian
              transfers and cross-border MoMo from anywhere in Africa.
            </p>
          </motion.div>

          {/* Region toggle */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-gray-100 rounded-xl p-1.5">
              <button
                onClick={() => setPayRegion('zambian')}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition ${
                  payRegion === 'zambian'
                    ? 'bg-white text-navy shadow-sm'
                    : 'text-gray-500 hover:text-navy'
                }`}
              >
                🇿🇲 In Zambia
              </button>
              <button
                onClick={() => setPayRegion('international')}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition ${
                  payRegion === 'international'
                    ? 'bg-white text-navy shadow-sm'
                    : 'text-gray-500 hover:text-navy'
                }`}
              >
                🌍 Outside Zambia
              </button>
            </div>
          </div>

          {/* Number cards */}
          <div className="grid md:grid-cols-2 gap-5 mb-8">
            {/* MTN */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <MtnBadge size={44} />
                <div>
                  <div className="font-black text-navy">MTN Mobile Money</div>
                  <div className="text-xs text-gray-500">
                    {payRegion === 'zambian' ? 'Dial *303# or use the MTN MoMo app' : 'Any MTN country across Africa'}
                  </div>
                </div>
              </div>
              <PayCopy label="Number to send to" value={MTN_NUMBER} />
              <PayCopy label="Receiver name" value={RECEIVER_NAME} />
            </motion.div>

            {/* Airtel */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-red-50 border-2 border-red-300 rounded-2xl p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <AirtelBadge size={44} />
                <div>
                  <div className="font-black text-navy">Airtel Money</div>
                  <div className="text-xs text-gray-500">
                    {payRegion === 'zambian' ? 'Dial *115# or use the Airtel Money app' : 'Cross-country transfers supported'}
                  </div>
                </div>
              </div>
              <PayCopy label="Number to send to" value={AIRTEL_NUMBER} />
              <PayCopy label="Receiver name" value={RECEIVER_NAME} />
            </motion.div>
          </div>

          {/* Step-by-step instructions */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 sm:p-7">
            <h3 className="text-lg font-black text-navy mb-4">
              {payRegion === 'zambian' ? 'Send from Zambia' : 'Send from outside Zambia'}
            </h3>
            <ol className="space-y-3">
              {(payRegion === 'international'
                ? [
                    'Open your MTN MoMo or Airtel Money app and choose "Send money abroad" (or "Cross-border transfer") to Zambia.',
                    `Enter one of the numbers above and confirm the receiver name is "${RECEIVER_NAME}".`,
                    'Enter the plan amount (USD or your local equivalent — your provider quotes the rate).',
                    'Complete the transfer with your PIN and wait for the confirmation SMS.',
                    'Take a clear screenshot of the confirmation — it should show amount, receiver, and transaction ID.',
                    'Sign in, head to your dashboard, and upload the screenshot. We verify and activate your plan within a few hours.',
                  ]
                : [
                    'Dial *303# (MTN) or *115# (Airtel), or open the provider app.',
                    'Choose "Send money" and enter the number above.',
                    `Enter the plan amount and confirm the receiver name is "${RECEIVER_NAME}".`,
                    'Complete the transfer with your PIN and wait for the confirmation SMS.',
                    'Take a clear screenshot of the confirmation SMS or app receipt.',
                    'Sign in, head to your dashboard, and upload the screenshot. We verify and activate your plan within a few hours.',
                  ]
              ).map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-white font-black text-xs flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="pt-1 text-sm text-gray-700 leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Follow-through CTA */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm">
            {isSignedIn ? (
              <Link
                href="/dashboard/payment"
                className="inline-flex items-center gap-2 bg-navy text-white font-bold px-6 py-3 rounded-xl hover:bg-primary transition-all"
              >
                Upload payment screenshot <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 bg-navy text-white font-bold px-6 py-3 rounded-xl hover:bg-primary transition-all"
                >
                  Create free account <ArrowRight size={14} />
                </Link>
                <span className="text-gray-400 text-xs">
                  …then upload your screenshot from your dashboard.
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-black text-navy">Frequently Asked Questions</h2>
          </motion.div>

          {[
            {
              q: 'What format are the datasets in?',
              a: 'Datasets are available in Shapefile (.shp), GeoJSON, GeoTIFF, and KML formats depending on the dataset type. Format availability varies by plan.',
            },
            {
              q: 'Can I use the data commercially?',
              a: 'Yes. Max and Pro plan subscribers receive a commercial use licence. Basic plan data may be used for research, personal, and non-commercial applications.',
            },
            {
              q: 'How current is the data?',
              a: 'We update datasets as new versions are published by source institutions. Most land cover and satellite data is updated annually.',
            },
            {
              q: 'Do you offer institutional or NGO pricing?',
              a: 'Yes - government agencies, NGOs, and academic institutions may be eligible for discounted rates. Contact us at lengamaps@gmail.com.',
            },
            {
              q: 'How does billing work?',
              a: 'Plans are billed monthly via MTN or Airtel Mobile Money. After you submit your payment screenshot, we verify it manually (usually within a few hours) and your plan activates for 30 days. Renew anytime from your dashboard.',
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="mb-4 border border-gray-200 rounded-2xl p-6 hover:border-primary/30 transition-colors"
            >
              <h3 className="font-bold text-navy mb-2">{item.q}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{item.a}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 bg-accent">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-black text-navy mb-4">Start Mapping Today</h2>
          <p className="text-navy/70 mb-8">Monthly plans. Cancel anytime.</p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-navy text-white font-bold px-10 py-4 rounded-xl hover:bg-primary transition-all shadow-lg"
          >
            <Download size={18} />
            Get Started Free
          </Link>
        </div>
      </section>

      <Footer />
    </>
  )
}
