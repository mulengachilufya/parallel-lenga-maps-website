'use client'

/**
 * TeamQuoteBuilder - "tell us what your team needs".
 *
 * This replaces the old team price cards and calculator. Teams no longer see
 * a public price. They build a request instead: how many seats, whether they
 * want on-site support, custom data or API access, then who they are and
 * anything else they want to say. It posts to /api/quotes.
 *
 * Works with or without an account. Signed-in visitors get their name and
 * email filled in (and the request is linked to their account on the
 * server), everyone else just types them.
 *
 * Used on /pricing (tone="dark") and /projects (tone="light").
 *
 * Booking a call: set NEXT_PUBLIC_BOOKING_URL (a Cal.com / Calendly link).
 * Until it is set, the button opens WhatsApp with a pre-filled message.
 */

import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Loader2 } from 'lucide-react'
import SeatStepper from '@/components/SeatStepper'
import { supabase } from '@/lib/supabase'
import {
  SHOW_SEAT_ESTIMATE, TEAM_MIN_SEATS, TEAM_SEAT_PRICE, TEAM_TERMS, TEAM_TERM_ORDER,
  teamPrice, isTeamTerm, type TeamTerm,
} from '@/lib/pricing'

const NAVY = '#0D2B45'
const GOLD = '#F5B800'

const BOOKING_URL =
  process.env.NEXT_PUBLIC_BOOKING_URL ||
  'https://wa.me/260965699359?text=Hi%20Lenga%20Maps%2C%20I%27d%20like%20to%20book%20a%20call%20about%20a%20team%20plan.'

type Tone = 'dark' | 'light'

const TONES = {
  dark: {
    panelBg: 'rgba(13,43,69,0.55)', panelBorder: '1px solid rgba(245,184,0,0.25)',
    text: '#ffffff', muted: '#9fb0c0', label: '#BFD7EA',
    fieldBg: 'rgba(255,255,255,0.06)', fieldBorder: '1px solid rgba(255,255,255,0.2)', fieldText: '#ffffff',
    chipBg: 'rgba(255,255,255,0.05)', chipBorder: '1px solid rgba(255,255,255,0.14)',
    chipOnBg: 'rgba(245,184,0,0.14)', chipOnBorder: `1px solid ${GOLD}`,
    estimateBg: 'rgba(255,255,255,0.06)',
  },
  light: {
    panelBg: '#ffffff', panelBorder: '1px solid #e5e7eb',
    text: NAVY, muted: '#6b7280', label: '#4b5563',
    fieldBg: '#ffffff', fieldBorder: '1px solid #e5e7eb', fieldText: '#111827',
    chipBg: '#ffffff', chipBorder: '1px solid #e5e7eb',
    chipOnBg: '#FFF8E1', chipOnBorder: `1px solid ${GOLD}`,
    estimateBg: '#FAFAF7',
  },
} as const

const EXTRAS = [
  { key: 'onsite_support', label: 'On-site support', hint: 'Someone from us on site or on call' },
  { key: 'custom_data',    label: 'Custom data',     hint: 'Datasets or processing made for you' },
  { key: 'api_access',     label: 'API access',      hint: 'Pull our data into your own systems' },
] as const
type ExtraKey = typeof EXTRAS[number]['key']

export default function TeamQuoteBuilder({
  presetSeats = null,
  tone = 'light',
}: { presetSeats?: number | null; tone?: Tone }) {
  const T = TONES[tone]

  const [seats, setSeats]   = useState<number>(TEAM_MIN_SEATS)
  const [extras, setExtras] = useState<Record<ExtraKey, boolean>>({ onsite_support: false, custom_data: false, api_access: false })
  const [term, setTerm]     = useState<TeamTerm | ''>('')
  const [name, setName]     = useState('')
  const [email, setEmail]   = useState('')
  const [org, setOrg]       = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [message, setMessage]   = useState('')
  const [wantsCall, setWantsCall] = useState(false)

  const [sending, setSending] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  // A "Get a quote for N seats" button elsewhere on the page can preset this.
  useEffect(() => {
    if (presetSeats != null && presetSeats >= TEAM_MIN_SEATS) setSeats(presetSeats)
  }, [presetSeats])

  // Signed in? Fill in what we already know, never overwrite what they typed.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session) return
      const u = session.user
      setEmail((cur) => cur || u.email || '')
      setName((cur) => cur || (u.user_metadata?.full_name as string | undefined) || '')
    })()
    return () => { cancelled = true }
  }, [])

  const chosenExtras = EXTRAS.filter((x) => extras[x.key])
  const estimate = teamPrice(seats, term && isTeamTerm(term) ? term : 'month')
  const estimateLabel = term && isTeamTerm(term) ? TEAM_TERMS[term].per : 'per month'

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    const payload = {
      website: fd.get('website'), // honeypot, humans leave it empty
      seats,
      ...extras,
      term: term || null,
      contact_name: name,
      email,
      org_name: org,
      whatsapp,
      notes: message,
      wants_call: wantsCall,
    }
    setSending(true)
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.message ?? 'Something went wrong. Email lengamaps@gmail.com.'); return }
      setDone(true)
    } catch {
      setError('Network error. Try again, or email lengamaps@gmail.com.')
    } finally {
      setSending(false)
    }
  }

  const field: React.CSSProperties = {
    width: '100%', borderRadius: 12, padding: '11px 14px', fontSize: 14,
    background: T.fieldBg, border: T.fieldBorder, color: T.fieldText, outline: 'none',
  }
  const label: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
    textTransform: 'uppercase', color: T.label, marginBottom: 6,
  }

  if (done) {
    return (
      <div style={{ background: T.panelBg, border: T.panelBorder, borderRadius: 18, padding: '2rem 1.5rem', textAlign: 'center', color: T.text }}>
        <CheckCircle2 size={40} style={{ color: GOLD, margin: '0 auto' }} />
        <h3 style={{ fontSize: 22, fontWeight: 700, margin: '14px 0 8px' }}>Request received</h3>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: T.muted, margin: '0 auto', maxWidth: 440 }}>
          Thanks. We will reply within 1 business day with a quote and the next steps. A confirmation is on its way to your inbox.
        </p>
        <a
          href={BOOKING_URL} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18, padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 700, background: GOLD, color: '#1a1200', textDecoration: 'none' }}
        >
          <CalendarDays size={15} /> Want to talk sooner? Book a call
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ background: T.panelBg, border: T.panelBorder, borderRadius: 18, padding: '1.5rem', color: T.text }}>
      {/* Honeypot: real people never see or fill this. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ display: 'none' }} />

      <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Tell us what your team needs</h3>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: T.muted, margin: '6px 0 18px' }}>
        No price list. Tell us what you want and we send a quote within 1 business day. You do not need an account.
      </p>

      {/* Seats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>How many people need access?</span>
        <SeatStepper seats={seats} onChange={setSeats} dark={tone === 'dark'} />
      </div>

      {/* Extras */}
      <p style={{ ...label, marginTop: 20 }}>Anything extra? (tick what you want)</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {EXTRAS.map((x) => {
          const on = extras[x.key]
          return (
            <label key={x.key} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '10px 12px', borderRadius: 12,
              background: on ? T.chipOnBg : T.chipBg, border: on ? T.chipOnBorder : T.chipBorder,
            }}>
              <input
                type="checkbox" checked={on}
                onChange={(e) => setExtras((cur) => ({ ...cur, [x.key]: e.target.checked }))}
                style={{ marginTop: 3, accentColor: GOLD }}
              />
              <span>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{x.label}</span>
                <span style={{ display: 'block', fontSize: 12, color: T.muted, lineHeight: 1.4 }}>{x.hint}</span>
              </span>
            </label>
          )
        })}
      </div>

      {/* Term */}
      <div style={{ marginTop: 18 }}>
        <label style={label} htmlFor="tqb-term">How long do you need it? (optional)</label>
        <select id="tqb-term" value={term} onChange={(e) => setTerm(e.target.value as TeamTerm | '')} style={{ ...field, maxWidth: 260 }}>
          <option value="">Not sure yet</option>
          {TEAM_TERM_ORDER.map((t) => <option key={t} value={t}>{TEAM_TERMS[t].label}</option>)}
        </select>
      </div>

      {/* Your request so far */}
      <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 12, background: T.estimateBg, border: T.chipBorder, fontSize: 13.5, lineHeight: 1.6 }}>
        <strong>Your request so far</strong>
        <div style={{ color: T.muted }}>
          {seats} seats{chosenExtras.length ? `, plus ${chosenExtras.map((x) => x.label.toLowerCase()).join(', ')}` : ''}.
        </div>
        {SHOW_SEAT_ESTIMATE && (
          <div style={{ marginTop: 4 }}>
            Seats alone: about <strong>${estimate.toLocaleString()}</strong> {estimateLabel} (${TEAM_SEAT_PRICE} per seat per month).
            {chosenExtras.length > 0 && <span style={{ color: T.muted }}> Extras are quoted on top.</span>}
          </div>
        )}
      </div>

      {/* Who you are */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 20 }}>
        <div>
          <label style={label} htmlFor="tqb-name">Your name *</label>
          <input id="tqb-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} style={field} placeholder="Your name" />
        </div>
        <div>
          <label style={label} htmlFor="tqb-email">Email *</label>
          <input id="tqb-email" type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} style={field} placeholder="you@organisation.org" />
        </div>
        <div>
          <label style={label} htmlFor="tqb-org">Organisation (optional)</label>
          <input id="tqb-org" maxLength={200} value={org} onChange={(e) => setOrg(e.target.value)} style={field} placeholder="e.g. Zambezi Basin Water Programme" />
        </div>
        <div>
          <label style={label} htmlFor="tqb-wa">WhatsApp (optional)</label>
          <input id="tqb-wa" type="tel" inputMode="tel" maxLength={30} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={field} placeholder="+260 ..." />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={label} htmlFor="tqb-msg">Anything you want to tell us (optional)</label>
        <textarea
          id="tqb-msg" rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)}
          style={{ ...field, resize: 'vertical' }}
          placeholder="Your project, timelines, countries, datasets, how you would like to work with us. Write freely."
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 13.5, cursor: 'pointer' }}>
        <input type="checkbox" checked={wantsCall} onChange={(e) => setWantsCall(e.target.checked)} style={{ accentColor: GOLD }} />
        I would like a call about this
      </label>

      {error && <p style={{ marginTop: 14, fontSize: 13.5, color: '#f87171' }}>{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 18 }}>
        <button
          type="submit" disabled={sending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 26px', borderRadius: 12, fontSize: 14, fontWeight: 700, background: GOLD, color: '#1a1200', border: 'none', cursor: 'pointer', opacity: sending ? 0.6 : 1 }}
        >
          {sending && <Loader2 size={16} className="animate-spin" />}
          {sending ? 'Sending…' : 'Send my request'}
        </button>
        <a
          href={BOOKING_URL} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, color: T.text, border: T.chipBorder, textDecoration: 'none' }}
        >
          <CalendarDays size={16} /> Book a call
        </a>
      </div>
    </form>
  )
}
