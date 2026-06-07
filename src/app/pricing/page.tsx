'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import {
  PLANS, PLAN_ORDER, PLAN_CARD_UI, planCardCount, type TierSlug,
} from '@/lib/pricing'
import { supabase } from '@/lib/supabase'

const CTA: Record<TierSlug, string> = {
  starter:    'Get started',
  pro:        'Get started',
  max:        'Get started',
  enterprise: 'Contact us',
}

const TAGLINE: Record<TierSlug, string> = {
  starter:    'Core environmental layers to get you mapping.',
  pro:        'Everything in Starter, plus hydrology and infrastructure.',
  max:        'The full platform — every layer we have.',
  enterprise: 'Max, plus custom sub-country datasets and team access.',
}

/**
 * Pricing CTAs are session-aware:
 *   logged-out user → /signup  (account first, then checkout)
 *   logged-in user  → /dashboard/payment?plan=<slug>  (straight to pay)
 *
 * Enterprise always routes to sales.
 */
function ctaHref(slug: TierSlug, signedIn: boolean): string {
  if (slug === 'enterprise') return '/contact-us/business'
  return signedIn ? `/dashboard/payment?plan=${slug}` : '/signup'
}

export default function PricingPage() {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setSignedIn(!!session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_e, s) => setSignedIn(!!s)
    )
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  return (
    <main className="min-h-screen bg-[#F5F1EA]">
      {/* Hero */}
      <section className="pt-32 pb-16 px-5 sm:px-8 lg:px-12">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#8B7A5C] mb-6">
            Pricing
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="font-serif text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.05] text-[#1a1a1a] font-medium tracking-tight"
          >
            Simple, honest pricing for serious GIS work.
          </motion.h1>
          <p className="mt-6 text-[1.05rem] text-[#5b5446] leading-relaxed max-w-xl mx-auto">
            All plans cover the 54 African countries and harmonise to EPSG:4326.
            Billed monthly in USD. Three days of full access on every new account, no card required.
          </p>
        </div>
      </section>

      {/* Plan grid */}
      <section className="pb-24 px-5 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-[#E5DDCB] border border-[#E5DDCB] rounded-sm overflow-hidden">
          {PLAN_ORDER.map((slug, i) => {
            const plan        = PLANS[slug]
            const tagline     = TAGLINE[slug]
            const datasets    = PLAN_CARD_UI[slug].datasets
            const recommended = slug === 'pro'

            return (
              <motion.article
                key={slug}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                viewport={{ once: true }}
                className={`relative bg-[#FAF7F1] p-7 sm:p-8 flex flex-col ${
                  recommended ? 'ring-1 ring-inset ring-[#C9A227]' : ''
                }`}
              >
                {recommended && (
                  <span className="absolute top-4 right-4 text-[10px] font-medium uppercase tracking-[0.18em] text-[#8B7A5C]">
                    Most chosen
                  </span>
                )}

                {/* Eyebrow + name */}
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8B7A5C]">
                  {plan.name}
                </p>

                {/* Price */}
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-serif text-[2.6rem] leading-none text-[#1a1a1a] font-medium">
                    {plan.priceLabel}
                  </span>
                  <span className="text-[0.82rem] text-[#7a7060]">/month</span>
                </div>

                {/* Tagline */}
                <p className="mt-5 text-[0.92rem] text-[#5b5446] leading-relaxed">
                  {tagline}
                </p>

                {/* Divider */}
                <div className="my-7 h-px bg-[#E5DDCB]" />

                {/* What's included */}
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#8B7A5C] mb-3">
                  {planCardCount(slug)}
                </p>

                <ul className="space-y-2.5 flex-1">
                  {datasets.map((d) => (
                    <li
                      key={d}
                      className="flex items-start gap-2.5 text-[0.86rem] text-[#3d362c] leading-snug"
                    >
                      <Check
                        size={13}
                        className="mt-[3px] shrink-0 text-[#8B7A5C]"
                        strokeWidth={2.25}
                      />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="mt-8 pt-2">
                  <Link
                    href={ctaHref(slug, signedIn)}
                    className={`block w-full text-center text-[0.86rem] font-medium tracking-wide py-3 transition-all ${
                      recommended
                        ? 'bg-[#1a1a1a] text-[#FAF7F1] hover:bg-[#0D2B45]'
                        : 'bg-transparent text-[#1a1a1a] border border-[#1a1a1a]/20 hover:border-[#1a1a1a]/50'
                    }`}
                  >
                    {CTA[slug]}
                  </Link>
                </div>
              </motion.article>
            )
          })}
        </div>

        {/* Trial note */}
        <p className="text-center mt-12 text-[0.92rem] text-[#5b5446]">
          Every new account starts with{' '}
          <span className="text-[#1a1a1a] font-medium">a 3-day free trial</span> of full Max access.{' '}
          No card required.
        </p>
      </section>

      {/* Sub-feature row — quiet confidence */}
      <section className="pb-24 px-5 sm:px-8 lg:px-12 border-t border-[#E5DDCB]/60 pt-20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {[
            { eyebrow: 'Coverage',  title: '54 nations',   body: 'Every African country, every dataset. No regional gaps.' },
            { eyebrow: 'Sources',   title: 'Cited',        body: 'GADM, HydroSHEDS, CHIRPS, ISRIC, WorldClim, IGRAC, HDX, ESA.' },
            { eyebrow: 'Format',    title: 'GIS-ready',    body: 'Shapefile, GeoPackage, GeoTIFF — harmonised to EPSG:4326.' },
            { eyebrow: 'Symbology', title: 'QGIS-paired',  body: 'Paletted rasters ship with .qml — open and they look right.' },
          ].map((f) => (
            <div key={f.eyebrow}>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8B7A5C]">
                {f.eyebrow}
              </p>
              <h3 className="mt-3 font-serif text-[1.5rem] leading-tight text-[#1a1a1a] font-medium">
                {f.title}
              </h3>
              <p className="mt-3 text-[0.92rem] text-[#5b5446] leading-relaxed">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
