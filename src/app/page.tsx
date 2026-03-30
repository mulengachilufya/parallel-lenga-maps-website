'use client'

import { useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Download, ChevronDown, Layers, Droplets, Mountain, Pickaxe } from 'lucide-react'
import GlobeAnimation from '@/components/animations/GlobeAnimation'
import StatsCounter from '@/components/animations/StatsCounter'
import AfricaMap from '@/components/animations/AfricaMap'
import DatasetCard from '@/components/DatasetCard'
import Footer from '@/components/Footer'
import { DATASETS } from '@/lib/supabase'

const heroImage = 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1920&q=80'

const industries = [
  {
    id: 1,
    title: 'Environment & Climate',
    description: 'Land cover, vegetation indices, rainfall patterns, and climate change impact layers for environmental monitoring.',
    icon: <Mountain size={28} />,
    color: '#16a34a',
    image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=600&q=80',
    alt: 'African savanna landscape',
  },
  {
    id: 2,
    title: 'Water & Hydrology',
    description: 'River networks, watershed boundaries, wetland mapping, and seasonal flood extent across African river basins.',
    icon: <Droplets size={28} />,
    color: '#0891b2',
    image: 'https://images.unsplash.com/photo-1504198453344-8b75b3bd3a18?w=600&q=80',
    alt: 'African river system',
  },
  {
    id: 3,
    title: 'Boundary Mapping',
    description: 'Administrative boundaries at national, provincial, and district levels — clean, accurate, and up-to-date.',
    icon: <Layers size={28} />,
    color: '#1E5F8E',
    image: 'https://images.unsplash.com/photo-1575916048090-2a62952b7eb8?w=600&q=80',
    alt: 'Aerial view of Africa',
  },
  {
    id: 4,
    title: 'Mining & Exploration',
    description: 'Geological maps, fault lines, mineral occurrence zones, and lithology data for resource exploration.',
    icon: <Pickaxe size={28} />,
    color: '#b45309',
    image: 'https://images.unsplash.com/photo-1594818898109-44704c3ea292?w=600&q=80',
    alt: 'African terrain geology',
  },
]

export default function HomePage() {
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])
  const textY = useTransform(scrollYProgress, [0, 1], ['0%', '-20%'])

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden">
        <motion.div style={{ y: bgY }} className="absolute inset-0 z-0">
          <Image
            src={heroImage}
            alt="African savanna aerial view"
            fill
            priority
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/70 to-navy/40" />
        </motion.div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div style={{ y: textY }}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-2 bg-accent/20 border border-accent/30 text-accent px-4 py-2 rounded-full text-sm font-semibold mb-6"
              >
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                Africa&apos;s GIS Data Platform
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight"
              >
                Unmasking the Earth,{' '}
                <span className="text-accent">one map</span>{' '}
                at a time
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mt-6 text-lg text-blue-100 max-w-lg leading-relaxed"
              >
                Download professional GIS datasets covering all 54 African nations — boundaries, elevation,
                rivers, land cover, geology and more.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="mt-8 flex flex-wrap gap-4"
              >
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 bg-accent text-navy font-bold px-8 py-4 rounded-xl hover:bg-yellow-400 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                >
                  <Download size={18} />
                  Browse Datasets
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/30 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/20 transition-all"
                >
                  View Pricing
                  <ArrowRight size={18} />
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="mt-10 flex items-center gap-6"
              >
                {[
                  { val: '54', label: 'Countries' },
                  { val: '12+', label: 'Datasets' },
                  { val: '100%', label: 'Africa' },
                ].map((s, i) => (
                  <>
                    {i > 0 && <div key={`div-${i}`} className="h-8 w-px bg-white/20" />}
                    <div key={s.label} className="text-center">
                      <div className="text-2xl font-black text-accent">{s.val}</div>
                      <div className="text-xs text-blue-300 uppercase tracking-wider">{s.label}</div>
                    </div>
                  </>
                ))}
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="hidden lg:flex justify-center items-center h-[400px]"
            >
              <GlobeAnimation />
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-white/60"
        >
          <span className="text-xs uppercase tracking-widest">Scroll</span>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
            <ChevronDown size={20} />
          </motion.div>
        </motion.div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────── */}
      <StatsCounter />

      {/* ── DATASETS GRID ─────────────────────────────────── */}
      <section className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <span className="inline-block bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full mb-4">
              Our Dataset Library
            </span>
            <h2 className="text-3xl lg:text-4xl font-black text-navy">12 Curated GIS Datasets</h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              Professional-grade geospatial data sourced from global institutions. Hover each card to see source, format and resolution.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {DATASETS.map((dataset, i) => (
              <DatasetCard key={dataset.id} dataset={dataset} index={i} />
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-primary text-white font-semibold px-8 py-4 rounded-xl hover:bg-primary-dark transition-all shadow-md"
            >
              View All Datasets & Pricing
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── INDUSTRIES ────────────────────────────────────── */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <span className="inline-block bg-accent/15 text-amber-700 text-sm font-semibold px-4 py-2 rounded-full mb-4">
              Who We Serve
            </span>
            <h2 className="text-3xl lg:text-4xl font-black text-navy">Industries We Power</h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              From environmental consultants to mining engineers — Lenga Maps provides the geospatial foundation.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {industries.map((industry, i) => (
              <motion.div
                key={industry.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group relative rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
              >
                <div className="relative h-56">
                  <Image
                    src={industry.image}
                    alt={industry.alt}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    unoptimized
                  />
                  <div
                    className="absolute inset-0 opacity-80 group-hover:opacity-90 transition-opacity"
                    style={{ background: `linear-gradient(135deg, ${industry.color}dd 0%, #0D2B45ee 100%)` }}
                  />
                </div>
                <div className="absolute inset-0 p-8 flex flex-col justify-end">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white mb-4 bg-white/20">
                    {industry.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{industry.title}</h3>
                  <p className="text-white/80 text-sm leading-relaxed">{industry.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AFRICA MAP SECTION ────────────────────────────── */}
      <section className="py-20 lg:py-28 gradient-primary relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <span className="inline-block bg-accent/20 text-accent text-sm font-semibold px-4 py-2 rounded-full mb-6">
                Continent-Wide Coverage
              </span>
              <h2 className="text-3xl lg:text-4xl font-black text-white mb-6">
                Every Country.<br />
                <span className="text-accent">Every Dataset.</span><br />
                All of Africa.
              </h2>
              <p className="text-blue-200 text-lg leading-relaxed mb-8">
                Lenga Maps is building Africa&apos;s most comprehensive and centralized GIS data repository.
                From Cairo to Cape Town, from Dakar to Djibouti — we&apos;ve got it mapped.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  { label: 'North Africa', count: '6 countries' },
                  { label: 'West Africa', count: '16 countries' },
                  { label: 'East Africa', count: '13 countries' },
                  { label: 'Southern Africa', count: '10 countries' },
                  { label: 'Central Africa', count: '9 countries' },
                  { label: 'Island States', count: '5+ islands' },
                ].map((region) => (
                  <div key={region.label} className="bg-white/10 rounded-xl p-3">
                    <div className="text-accent text-sm font-bold">{region.count}</div>
                    <div className="text-white/70 text-xs">{region.label}</div>
                  </div>
                ))}
              </div>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 bg-accent text-navy font-bold px-6 py-3 rounded-xl hover:bg-yellow-400 transition-all"
              >
                Start Downloading
                <ArrowRight size={18} />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <AfricaMap />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── PHOTO GRID ────────────────────────────────────── */}
      <section className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <span className="inline-block bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full mb-4">
              The Work Behind the Data
            </span>
            <h2 className="text-3xl lg:text-4xl font-black text-navy">Real Data from Real Africa</h2>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[200px]">
            {[
              { src: 'https://images.unsplash.com/photo-1535941339077-2dd1c7963098?w=600&q=80', alt: 'African wetlands', className: 'col-span-2 row-span-2' },
              { src: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400&q=80', alt: 'Savanna landscape', className: '' },
              { src: 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=400&q=80', alt: 'Aerial Africa', className: '' },
              { src: 'https://images.unsplash.com/photo-1504198453344-8b75b3bd3a18?w=400&q=80', alt: 'River systems', className: '' },
              { src: 'https://images.unsplash.com/photo-1594818898109-44704c3ea292?w=400&q=80', alt: 'African terrain', className: '' },
              { src: 'https://images.unsplash.com/photo-1575916048090-2a62952b7eb8?w=400&q=80', alt: 'Zambian landscape', className: '' },
            ].map((photo, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`relative overflow-hidden rounded-2xl group ${photo.className}`}
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                  unoptimized
                />
                <div className="absolute inset-0 bg-navy/30 group-hover:bg-navy/10 transition-colors" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ────────────────────────────────────── */}
      <section className="py-20 bg-accent relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl lg:text-4xl font-black text-navy mb-4">Ready to Map Africa?</h2>
            <p className="text-navy/70 text-lg mb-8 max-w-xl mx-auto">
              Start your 7-day free trial today. No credit card required for Basic plan.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 bg-navy text-white font-bold px-8 py-4 rounded-xl hover:bg-primary transition-all shadow-lg"
              >
                Start Free Trial
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/contact-us"
                className="inline-flex items-center gap-2 bg-white/50 text-navy font-semibold px-8 py-4 rounded-xl hover:bg-white/80 transition-all"
              >
                Talk to Us
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </>
  )
}
