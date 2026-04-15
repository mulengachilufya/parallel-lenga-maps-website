'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Phone, MapPin, Send, CheckCircle, MessageCircle } from 'lucide-react'

const LinkedinIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
  </svg>
)
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
)
import Footer from '@/components/Footer'

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
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
          subject: form.subject ? `[Lenga Maps] ${form.subject}` : `[Lenga Maps] New message from ${form.name}`,
          message: form.message,
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

  const contactInfo = [
    {
      icon: <Mail size={20} />,
      label: 'Email',
      value: 'lengamaps@gmail.com',
      href: 'mailto:lengamaps@gmail.com',
      color: '#1E5F8E',
    },
    {
      icon: <Phone size={20} />,
      label: 'Phone / WhatsApp',
      value: '+260 965 699 359',
      href: 'https://wa.me/260965699359',
      color: '#16a34a',
    },
    {
      icon: <MapPin size={20} />,
      label: 'Location',
      value: 'Lusaka, Zambia',
      href: null,
      color: '#b45309',
    },
    {
      icon: <LinkedinIcon />,
      label: 'LinkedIn',
      value: 'Lenga Maps',
      href: 'https://linkedin.com',
      color: '#0a66c2',
    },
    {
      icon: <FacebookIcon />,
      label: 'Facebook',
      value: 'Lenga Maps',
      href: 'https://facebook.com',
      color: '#1877f2',
    },
  ]

  return (
    <>
      {/* ── HERO ── */}
      <section className="pt-32 pb-16 gradient-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="inline-flex items-center gap-2 bg-accent/20 text-accent text-sm font-semibold px-4 py-2 rounded-full mb-6">
              <MessageCircle size={14} />
              Get in Touch
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white mb-4">Contact Us</h1>
            <p className="text-blue-200 text-xl max-w-xl mx-auto">
              Questions about data, pricing, or partnerships? We&apos;d love to hear from you.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── CONTACT GRID ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Form */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8"
            >
              {sent ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={32} className="text-green-600" />
                  </div>
                  <h3 className="text-2xl font-black text-navy mb-3">Message Sent!</h3>
                  <p className="text-gray-500">
                    Thank you for reaching out. We&apos;ll get back to you within 24 hours.
                  </p>
                  <button
                    onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }) }}
                    className="mt-6 text-primary text-sm font-semibold hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-black text-navy mb-6">Send a Message</h2>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-navy mb-2">Your Name</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          required
                          placeholder="Full name"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 bg-gray-50 transition text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-navy mb-2">Email</label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          required
                          placeholder="you@example.com"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 bg-gray-50 transition text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-navy mb-2">Subject</label>
                      <select
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        required
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy bg-gray-50 transition text-sm"
                      >
                        <option value="">Select a subject</option>
                        <option>Data Question</option>
                        <option>Pricing & Plans</option>
                        <option>Partnership Enquiry</option>
                        <option>Technical Support</option>
                        <option>Custom Dataset Request</option>
                        <option>Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-navy mb-2">Message</label>
                      <textarea
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        required
                        rows={5}
                        placeholder="Tell us how we can help..."
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-navy placeholder-gray-400 bg-gray-50 transition text-sm resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-primary-dark transition-all shadow-md disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          Send Message
                        </>
                      )}
                    </button>
                  </form>
                </>
              )}
            </motion.div>

            {/* Contact Info */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl font-black text-navy mb-2">Get in Touch Directly</h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  We&apos;re a small team and respond personally to every inquiry.
                  Expect a reply within 24 hours.
                </p>
              </div>

              <div className="space-y-4">
                {contactInfo.map((item) => (
                  <motion.div
                    key={item.label}
                    whileHover={{ x: 4 }}
                    className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider">{item.label}</div>
                      {item.href ? (
                        <a
                          href={item.href}
                          target={item.href.startsWith('http') ? '_blank' : undefined}
                          rel="noopener noreferrer"
                          className="text-navy font-semibold text-sm hover:text-primary transition-colors"
                        >
                          {item.value}
                        </a>
                      ) : (
                        <span className="text-navy font-semibold text-sm">{item.value}</span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* WhatsApp CTA */}
              <a
                href="https://wa.me/260965699359"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full bg-green-500 text-white font-bold py-4 rounded-2xl hover:bg-green-600 transition-all shadow-md hover:shadow-lg"
              >
                <MessageCircle size={20} />
                Chat on WhatsApp
              </a>

              {/* Map placeholder */}
              <div className="bg-navy/5 rounded-2xl p-8 text-center border border-gray-200">
                <MapPin size={32} className="text-primary mx-auto mb-3" />
                <div className="font-bold text-navy">Lusaka, Zambia</div>
                <div className="text-gray-500 text-sm mt-1">Sub-Saharan Africa</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
