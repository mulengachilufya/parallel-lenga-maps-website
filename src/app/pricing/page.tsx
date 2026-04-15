'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check, Lock, Download, ArrowRight, CreditCard, Star } from 'lucide-react'
import Footer from '@/components/Footer'
import { DATASETS } from '@/lib/supabase'

const plans = [
  {
    name: 'Basic',
    price: 'K25',
    period: '/month',
    tagline: '7-day free trial',
    description: 'Perfect for researchers and students exploring African spatial data.',
    color: '#1E5F8E',
    highlight: false,
    features: [
      '3 countries of your choice',
      '5 core datasets included',
      'Shapefile & GeoJSON formats',
      'Standard resolution data',
      'Email support',
      '7-day free trial',
      'Download up to 10 files/month',
    ],
    cta: 'Start Free Trial',
    href: '/signup?plan=basic',
  },
  {
    name: 'Pro',
    price: 'K75',
    period: '/month',
    tagline: 'Most Popular',
    description: 'Full access to all 54 countries and every dataset in our catalogue.',
    color: '#F5B800',
    highlight: true,
    features: [
      'All 54 African countries',
      'Full dataset catalogue (15+ datasets)',
      'All formats: Shapefile, GeoJSON, GeoTIFF, KML',
      'Highest available resolution',
      'Priority email & WhatsApp support',
      'Unlimited downloads',
      'API access (coming soon)',
      'New datasets as they launch',
    ],
    cta: 'Get Pro Access',
    href: '/signup?plan=pro',
  },
]

const paymentMethods = [
  {
    name: 'MTN Mobile Money',
    logo: '📱',
    description: 'Pay instantly with MTN MoMo across Zambia and 14+ African countries.',
    color: '#FFCC00',
  },
  {
    name: 'Airtel Money',
    logo: '📲',
    description: 'Seamless payments via Airtel Money - no bank account needed.',
    color: '#E40000',
  },
  {
    name: 'Bank Card / Visa',
    logo: '💳',
    description: 'Secure card payments via Flutterwave - Visa, Mastercard accepted.',
    color: '#1E5F8E',
  },
]

export default function PricingPage() {
  const [hoveredDataset, setHoveredDataset] = useState<number | null>(null)

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
              Priced in Zambian Kwacha.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── PRICING CARDS ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.15 }}
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

                <div className="p-8">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-black text-navy">{plan.name}</h2>
                      <p className="text-gray-500 text-sm mt-1">{plan.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black" style={{ color: plan.color }}>
                        {plan.price}
                        <span className="text-base font-normal text-gray-400">{plan.period}</span>
                      </div>
                      <div className="text-xs text-green-600 font-semibold mt-1">{plan.tagline}</div>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: `${plan.color}20` }}
                        >
                          <Check size={12} style={{ color: plan.color }} strokeWidth={3} />
                        </div>
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.href}
                    className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                      plan.highlight
                        ? 'bg-accent text-navy hover:bg-yellow-400'
                        : 'bg-primary text-white hover:bg-primary-dark'
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight size={16} />
                  </Link>

                  {plan.name === 'Basic' && (
                    <p className="text-center text-xs text-gray-400 mt-3">
                      No credit card required for trial
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DATASET TABLE ── */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-black text-navy">What&apos;s Included</h2>
            <p className="mt-3 text-gray-500">All 15+ datasets - see which plan unlocks each one.</p>
          </motion.div>

          <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-[1fr_auto_auto] bg-navy text-white text-sm font-semibold">
              <div className="p-4">Dataset</div>
              <div className="p-4 text-center w-24">Basic</div>
              <div className="p-4 text-center w-24">Pro</div>
            </div>

            {DATASETS.map((dataset, i) => (
              <motion.div
                key={dataset.id}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                onMouseEnter={() => setHoveredDataset(dataset.id)}
                onMouseLeave={() => setHoveredDataset(null)}
                className={`grid grid-cols-[1fr_auto_auto] border-b border-gray-100 last:border-0 transition-colors ${
                  hoveredDataset === dataset.id ? 'bg-primary/5' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                <div className="p-4 flex items-center gap-3">
                  <span className="text-xl">{dataset.icon}</span>
                  <div>
                    <div className="font-semibold text-navy text-sm">{dataset.name}</div>
                    <div className="text-gray-400 text-xs">{dataset.category}</div>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-center w-24">
                  {dataset.tier === 'basic' ? (
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                      <Check size={12} className="text-green-600" strokeWidth={3} />
                    </div>
                  ) : (
                    <Lock size={14} className="text-gray-300" />
                  )}
                </div>
                <div className="p-4 flex items-center justify-center w-24">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                    <Check size={12} className="text-amber-600" strokeWidth={3} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
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
              We accept mobile money, card payments, and bank transfers - because finance shouldn&apos;t be a barrier to good data.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {paymentMethods.map((method, i) => (
              <motion.div
                key={method.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="text-4xl mb-4">{method.logo}</div>
                <h3 className="font-bold text-navy mb-2">{method.name}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{method.description}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <CreditCard size={18} className="text-primary" />
              <span className="font-semibold text-navy">Powered by Flutterwave</span>
            </div>
            <p className="text-gray-500 text-sm">
              All card and mobile money transactions are secured by Flutterwave - Africa&apos;s leading payment platform.
            </p>
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
              a: 'Yes. Pro plan subscribers receive a commercial use licence. Basic plan data may be used for research, personal, and non-commercial applications.',
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
              q: 'Is there a free trial?',
              a: 'Basic plan subscribers get a 7-day free trial with no credit card required. You will only be charged after the trial period.',
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
          <p className="text-navy/70 mb-8">7-day free trial. Cancel anytime.</p>
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
