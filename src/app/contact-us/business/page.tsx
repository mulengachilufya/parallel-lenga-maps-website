'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Mail, User, Briefcase, MessageCircle, Send, CheckCircle, Building2,
  Clock, ShieldCheck, ArrowLeft,
} from 'lucide-react'
import Footer from '@/components/Footer'

export default function BusinessEnquiryPage() {
  const [form, setForm] = useState({ email: '', name: '', position: '', whatsapp: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: process.env.NEXT_PUBLIC_WEB3FORMS_KEY,
          name: form.name,
          email: form.email,
          subject: `[Lenga Maps] Business / Enterprise enquiry — ${form.name}`,
          message:
            `New business / enterprise plan enquiry\n\n` +
            `Contact name : ${form.name}\n` +
            `Position     : ${form.position}\n` +
            `Email        : ${form.email}\n` +
            `WhatsApp     : ${form.whatsapp}\n`,
          botcheck: '',
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      setSent(true)
    } catch {
      alert('Failed to send. Please WhatsApp or email us directly.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* ── HERO ── */}
      <section className="pt-32 pb-12 gradient-primary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="inline-flex items-center gap-2 bg-purple-500/20 text-purple-200 text-sm font-semibold px-4 py-2 rounded-full mb-6">
              <Building2 size={14} />
              Business / Enterprise plan
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white mb-4">
              Let&apos;s set up your account personally
            </h1>
            <p className="text-blue-200 text-lg max-w-xl mx-auto">
              Drop your details and we&apos;ll get back to you to confirm seats, billing,
              and onboarding — usually within <span className="text-accent font-bold">2 hours, max</span>.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── FORM + SIDE INFO ── */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy transition-colors mb-6"
          >
            <ArrowLeft size={14} />
            Back to pricing
          </Link>

          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
            {/* Form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8"
            >
              {sent ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={32} className="text-green-600" />
                  </div>
                  <h3 className="text-2xl font-black text-navy mb-3">Got it — we&apos;ll be in touch</h3>
                  <p className="text-gray-500 max-w-sm">
                    Expect a reply on <strong className="text-navy">{form.email}</strong> or
                    a WhatsApp message on <strong className="text-navy">{form.whatsapp}</strong> within 2 hours.
                  </p>
                  <Link
                    href="/"
                    className="mt-6 inline-flex items-center gap-2 bg-navy text-white font-semibold px-6 py-3 rounded-xl hover:bg-primary transition-all"
                  >
                    Back to home
                  </Link>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-black text-navy mb-1">Tell us who we&apos;ll be talking to</h2>
                  <p className="text-gray-500 text-sm mb-6">
                    All four fields are required so we can reach the right person quickly.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Email */}
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-2">
                        Active business email
                      </label>
                      <div className="relative">
                        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          required
                          placeholder="you@company.com"
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 text-navy placeholder-gray-400 bg-gray-50 transition text-sm"
                        />
                      </div>
                    </div>

                    {/* Contact name */}
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-2">
                        Name of person we&apos;ll be talking to
                      </label>
                      <div className="relative">
                        <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          required
                          placeholder="Full name"
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 text-navy placeholder-gray-400 bg-gray-50 transition text-sm"
                        />
                      </div>
                    </div>

                    {/* Position */}
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-2">
                        Their position at the company
                      </label>
                      <div className="relative">
                        <Briefcase size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={form.position}
                          onChange={(e) => setForm({ ...form, position: e.target.value })}
                          required
                          placeholder="e.g. GIS Lead, Operations Manager, CTO"
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 text-navy placeholder-gray-400 bg-gray-50 transition text-sm"
                        />
                      </div>
                    </div>

                    {/* WhatsApp */}
                    <div>
                      <label className="block text-sm font-semibold text-navy mb-2">
                        Their WhatsApp line
                      </label>
                      <div className="relative">
                        <MessageCircle size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="tel"
                          value={form.whatsapp}
                          onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                          required
                          placeholder="+260 9XX XXX XXX"
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 text-navy placeholder-gray-400 bg-gray-50 transition text-sm"
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">
                        Include the country code so cross-border WhatsApp works.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white font-bold py-3.5 rounded-xl hover:bg-purple-700 transition-all shadow-md disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          Send my details
                        </>
                      )}
                    </button>
                  </form>
                </>
              )}
            </motion.div>

            {/* Side info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <Clock size={18} className="text-purple-600" />
                  </div>
                  <h3 className="font-black text-navy">Reply within 2 hours</h3>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Business plans get personal handling — we don&apos;t leave enterprise
                  enquiries in a queue. You&apos;ll hear from a real human, fast.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <ShieldCheck size={18} className="text-purple-600" />
                  </div>
                  <h3 className="font-black text-navy">What we&apos;ll discuss</h3>
                </div>
                <ul className="text-gray-500 text-sm leading-relaxed space-y-1.5 mt-3">
                  <li className="flex gap-2"><span className="text-purple-500">·</span> Team seats &amp; user provisioning</li>
                  <li className="flex gap-2"><span className="text-purple-500">·</span> Invoice / PO billing setup</li>
                  <li className="flex gap-2"><span className="text-purple-500">·</span> Custom dataset extracts</li>
                  <li className="flex gap-2"><span className="text-purple-500">·</span> Commercial redistribution licence</li>
                  <li className="flex gap-2"><span className="text-purple-500">·</span> SLA &amp; data delivery cadence</li>
                </ul>
              </div>

              <div className="bg-purple-600 text-white rounded-2xl p-6">
                <div className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Prefer WhatsApp?</div>
                <div className="text-lg font-black mb-3">Reach us directly</div>
                <a
                  href="https://wa.me/260965699359"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-white text-purple-700 font-bold px-4 py-2.5 rounded-xl hover:bg-purple-50 transition-all text-sm"
                >
                  <MessageCircle size={16} />
                  +260 965 699 359
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
