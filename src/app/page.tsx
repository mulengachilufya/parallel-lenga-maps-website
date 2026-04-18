'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Download, Database, Globe2, Layers, Droplets, Mountain, Pickaxe, Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'
import DatasetCard from '@/components/DatasetCard'
import Footer from '@/components/Footer'
import HomeContactForm from '@/components/HomeContactForm'
import { supabase, DATASETS } from '@/lib/supabase'

const heroImage = '/images/branding/river-aerial.jpg'

const services = [
  {
    icon: <Globe2 size={28} />,
    title: 'GIS Consulting',
    description: 'Expert geospatial analysis, mapping, and spatial data management for projects across Africa.',
  },
  {
    icon: <Database size={28} />,
    title: 'GIS Data Bank',
    description: 'Download professional-grade datasets - boundaries, elevation, rivers, land cover, and more.',
  },
  {
    icon: <Layers size={28} />,
    title: 'Custom Mapping',
    description: 'Bespoke map production, remote sensing, and spatial modelling tailored to your needs.',
  },
  {
    icon: <Pickaxe size={28} />,
    title: 'Environmental Studies',
    description: 'Environmental impact assessments, land use analysis, and climate data processing.',
  },
]


function InlineSignup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            plan: 'basic',
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }
      setSuccess(true)
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8"
      >
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-green-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Check your email!</h3>
        <p className="text-white/60 text-sm">
          We&apos;ve sent a confirmation link to <strong className="text-gold">{email}</strong>.
        </p>
      </motion.div>
    )
  }

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="relative">
        <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Full name"
          className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-gold/50 transition"
        />
      </div>

      <div className="relative">
        <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="Email address"
          className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-gold/50 transition"
        />
      </div>

      <div className="relative">
        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Password (min. 8 characters)"
          className="w-full pl-11 pr-12 py-3.5 bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-gold/50 transition"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gold text-[#1a1200] font-bold py-4 hover:bg-gold-light transition-all disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-[#1a1200]/30 border-t-[#1a1200] rounded-full animate-spin" />
            Creating account...
          </>
        ) : (
          <>
            Create Free Account
            <ArrowRight size={18} />
          </>
        )}
      </button>

      <p className="text-xs text-white/30 text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-gold hover:underline">Sign in</Link>
        {' '}&middot;{' '}
        By signing up you agree to our{' '}
        <Link href="/terms" className="text-gold hover:underline">Terms</Link>
      </p>
    </form>
  )
}

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
            alt="African landscape aerial view"
            fill
            priority
            className="object-cover brightness-[0.55] saturate-[1.1]"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a121c]/80 via-[#0a121c]/40 to-[#0a121c]/10" />
        </motion.div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-6 lg:px-12 pt-24">
          <motion.div style={{ y: textY }} className="max-w-[680px]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-3.5 mb-7"
            >
              <div className="w-9 h-0.5 bg-gold" />
              <span className="text-[0.78rem] font-bold tracking-[0.18em] text-gold uppercase">
                Geospatial Intelligence
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-[clamp(2.6rem,5.5vw,4.2rem)] font-extrabold leading-[1.08] text-white tracking-tight mb-7"
            >
              Unmasking{' '}
              <span className="text-gold">Africa</span> with
              <br />
              <span className="text-gold">Data</span> and Intelligence.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-[1.05rem] leading-[1.7] text-white/80 max-w-[520px] mb-12"
            >
              Building Africa&apos;s largest and most centralized environmental GIS
              database. We fuse GIS software and programming to solve complex
              geospatial challenges across emerging markets.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex flex-wrap gap-4"
            >
              <Link
                href="/datasets"
                className="inline-flex items-center gap-2 bg-gold text-[#1a1200] text-[0.95rem] font-bold px-8 py-4 hover:bg-gold-light transition-all hover:-translate-y-0.5"
              >
                <Download size={18} />
                Download GIS Data
              </Link>
              <Link
                href="/services"
                className="inline-flex items-center gap-2 bg-white/[0.12] text-white text-[0.95rem] font-semibold px-8 py-4 border-[1.5px] border-white/[0.35] hover:bg-white/20 hover:border-white/60 transition-all hover:-translate-y-0.5"
              >
                Explore Services
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── GIS DATABASE SHOWCASE ─────────────────────────── */}
      <section className="py-20 lg:py-28 bg-dark-light border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="flex items-center justify-center gap-3.5 mb-6">
              <div className="w-9 h-0.5 bg-gold" />
              <span className="text-[0.78rem] font-bold tracking-[0.18em] text-gold uppercase">
                GIS Data Bank
              </span>
              <div className="w-9 h-0.5 bg-gold" />
            </div>
            <h2 className="text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-tight mb-4">
              Africa&apos;s Most Centralized{' '}
              <span className="text-gold">GIS Database</span>
            </h2>
            <p className="text-[1.05rem] text-white/60 max-w-2xl mx-auto leading-relaxed">
              Download professional-grade geospatial datasets covering all 54 African nations.
              Boundaries, elevation, rivers, land cover, geology, and more - sourced from global institutions.
            </p>
          </motion.div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto mb-16">
            {[
              { val: '54', label: 'Countries' },
              { val: '15+', label: 'Datasets' },
              { val: '100%', label: 'Africa' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="text-3xl font-extrabold text-gold">{s.val}</div>
                <div className="text-xs text-white/40 uppercase tracking-[0.15em] mt-1">{s.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Dataset cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {DATASETS.map((dataset, i) => (
              <DatasetCard key={dataset.id} dataset={dataset} index={i} />
            ))}
          </div>

          <div className="text-center mt-14">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-gold text-[#1a1200] font-bold px-8 py-4 hover:bg-gold-light transition-all hover:-translate-y-0.5"
            >
              View All Datasets & Pricing
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CREATE ACCOUNT (INLINE SIGNUP) ────────────────── */}
      <section className="py-20 lg:py-28 bg-dark border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3.5 mb-6">
                <div className="w-9 h-0.5 bg-gold" />
                <span className="text-[0.78rem] font-bold tracking-[0.18em] text-gold uppercase">
                  Get Started
                </span>
              </div>
              <h2 className="text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-tight mb-6">
                Create Your{' '}
                <span className="text-gold">Free Account</span>
              </h2>
              <p className="text-[1.05rem] text-white/60 leading-relaxed mb-8">
                Sign up in seconds and start downloading professional GIS datasets
                covering all 54 African countries. No credit card required for the Basic plan.
              </p>

              <div className="space-y-4">
                {[
                  'Access to 15+ curated GIS datasets',
                  '7-day free trial on Basic plan',
                  'Professional-grade data from global institutions',
                  'Shapefile, GeoTIFF, and GeoJSON formats',
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={12} className="text-gold" />
                    </div>
                    <span className="text-white/70 text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white/[0.03] border border-white/[0.08] p-8 lg:p-10"
            >
              <h3 className="text-xl font-bold text-white mb-6">Create Account</h3>
              <InlineSignup />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── SERVICES / CONSULTANCY ────────────────────────── */}
      <section className="py-20 lg:py-28 bg-dark-light border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="flex items-center justify-center gap-3.5 mb-6">
              <div className="w-9 h-0.5 bg-gold" />
              <span className="text-[0.78rem] font-bold tracking-[0.18em] text-gold uppercase">
                What We Do
              </span>
              <div className="w-9 h-0.5 bg-gold" />
            </div>
            <h2 className="text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-tight mb-4">
              We Don&apos;t Just Map the World -
              <br />
              <span className="text-gold">We Help Solve It.</span>
            </h2>
            <p className="text-[1.05rem] text-white/60 max-w-2xl mx-auto leading-relaxed">
              From GIS consulting to data engineering - Lenga Maps provides the geospatial foundation
              for projects across Africa and beyond.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((service, i) => (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group bg-white/[0.03] border border-white/[0.08] p-8 hover:border-gold/30 transition-all duration-300"
              >
                <div className="w-14 h-14 bg-gold/10 flex items-center justify-center text-gold mb-5 group-hover:bg-gold/20 transition-colors">
                  {service.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-3">{service.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{service.description}</p>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-14">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 text-gold text-[0.92rem] font-bold px-6 py-3.5 border-[1.5px] border-gold hover:bg-gold hover:text-[#1a1200] transition-all uppercase tracking-[0.04em] hover:-translate-y-0.5"
            >
              View All Services
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── PARTNERSHIP ───────────────────────────────────── */}
      <section className="py-20 lg:py-28 bg-dark-light border-t border-white/[0.06]">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-6 lg:px-12">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="flex-1 min-w-0"
            >
              <div className="flex items-center gap-3.5 mb-6">
                <div className="w-9 h-0.5 bg-gold" />
                <span className="text-[0.78rem] font-bold tracking-[0.18em] text-gold uppercase">
                  Partnerships
                </span>
              </div>
              <h2 className="text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-tight mb-7">
                Become a Strategic{' '}
                <span className="text-gold">Partner</span>
              </h2>
              <p className="text-[1.05rem] text-white/60 leading-relaxed mb-4">
                We collaborate with businesses, organizations, and institutions to deliver
                data-driven geospatial and environmental solutions.
              </p>
              <p className="text-[1.05rem] text-white/60 leading-relaxed mb-5">
                Email us at{' '}
                <a href="mailto:lengamaps@gmail.com" className="text-gold font-semibold hover:underline">
                  lengamaps@gmail.com
                </a>
                {' '}with the subject line:
              </p>

              <div className="text-[0.82rem] font-bold tracking-[0.12em] text-gold bg-gold/10 border-l-[3px] border-gold px-[18px] py-3.5 uppercase mb-5">
                Strategic Partnership Proposal with Lenga Maps
              </div>

              <p className="text-[0.95rem] text-white/40 italic leading-relaxed mb-9">
                To streamline discussions, please include a short concept note or collaboration outline.
              </p>

              <a
                href="mailto:lengamaps@gmail.com?subject=STRATEGIC%20PARTNERSHIP%20PROPOSAL%20WITH%20LENGA%20MAPS"
                className="inline-flex items-center gap-2 bg-gold text-[#1a1200] text-[0.95rem] font-bold px-8 py-4 hover:bg-gold-light transition-all hover:-translate-y-0.5"
              >
                Send Partnership Proposal
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <Image
                src="/images/branding/satellite.jpg"
                alt="Satellite remote sensing"
                width={600}
                height={460}
                className="w-full h-[460px] object-cover brightness-90 saturate-[1.05]"
                unoptimized
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── ABOUT ─────────────────────────────────────────── */}
      <section className="py-20 lg:py-28 bg-dark border-t border-white/[0.06]">
        <div className="max-w-[900px] mx-auto px-5 sm:px-6 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3.5 mb-8">
              <div className="w-9 h-0.5 bg-gold" />
              <span className="text-[0.78rem] font-bold tracking-[0.18em] text-gold uppercase">
                About Us
              </span>
            </div>
            <h2 className="text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-tight mb-7">
              We Don&apos;t Just Map the World -
              <br />
              We Help Solve It.
            </h2>
            <p className="text-[1.08rem] text-white/60 leading-[1.8] mb-12">
              Lenga Maps is a geospatial intelligence startup that uses GIS software and programming
              to solve the world&apos;s most complex environmental problems. But we don&apos;t just end at
              developing GIS projects - we&apos;re also building Africa&apos;s largest and most centralized
              GIS data bank. Ours is to be a top player in emerging markets and a world class
              consulting firm, all things geospatial technology.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="#"
                className="text-center text-gold text-[0.92rem] font-bold px-6 py-3.5 border-[1.5px] border-gold hover:bg-gold hover:text-[#1a1200] transition-all uppercase tracking-[0.04em] hover:-translate-y-0.5"
              >
                Download Capability Statement
              </Link>
              <Link
                href="/contact-us"
                className="text-center text-gold text-[0.92rem] font-bold px-6 py-3.5 border-[1.5px] border-gold hover:bg-gold hover:text-[#1a1200] transition-all uppercase tracking-[0.04em] hover:-translate-y-0.5"
              >
                Request a Quote
              </Link>
              <Link
                href="/contact-us"
                className="text-center text-gold text-[0.92rem] font-bold px-6 py-3.5 border-[1.5px] border-gold hover:bg-gold hover:text-[#1a1200] transition-all uppercase tracking-[0.04em] hover:-translate-y-0.5"
              >
                Schedule a Free Call
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section className="py-20 lg:py-28 bg-dark-light border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <div className="flex items-center justify-center gap-3.5 mb-4">
              <div className="w-9 h-0.5 bg-gold" />
              <span className="text-[0.78rem] font-bold tracking-[0.18em] text-gold uppercase">Get In Touch</span>
              <div className="w-9 h-0.5 bg-gold" />
            </div>
            <h2 className="text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-tight mb-4">
              Send Us a Message
            </h2>
            <p className="text-white/50 text-[1rem] max-w-lg mx-auto">
              We respond personally to every inquiry within 24 hours.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-12 items-start max-w-5xl mx-auto">
            {/* Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <HomeContactForm />
            </motion.div>

            {/* Contact info */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-5"
            >
              {[
                { label: 'Email', value: 'lengamaps@gmail.com', href: 'mailto:lengamaps@gmail.com', color: '#1E5F8E' },
                { label: 'WhatsApp', value: '+260 965 699 359', href: 'https://wa.me/260965699359', color: '#16a34a' },
                { label: 'Location', value: 'Lusaka, Zambia', href: null, color: '#b45309' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-xl">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <div>
                    <p className="text-[0.72rem] text-white/40 uppercase tracking-wider mb-0.5">{item.label}</p>
                    {item.href ? (
                      <a href={item.href} className="text-white font-semibold hover:text-gold transition-colors">{item.value}</a>
                    ) : (
                      <p className="text-white font-semibold">{item.value}</p>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
