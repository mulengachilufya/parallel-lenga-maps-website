'use client'

/**
 * /projects — "For Project Teams and Businesses"
 * (internal name: Lenga for Projects — title, name, and route are
 * intentionally different; do not "fix" them to match.)
 *
 * The quote-based team tier's front door. NO checkout anywhere on this page:
 * every CTA routes to the quote form, the form posts to /api/quotes, and
 * provisioning is manual. Pricing locked at the 2026-06-12 exec meeting:
 * flat $45/seat with two named bundles each carrying a $20/mo discount.
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Users, Globe2, Layers, History, KeyRound, FileCheck2,
  Crosshair, CheckCircle2, Loader2, ArrowRight, MapPin, Droplets,
  Mountain, Building2, FlaskConical, ShieldCheck,
} from 'lucide-react'
import { TEAM_BLOCKS, QUOTE_SECTORS, TEAM_TIER_TITLE } from '@/lib/teams'

const NAVY  = '#0D2B45'
const GOLD  = '#F5B800'

const IMG = {
  hero:    'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=2000&q=80&auto=format&fit=crop',
  night:   'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1400&q=75&auto=format&fit=crop',
  drought: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=1400&q=75&auto=format&fit=crop',
  river:   'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1400&q=75&auto=format&fit=crop',
}

export default function ProjectsPage() {
  const [isTeamMember, setIsTeamMember] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const [presetSeats, setPresetSeats] = useState<number | null>(null)

  useEffect(() => {
    // If the visitor already belongs to a provisioned team, surface the door
    // to their workspace instead of selling them what they already have.
    fetch('/api/team', { cache: 'no-store' })
      .then((r) => { if (r.ok) setIsTeamMember(true) })
      .catch(() => {})
  }, [])

  const jumpToForm = (seats: number | null) => {
    setPresetSeats(seats)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ background: NAVY }} className="text-white">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <Image
          src={IMG.hero} alt="Earth seen from orbit at night"
          fill priority sizes="100vw"
          className="object-cover opacity-35"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(13,43,69,0.55) 0%, rgba(13,43,69,0.92) 78%, #0D2B45 100%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20">
          <p className="text-xs font-bold uppercase tracking-[0.25em] mb-5" style={{ color: GOLD }}>
            Lenga Maps for teams
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] max-w-3xl">
            {TEAM_TIER_TITLE}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-blue-100">
            One workspace for your whole GIS team. Every dataset we publish, across all
            54 African countries, with a shared download history your teammates can
            actually trust: who pulled which layer, for which country, in which
            coordinate system and format.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button
              onClick={() => jumpToForm(null)}
              className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold transition-transform hover:-translate-y-0.5"
              style={{ background: GOLD, color: '#1a1200' }}
            >
              Get a quote <ArrowRight size={16} />
            </button>
            {isTeamMember && (
              <Link
                href="/team"
                className="inline-flex items-center gap-2 rounded-xl border border-blue-400/40 px-7 py-3.5 text-sm font-semibold text-blue-100 hover:border-[#F5B800]/70 hover:text-white transition-colors"
              >
                Open your team workspace
              </Link>
            )}
          </div>
          <p className="mt-5 text-sm text-blue-300">
            Quote-based. No checkout, no card. We provision your team within 1 business day.
          </p>
        </div>
      </section>

      {/* ── What the seat buys ───────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: Layers,     title: 'The full catalogue',        body: 'All 15 datasets across all 54 African countries. Boundaries, rivers, rainfall, LULC, soils, population, protected areas and more. This tier is never a reduced catalogue.' },
            { icon: History,    title: 'Shared download history',   body: 'Every pull is logged with dataset, country, CRS, format, who and when. New joiners see months of team context on day one.' },
            { icon: Crosshair,  title: 'Duplicate-pull warnings',   body: 'Opening a layer a teammate already downloaded? The workspace says so before you spend another download on it.' },
            { icon: KeyRound,   title: 'API access',                body: 'Programmatic access to the catalogue with per-minute rate limits and monthly quotas. Exclusive to team plans.' },
            { icon: MapPin,     title: 'Project area of operation', body: 'Set your operating countries once; the workspace keeps the whole team oriented on the same region.' },
            { icon: FileCheck2, title: 'Commercial licence',        body: 'Use the data in client deliverables and commercial work, plus custom sub-country datasets on request and direct email support.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-blue-800/60 bg-[#102f4e] p-6">
              <Icon size={22} style={{ color: GOLD }} />
              <h3 className="mt-4 text-base font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-blue-200">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Who it's for (sector strip with photography) ─────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h2 className="text-2xl sm:text-3xl font-extrabold">Built for teams working where it matters</h2>
        <p className="mt-3 max-w-2xl text-blue-200 text-sm leading-relaxed">
          Drought monitoring, groundwater programmes, mine permitting, settlement
          mapping: the work our buyers do is spatial, urgent, and shared. Lenga Maps
          keeps the data side boring so the project side can move.
        </p>

        <div className="mt-8 grid lg:grid-cols-2 gap-5">
          <figure className="relative rounded-2xl overflow-hidden min-h-[260px]">
            <Image src={IMG.drought} alt="Drylands under drought stress" fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
            <figcaption className="absolute inset-x-0 bottom-0 p-5" style={{ background: 'linear-gradient(0deg, rgba(13,43,69,0.95), transparent)' }}>
              <p className="text-sm font-bold">Drought &amp; water security</p>
              <p className="text-xs text-blue-200 mt-1">SPI-12 drought index, rainfall, aquifers and rivers for early warning and groundwater programmes.</p>
            </figcaption>
          </figure>
          <figure className="relative rounded-2xl overflow-hidden min-h-[260px]">
            <Image src={IMG.night} alt="City lights across the continent at night" fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
            <figcaption className="absolute inset-x-0 bottom-0 p-5" style={{ background: 'linear-gradient(0deg, rgba(13,43,69,0.95), transparent)' }}>
              <p className="text-sm font-bold">Infrastructure &amp; settlement</p>
              <p className="text-xs text-blue-200 mt-1">Population, roads and admin boundaries for siting, access planning and impact assessment.</p>
            </figcaption>
          </figure>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { icon: Mountain,      label: 'Mining' },
            { icon: Droplets,      label: 'Water' },
            { icon: ShieldCheck,   label: 'NGO / Development' },
            { icon: Building2,     label: 'Government' },
            { icon: FlaskConical,  label: 'Research' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5 rounded-xl border border-blue-800/60 bg-[#102f4e] px-4 py-3">
              <Icon size={16} style={{ color: GOLD }} />
              <span className="text-xs font-semibold text-blue-100">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── The GIS facts (what a senior GIS reviewer wants stated) ──── */}
      <section className="border-y border-blue-800/50 bg-[#0a2238]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl font-extrabold">Data your GIS lead won&apos;t have to argue with</h2>
            <ul className="mt-6 space-y-4 text-sm leading-relaxed text-blue-100">
              <li className="flex gap-3">
                <Globe2 size={18} className="shrink-0 mt-0.5" style={{ color: GOLD }} />
                <span><strong className="text-white">One CRS, stated everywhere.</strong> Every layer ships in EPSG:4326 (WGS84) and the workspace shows the CRS on every download record, because projection mismatches are how team GIS projects quietly fall apart.</span>
              </li>
              <li className="flex gap-3">
                <Layers size={18} className="shrink-0 mt-0.5" style={{ color: GOLD }} />
                <span><strong className="text-white">Formats teams actually use.</strong> Shapefile, GeoJSON and KML for vectors; GeoTIFF for rasters; QGIS symbology included where it helps.</span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: GOLD }} />
                <span><strong className="text-white">Country-complete coverage.</strong> Each dataset is clipped, validated and packaged per country, all 54, islands included.</span>
              </li>
              <li className="flex gap-3">
                <Users size={18} className="shrink-0 mt-0.5" style={{ color: GOLD }} />
                <span><strong className="text-white">Sources you can cite.</strong> GADM, HydroSHEDS, ESA WorldCover, CHIRPS, WorldPop, ISRIC, WDPA lineage, with attribution preserved for your reports.</span>
              </li>
            </ul>
          </div>
          <figure className="relative rounded-2xl overflow-hidden min-h-[320px]">
            <Image src={IMG.river} alt="Aerial view of a winding river system" fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
          </figure>
        </div>
      </section>

      {/* ── Pricing blocks ───────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Simple per-seat pricing</h2>
        <p className="mt-3 text-center text-blue-200 text-sm">
          Flat $45 per seat. The two team bundles carry a built-in $20/mo discount.
        </p>

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {TEAM_BLOCKS.map((b) => (
            <div
              key={b.id}
              className="flex flex-col rounded-2xl border bg-[#102f4e] p-7"
              style={{ borderColor: b.id === 'team-10' ? GOLD : 'rgba(30,95,142,0.55)' }}
            >
              {b.id === 'team-10' && (
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>Most popular</p>
              )}
              <h3 className="text-lg font-bold">{b.label}</h3>
              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="text-4xl font-extrabold">{b.price}</span>
                {b.original && (
                  <span className="text-sm text-blue-300">
                    (instead of <s className="opacity-80">{b.original}</s>)
                  </span>
                )}
              </div>
              {/* $45/seat appears ONLY on the Custom block by design. */}
              {b.perSeat && (
                <p className="mt-1 text-xs text-blue-300">Full rate, any team size.</p>
              )}
              <p className="mt-4 text-sm leading-relaxed text-blue-200">{b.blurb}</p>

              <div className="mt-5 rounded-xl border border-blue-800/60 bg-[#0a2238] px-4 py-3">
                <p className="text-xs font-semibold leading-relaxed" style={{ color: GOLD }}>
                  Includes the FULL dataset catalogue: all 15 datasets across all 54 African countries.
                </p>
              </div>

              <ul className="mt-5 space-y-2 text-[13px] text-blue-100 flex-1">
                <li className="flex gap-2"><CheckCircle2 size={15} className="shrink-0 mt-0.5" style={{ color: GOLD }} /> Shared team workspace &amp; download history</li>
                <li className="flex gap-2"><CheckCircle2 size={15} className="shrink-0 mt-0.5" style={{ color: GOLD }} /> Owner-managed seats</li>
                <li className="flex gap-2"><CheckCircle2 size={15} className="shrink-0 mt-0.5" style={{ color: GOLD }} /> API access with rate limits</li>
                <li className="flex gap-2"><CheckCircle2 size={15} className="shrink-0 mt-0.5" style={{ color: GOLD }} /> Commercial use licence</li>
                <li className="flex gap-2"><CheckCircle2 size={15} className="shrink-0 mt-0.5" style={{ color: GOLD }} /> Custom sub-country datasets on request</li>
              </ul>

              <button
                onClick={() => jumpToForm(b.seats)}
                className="mt-7 w-full rounded-xl py-3 text-sm font-bold transition-transform hover:-translate-y-0.5"
                style={{ background: GOLD, color: '#1a1200' }}
              >
                Get a quote
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Quote form ───────────────────────────────────────────────── */}
      <div ref={formRef}>
        <QuoteForm presetSeats={presetSeats} />
      </div>
    </div>
  )
}

// ── Quote form ────────────────────────────────────────────────────────────

function QuoteForm({ presetSeats }: { presetSeats: number | null }) {
  const [seats, setSeats] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (presetSeats != null) setSeats(String(presetSeats))
  }, [presetSeats])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    const payload = Object.fromEntries(fd.entries())
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

  if (done) {
    return (
      <section className="border-t border-blue-800/50 bg-[#0a2238]">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <CheckCircle2 size={44} className="mx-auto" style={{ color: GOLD }} />
          <h2 className="mt-5 text-2xl font-extrabold text-white">Request received</h2>
          <p className="mt-3 text-blue-200 text-sm leading-relaxed">
            Thanks. We&apos;ll be in touch within 1 business day with your quote and
            the steps to get your team provisioned. A confirmation is on its way to
            your inbox.
          </p>
        </div>
      </section>
    )
  }

  const field = 'w-full rounded-xl border border-blue-800/70 bg-[#0D2B45] px-4 py-3 text-sm text-white placeholder:text-blue-400/70 focus:outline-none focus:border-[#F5B800]/70'
  const label = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

  return (
    <section className="border-t border-blue-800/50 bg-[#0a2238]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Tell us about your team</h2>
        <p className="mt-3 text-sm text-blue-200 leading-relaxed">
          No payment is taken on the site for team plans. We reply with a quote within
          1 business day, then provision your workspace once you confirm.
        </p>

        <form onSubmit={submit} className="mt-9 grid sm:grid-cols-2 gap-5">
          {/* Honeypot — humans never see or fill this. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          <div className="sm:col-span-2">
            <label className={label} htmlFor="org_name">Organisation / project name *</label>
            <input id="org_name" name="org_name" required maxLength={200} className={field} placeholder="e.g. Zambezi Basin Water Programme" />
          </div>
          <div>
            <label className={label} htmlFor="contact_name">Contact name</label>
            <input id="contact_name" name="contact_name" maxLength={200} className={field} placeholder="Your name" />
          </div>
          <div>
            <label className={label} htmlFor="email">Work email *</label>
            <input id="email" name="email" type="email" required maxLength={200} className={field} placeholder="you@organisation.org" />
          </div>
          <div>
            <label className={label} htmlFor="sector">Sector</label>
            <select id="sector" name="sector" className={field} defaultValue="">
              <option value="" disabled>Select a sector</option>
              {QUOTE_SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="region">Country / region of operation</label>
            <input id="region" name="region" maxLength={200} className={field} placeholder="e.g. Zambia and Malawi" />
          </div>
          <div>
            <label className={label} htmlFor="seats">GIS people / seats needed</label>
            <input id="seats" name="seats" type="number" min={1} max={10000} value={seats} onChange={(e) => setSeats(e.target.value)} className={field} placeholder="e.g. 5" />
          </div>
          <div>
            <label className={label} htmlFor="datasets_interest">Datasets of interest</label>
            <input id="datasets_interest" name="datasets_interest" maxLength={1000} className={field} placeholder="e.g. rainfall, aquifers, LULC" />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="notes">Anything else?</label>
            <textarea id="notes" name="notes" rows={4} maxLength={2000} className={field} placeholder="Project timelines, custom data needs, procurement requirements…" />
          </div>

          {error && (
            <p className="sm:col-span-2 text-sm text-red-300">{error}</p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit" disabled={sending}
              className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold disabled:opacity-60"
              style={{ background: GOLD, color: '#1a1200' }}
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : null}
              {sending ? 'Sending…' : 'Request a quote'}
            </button>
            <p className="mt-3 text-xs text-blue-400">
              We&apos;ll be in touch within 1 business day.
            </p>
          </div>
        </form>
      </div>
    </section>
  )
}
