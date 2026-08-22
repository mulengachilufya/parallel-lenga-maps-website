'use client'

/**
 * /projects — "For Project Teams and Businesses"
 * (internal name: Lenga for Projects — title, name, and route are
 * intentionally different; do not "fix" them to match.)
 *
 * Layout & design language:
 *   Hero (navy, satellite photo)
 *     → WHITE pricing section with Lenga logo, main /pricing font styles
 *       (inline 48px price, 13px tracked uppercase label), and a glowing
 *       "ALL 15 DATASETS" badge above the 3 cards.
 *     → Industries (full-bleed home-page style: 4 photos at h-[480px],
 *       free-floating with gold rule + uppercase tracked label, no boxes).
 *     → Feature cards
 *     → GIS facts text
 *     → Quote form
 *
 * Pricing: flat $45/seat, once-off, 2-seat minimum — $5 below the $50
 * Individual plan per seat. No checkout, ever — every CTA routes to the
 * quote form.
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Users, Globe2, Layers, History, KeyRound, FileCheck2,
  Crosshair, CheckCircle2, Loader2, ArrowRight, MapPin, Droplets,
  Mountain, Building2, FlaskConical, ShieldCheck, Calculator, Sparkles,
  Phone, Mail, MessageCircle, Zap,
} from 'lucide-react'
import { TEAM_BLOCKS, QUOTE_SECTORS, TEAM_TIER_TITLE, TEAM_SEAT_PRICE, TEAM_MIN_SEATS } from '@/lib/teams'

const NAVY = '#0D2B45'
const GOLD = '#F5B800'

const IMG = {
  hero:    'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=2000&q=80&auto=format&fit=crop',
  water:   '/images/branding/beautiful-african-women-having-fun-while-fetching-water.jpg',
  ngo:     '/images/branding/african-kids-enjoying-life.jpg',
  forest:  '/images/branding/forest.jpg',
  soil:    '/images/branding/soil.jpg',
  logo:    '/images/branding/logo.png',
}

// The full 15 — what the glowing banner advertises and what the
// pricing block dataset chips render. Colors picked from the existing
// catalogue palette in src/lib/supabase.ts so chips read as Lenga datasets,
// not generic tags.
const ALL_DATASETS: { name: string; color: string }[] = [
  { name: 'Administrative Boundaries', color: '#3B6D11' },
  { name: 'Transboundary Aquifers',    color: '#155E75' },
  { name: 'Drought Index (SPI-12)',    color: '#B45309' },
  { name: 'Rainfall & Climate',        color: '#185FA5' },
  { name: 'Protected Areas',           color: '#115E59' },
  { name: 'Watershed Boundaries',      color: '#0E7490' },
  { name: 'Population & Settlements',  color: '#7C2D12' },
  { name: 'River Networks',            color: '#1D4ED8' },
  { name: 'Roads & Infrastructure',    color: '#52525B' },
  { name: 'Temperature',               color: '#9F1239' },
  { name: 'HydroRIVERS',               color: '#0369A1' },
  { name: 'Land Use / Land Cover',     color: '#15803D' },
  { name: 'Lakes',                     color: '#0284C7' },
  { name: 'Soil Classification',       color: '#78350F' },
  { name: 'Wetlands & Floodplains',    color: '#155E63' },
]

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
    <>
      {/* Local styles: copies the main /pricing card font metrics
          (48px price, 13px tracked uppercase label, 12.5px dataset rows)
          and adds the glowing-banner animation. */}
      <style>{`
        @keyframes lengaGlow {
          0%, 100% { box-shadow: 0 0 0 1px rgba(245,184,0,0.5), 0 0 30px rgba(245,184,0,0.35), 0 0 60px rgba(245,184,0,0.18); }
          50%      { box-shadow: 0 0 0 1px rgba(245,184,0,0.8), 0 0 45px rgba(245,184,0,0.6),  0 0 90px rgba(245,184,0,0.30); }
        }
        .lm-glow {
          animation: lengaGlow 3.2s ease-in-out infinite;
        }
        .lm-card {
          text-decoration: none;
          display: flex;
          flex-direction: column;
          min-height: 580px;
          border-radius: 16px;
          padding: 1.75rem 1.5rem 1.75rem;
          transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
        }
        .lm-card:hover {
          transform: translateY(-6px);
          filter: brightness(1.02);
          box-shadow: 0 14px 36px rgba(13,43,69,0.18);
        }
        .lm-featured {
          /* Subtle gold halo on the popular block. */
          box-shadow: 0 8px 28px rgba(13,43,69,0.18), 0 0 0 2px rgba(245,184,0,0.5);
        }
        .lm-featured:hover {
          box-shadow: 0 18px 44px rgba(13,43,69,0.25), 0 0 0 2px rgba(245,184,0,0.7);
        }
        .lm-name {
          font-size: 13px; font-weight: 500; letter-spacing: 0.08em;
          text-transform: uppercase; margin-bottom: 0.5rem;
        }
        .lm-price-row {
          display: flex; align-items: baseline; gap: 8px; margin-bottom: 0.5rem; flex-wrap: wrap;
        }
        .lm-price { font-size: 48px; line-height: 1; font-weight: 400; }
        .lm-period { font-size: 13px; }
        .lm-instead { font-size: 13px; opacity: 0.8; }
        .lm-blurb { font-size: 13px; line-height: 1.5; margin: 0.5rem 0 1.1rem; }
        .lm-divider { height: 0.5px; opacity: 0.2; margin: 0 0 1rem; }
        .lm-feat-label {
          font-size: 11px; font-weight: 500; letter-spacing: 0.06em;
          text-transform: uppercase; margin-bottom: 0.6rem;
        }
        .lm-feat-row {
          font-size: 12.5px; padding: 3px 0;
          display: flex; align-items: flex-start; gap: 7px; line-height: 1.4;
        }
        .lm-cta {
          margin-top: auto; padding-top: 1.25rem;
        }
        .lm-cta-btn {
          width: 100%; padding: 11px 0; border-radius: 10px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          border: none; transition: filter 0.18s ease;
        }
        .lm-cta-btn:hover { filter: brightness(1.06); }
        @media (max-width: 920px) {
          .lm-grid { grid-template-columns: 1fr !important; }
          .lm-card { min-height: 0 !important; }
        }
      `}</style>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden text-white" style={{ background: NAVY }}>
        <Image
          src={IMG.hero} alt="Earth seen from orbit at night"
          fill priority sizes="100vw"
          className="object-cover"
        />
        {/* Light top so the satellite shows; left scrim for legibility;
            bottom hard-cut so we hand off cleanly to the white pricing band. */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(13,43,69,0.15) 0%, rgba(13,43,69,0.30) 55%, rgba(13,43,69,0.92) 92%, #0D2B45 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(13,43,69,0.65) 0%, rgba(13,43,69,0.25) 45%, rgba(13,43,69,0) 70%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24">
          <span
            className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-5 block"
            style={{ color: GOLD }}
          >
            Lenga Maps for Teams
          </span>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-[4.25rem] font-bold leading-[1.05] max-w-3xl">
            {TEAM_TIER_TITLE}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/85">
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
                className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-7 py-3.5 text-sm font-semibold text-white hover:border-[#F5B800]/80 hover:bg-white/5 transition-colors"
              >
                Open your team workspace
              </Link>
            )}
          </div>
          <p className="mt-5 text-sm text-white/60">
            Quote-based. No checkout, no card. We provision your team within 1 business day.
          </p>
        </div>
      </section>

      {/* ── Pricing (WHITE) — main /pricing font + glowing dataset banner ─ */}
      <PricingSection onQuote={jumpToForm} />

      {/* ── Quote form — primary CTA, sits directly below pricing ──── */}
      <div ref={formRef}>
        <QuoteForm presetSeats={presetSeats} />
      </div>

      {/* ── Urgent contact — secondary path for businesses in a rush ─ */}
      <UrgentContact />

      {/* ── Industries (FULL-BLEED, home-page style) ───────────────── */}
      <IndustriesSection />

      {/* ── What the seat buys ───────────────────────────────────────── */}
      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <span
            className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-4 block"
            style={{ color: '#854F0B' }}
          >
            Built for teams
          </span>
          <h2 className="font-display text-4xl sm:text-5xl font-bold mb-10" style={{ color: NAVY }}>
            What every seat unlocks.
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Layers,     title: 'The full catalogue',        body: 'All 15 datasets across all 54 African countries. Boundaries, rivers, rainfall, LULC, soils, population, protected areas and more. This tier is never a reduced catalogue.' },
              { icon: History,    title: 'Shared download history',   body: 'Every pull is logged with dataset, country, CRS, format, who and when. New joiners see months of team context on day one.' },
              { icon: Crosshair,  title: 'Duplicate-pull warnings',   body: 'Opening a layer a teammate already downloaded? The workspace says so before you spend another download on it.' },
              { icon: KeyRound,   title: 'API access',                body: 'Programmatic access to the catalogue with per-minute rate limits and monthly quotas. Exclusive to team plans.' },
              { icon: MapPin,     title: 'Project area of operation', body: 'Set your operating countries once; the workspace keeps the whole team oriented on the same region.' },
              { icon: FileCheck2, title: 'Commercial licence',        body: 'Use the data in client deliverables and commercial work, plus custom sub-country datasets on request and direct email support.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,184,0,0.12)' }}>
                  <Icon size={20} style={{ color: '#854F0B' }} />
                </div>
                <h3 className="mt-4 text-base font-bold" style={{ color: NAVY }}>{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GIS facts (dark, condensed text block) ───────────────────── */}
      <section style={{ background: NAVY }} className="text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <span
            className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-4 block"
            style={{ color: GOLD }}
          >
            For your GIS lead
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold">Data that won&apos;t start arguments.</h2>
          <ul className="mt-7 space-y-4 text-[15px] leading-relaxed text-white/85">
            <li className="flex gap-3"><Globe2 size={18} className="shrink-0 mt-0.5" style={{ color: GOLD }} /><span><strong className="text-white">One CRS, stated everywhere.</strong> Every layer ships in EPSG:4326 (WGS84) and the workspace shows the CRS on every download record, because projection mismatches are how team GIS projects quietly fall apart.</span></li>
            <li className="flex gap-3"><Layers size={18} className="shrink-0 mt-0.5" style={{ color: GOLD }} /><span><strong className="text-white">Formats teams actually use.</strong> Shapefile, GeoJSON and KML for vectors; GeoTIFF for rasters; QGIS symbology included where it helps.</span></li>
            <li className="flex gap-3"><CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: GOLD }} /><span><strong className="text-white">Country-complete coverage.</strong> Each dataset is clipped, validated and packaged per country, all 54, islands included.</span></li>
            <li className="flex gap-3"><Users size={18} className="shrink-0 mt-0.5" style={{ color: GOLD }} /><span><strong className="text-white">Sources you can cite.</strong> GADM, HydroSHEDS, ESA WorldCover, CHIRPS, WorldPop, ISRIC, WDPA lineage, with attribution preserved for your reports.</span></li>
          </ul>
        </div>
      </section>

    </>
  )
}

// ── Pricing section ───────────────────────────────────────────────────────
// WHITE background. Mirrors the main /pricing card font metrics (inline
// styles, 48px price, 13px tracked uppercase label). Logo + tracked label
// at top; glowing "ALL 15 DATASETS" banner above the cards so the catalogue
// is impossible to miss. Three blocks: 3 seats / 10 seats (FEATURED, navy)
// / Custom (cream with calculator).

interface CardPalette {
  bg: string; border: string; nameColor: string; priceColor: string
  text: string; muted: string; dotColor: string; dividerColor: string
  btnBg: string; btnColor: string; ledgerBg: string; ledgerText: string
}

const PALETTE_CREAM: CardPalette = {
  bg: '#FAEEDA', border: '#EF9F27', nameColor: '#854F0B', priceColor: '#633806',
  text: '#1a1a1a', muted: '#5a4a2a', dotColor: '#854F0B', dividerColor: '#854F0B',
  btnBg: '#854F0B', btnColor: '#ffffff',
  ledgerBg: 'rgba(255,255,255,0.65)', ledgerText: '#5a4a2a',
}
const PALETTE_NAVY: CardPalette = {
  bg: NAVY, border: GOLD, nameColor: GOLD, priceColor: '#ffffff',
  text: '#ffffff', muted: 'rgba(255,255,255,0.75)', dotColor: GOLD, dividerColor: GOLD,
  btnBg: GOLD, btnColor: '#1a1200',
  ledgerBg: 'rgba(255,255,255,0.08)', ledgerText: 'rgba(255,255,255,0.85)',
}

function PricingSection({ onQuote }: { onQuote: (seats: number | null) => void }) {
  return (
    <section style={{ background: '#FAFAF7' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">

        {/* Logo + label */}
        <div className="flex flex-col items-center text-center">
          <Image
            src={IMG.logo} alt="Lenga Maps" width={56} height={56}
            className="mb-5" priority unoptimized
          />
          <span
            className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-4"
            style={{ color: '#854F0B' }}
          >
            Team pricing
          </span>
          <h2 className="font-display" style={{ fontSize: '48px', fontWeight: 700, lineHeight: 1.08, color: NAVY, margin: '0 0 1rem' }}>
            One seat price. Paid once.
          </h2>
          <p style={{ fontSize: '17px', color: '#444', margin: 0, maxWidth: '580px', lineHeight: 1.5 }}>
            $45 per seat — $5 less than paying for each teammate on an Individual plan.
            2-seat minimum. All 54 African countries, every dataset, no expiry.
          </p>
        </div>

        {/* ── Glowing ALL 15 DATASETS banner ─────────────────────────── */}
        <div
          className="lm-glow mt-12 rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #0D2B45 0%, #102f4e 50%, #0a2238 100%)', padding: '1.5rem 1.5rem 1.25rem' }}
        >
          <div className="flex items-center justify-center gap-2 mb-3.5">
            <Sparkles size={16} style={{ color: GOLD }} />
            <span className="text-[0.72rem] font-extrabold tracking-[0.22em] uppercase" style={{ color: GOLD }}>
              Every team plan unlocks all 15 datasets
            </span>
            <Sparkles size={16} style={{ color: GOLD }} />
          </div>
          <p className="text-center text-sm mb-4" style={{ color: 'rgba(255,255,255,0.78)' }}>
            Across all 54 African countries — boundaries, hydrology, climate, land, soils, infrastructure, more.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {ALL_DATASETS.map((d) => (
              <span
                key={d.name}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.92)',
                }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: d.color, boxShadow: `0 0 6px ${d.color}` }} />
                {d.name}
              </span>
            ))}
          </div>
        </div>

        {/* ── Card ──────────────────────────────────────────────────── */}
        <div className="mt-10 flex justify-center">
          <div
            className="lm-card"
            style={{ background: PALETTE_NAVY.bg, border: `1px solid ${PALETTE_NAVY.border}`, color: PALETTE_NAVY.text, maxWidth: '440px', width: '100%' }}
          >
            {/* Once-off callout — this is the thing people must not miss. */}
            <div
              className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-5"
              style={{ background: 'rgba(245,184,0,0.14)', border: `1.5px solid ${GOLD}` }}
            >
              <ShieldCheck size={20} style={{ color: GOLD, flexShrink: 0 }} />
              <span className="font-display text-[15px] font-bold leading-snug" style={{ color: GOLD }}>
                Paid once. Access never expires. Not a subscription.
              </span>
            </div>

            <div className="lm-name" style={{ color: PALETTE_NAVY.nameColor }}>{TEAM_BLOCKS[0].label}</div>

            <div className="lm-price-row">
              <span className="lm-price" style={{ color: PALETTE_NAVY.priceColor }}>${TEAM_SEAT_PRICE}</span>
              <span className="lm-period" style={{ color: PALETTE_NAVY.muted }}>/seat, once-off</span>
            </div>
            <p className="lm-period" style={{ color: PALETTE_NAVY.muted, margin: 0 }}>{TEAM_MIN_SEATS}-seat minimum.</p>

            <p className="lm-blurb" style={{ color: PALETTE_NAVY.muted }}>{TEAM_BLOCKS[0].blurb}</p>

            <div className="lm-divider" style={{ background: PALETTE_NAVY.dividerColor }} />

            <SeatCalculator palette={PALETTE_NAVY} />

            <div className="lm-feat-label" style={{ color: PALETTE_NAVY.muted }}>What you get</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
              {[
                'Shared team workspace & download history',
                'Owner-managed seats',
                'API access with rate limits',
                'Commercial use licence',
                'Custom sub-country datasets on request',
              ].map((row) => (
                <li key={row} className="lm-feat-row" style={{ color: PALETTE_NAVY.text }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: PALETTE_NAVY.dotColor, flexShrink: 0, marginTop: 6, display: 'inline-block' }} />
                  {row}
                </li>
              ))}
            </ul>

            <div className="lm-cta">
              <button
                onClick={() => onQuote(null)}
                className="lm-cta-btn"
                style={{ background: PALETTE_NAVY.btnBg, color: PALETTE_NAVY.btnColor }}
              >
                Get a quote
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-7">
          Quote-based. We provision your team manually within 1 business day. No card needed.
        </p>
      </div>
    </section>
  )
}

// Curiosity calculator: type a seat count, see the once-off total instantly
// at the flat $45/seat rate. Pure display math — the real number is still
// confirmed on the quote. Honors the card palette so it doesn't fight the
// cream/navy backgrounds.
function SeatCalculator({ palette }: { palette: CardPalette }) {
  const [seats, setSeats] = useState(TEAM_MIN_SEATS)
  const total = Math.max(0, seats) * TEAM_SEAT_PRICE
  const onCream = palette === PALETTE_CREAM

  return (
    <div
      className="rounded-xl p-4 mb-5"
      style={{
        background: onCream ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${onCream ? 'rgba(133,79,11,0.35)' : 'rgba(245,184,0,0.45)'}`,
      }}
    >
      <label htmlFor="seat-calc" className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide" style={{ color: palette.nameColor }}>
        <Calculator size={14} /> Estimate your total
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button" aria-label="Fewer seats"
          onClick={() => setSeats((s) => Math.max(TEAM_MIN_SEATS, s - 1))}
          className="h-9 w-9 shrink-0 rounded-lg text-lg font-bold transition-colors"
          style={{
            border: `1px solid ${onCream ? '#85571B' : 'rgba(255,255,255,0.25)'}`,
            color: palette.text, background: 'transparent',
          }}
        >
          −
        </button>
        <input
          id="seat-calc" type="number" min={TEAM_MIN_SEATS} max={100000} value={seats}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            setSeats(Number.isNaN(n) ? 0 : n)
          }}
          className="w-full rounded-lg px-3 py-2 text-center text-lg font-bold focus:outline-none"
          style={{
            background: onCream ? '#fff' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${onCream ? '#85571B' : 'rgba(255,255,255,0.25)'}`,
            color: palette.text,
          }}
        />
        <button
          type="button" aria-label="More seats"
          onClick={() => setSeats((s) => s + 1)}
          className="h-9 w-9 shrink-0 rounded-lg text-lg font-bold transition-colors"
          style={{
            border: `1px solid ${onCream ? '#85571B' : 'rgba(255,255,255,0.25)'}`,
            color: palette.text, background: 'transparent',
          }}
        >
          +
        </button>
      </div>
      {seats < TEAM_MIN_SEATS && seats > 0 && (
        <p className="mt-2 text-xs" style={{ color: onCream ? '#a15c1f' : '#ffcf6b' }}>
          {TEAM_MIN_SEATS}-seat minimum applies.
        </p>
      )}
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-xs" style={{ color: palette.muted }}>
          {Math.max(1, seats)} {Math.max(1, seats) === 1 ? 'seat' : 'seats'} × ${TEAM_SEAT_PRICE}
        </span>
        <span className="text-2xl font-extrabold tabular-nums" style={{ color: palette.priceColor }}>
          ${total.toLocaleString()}
          <span className="text-sm font-normal" style={{ color: palette.muted }}> once-off</span>
        </span>
      </div>
    </div>
  )
}

// ── Industries — home-page photo style ────────────────────────────────────
// Free-floating, large (h-[480px]), full-bleed photos in a 2×2 grid.
// Mirrors the home page's Orbit×Ground treatment: gold rule + uppercase
// tracked label, big white headline, body copy, subtle gradient.

function IndustriesSection() {
  const rows: { img: string; alt: string; eyebrow: string; title: string; body: string }[][] = [
    [
      {
        img: IMG.water, alt: 'Women collecting water',
        eyebrow: 'Water & Sanitation',
        title: 'Where the water actually is.',
        body: 'Rainfall, drought index, transboundary aquifers and river networks for groundwater programmes and early-warning work.',
      },
      {
        img: IMG.ngo, alt: 'Children in a rural community',
        eyebrow: 'NGO & Development',
        title: 'For the work that reaches people.',
        body: 'Population, settlements, roads and admin boundaries for siting clinics, schools, food programmes and access planning.',
      },
    ],
    [
      {
        img: IMG.forest, alt: 'Dense forest canopy',
        eyebrow: 'Environment & Climate',
        title: 'Catch the changes early.',
        body: 'Land cover, protected areas, wetlands and floodplains for conservation, climate, and impact assessments across the continent.',
      },
      {
        img: IMG.soil, alt: 'Tilled agricultural soil',
        eyebrow: 'Agriculture & Land',
        title: 'Ground truth for the ground.',
        body: 'Soil classification, land use and watershed data for cropping decisions, land-use planning and sustainable agriculture.',
      },
    ],
  ]

  return (
    <section className="relative overflow-hidden" style={{ background: '#0a121c' }}>
      {/* Heading band */}
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-12 pt-20 pb-12 text-center">
        <span
          className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-5 block"
          style={{ color: GOLD }}
        >
          Who it&apos;s for
        </span>
        <h2 className="font-display text-white font-bold text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] tracking-tight">
          Our GIS data powers <span style={{ color: GOLD }}>different industries.</span>
        </h2>
        <p className="mt-5 text-white/75 text-[1.05rem] leading-[1.6] max-w-2xl mx-auto">
          From water security to agriculture, the same catalogue serves the teams
          making real decisions on the ground across Africa.
        </p>
      </div>

      {/* Two rows of full-bleed photo halves — home-page Orbit×Ground style */}
      {rows.map((row, i) => (
        <div key={i} className="grid lg:grid-cols-2 border-t border-white/[0.06]">
          {row.map((cell) => (
            <div key={cell.eyebrow} className="relative h-[420px] lg:h-[520px] overflow-hidden group">
              <Image
                src={cell.img} alt={cell.alt} fill
                sizes="(max-width:1024px) 100vw, 50vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                style={{ filter: 'brightness(0.68) saturate(1.08)' }}
                unoptimized
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, transparent 30%, rgba(10,18,28,0.72) 100%)' }} />
              <div className="absolute inset-0 flex items-end p-8 lg:p-14">
                <div className="max-w-xl">
                  <span
                    className="font-display text-[0.85rem] font-bold tracking-[0.14em] uppercase mb-3 block"
                    style={{ color: GOLD }}
                  >
                    {cell.eyebrow}
                  </span>
                  <h3 className="font-extrabold text-white text-[1.65rem] lg:text-[2rem] leading-tight">
                    {cell.title}
                  </h3>
                  <p className="mt-4 text-white/85 text-[1.05rem] leading-[1.6] font-medium">
                    {cell.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Sector chip strip below the photos */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { icon: Mountain,     label: 'Mining' },
            { icon: Droplets,     label: 'Water' },
            { icon: ShieldCheck,  label: 'NGO / Development' },
            { icon: Building2,    label: 'Government' },
            { icon: FlaskConical, label: 'Research' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3">
              <Icon size={16} style={{ color: GOLD }} />
              <span className="text-xs font-semibold text-white/90">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Urgent contact band ──────────────────────────────────────────────────
// Secondary path for businesses on a deadline. The form above is the
// preferred channel (sets a quote_request row, gives us context). This
// section is visible but visually narrower — a single navy card with gold
// accents — so it never competes with the primary CTA above. Two real
// businesses have already reached out by phone/email, so this exists
// because the need exists, not because we want to dilute the form.
function UrgentContact() {
  const tracks = [
    {
      icon: MessageCircle,
      label: 'WhatsApp & Calls',
      value: '+260 965 699 359',
      href:  'https://wa.me/260965699359?text=Hi%20Lenga%20Maps%2C%20we%20need%20datasets%20urgently.',
      hint:  'Fastest. Message or call.',
    },
    {
      icon: Phone,
      label: 'Calls only',
      value: '+260 779 187 025',
      href:  'tel:+260779187025',
      hint:  'Voice only, weekdays.',
    },
    {
      icon: Mail,
      label: 'Direct email',
      value: 'mulenga@lengamaps.com',
      href:  'mailto:mulenga@lengamaps.com?subject=Urgent%3A%20Team%20Data%20Request',
      hint:  'Founder inbox.',
    },
  ]

  return (
    <section className="bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #0D2B45 0%, #102f4e 60%, #0a2238 100%)',
            border: `1px solid rgba(245,184,0,0.45)`,
            boxShadow: '0 10px 32px rgba(13,43,69,0.18), 0 0 0 1px rgba(245,184,0,0.12)',
          }}
        >
          <div className="px-6 sm:px-10 py-8 sm:py-9 grid lg:grid-cols-[1fr_1.6fr] gap-8 items-center">
            {/* Left: pitch */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <Zap size={16} style={{ color: GOLD }} />
                <span className="text-[0.7rem] font-bold tracking-[0.22em] uppercase" style={{ color: GOLD }}>
                  In a rush?
                </span>
              </div>
              <h3 className="text-white font-extrabold text-2xl sm:text-[1.7rem] leading-tight">
                Need our datasets urgently?
              </h3>
              <p className="mt-3 text-white/75 text-sm leading-relaxed">
                A couple of teams already reached out by phone instead of the form
                because they needed turnaround the same day. If you&apos;re on a
                deadline, get us directly:
              </p>
            </div>

            {/* Right: contact methods */}
            <div className="grid sm:grid-cols-3 gap-3">
              {tracks.map(({ icon: Icon, label, value, href, hint }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="group rounded-xl p-4 transition-all hover:-translate-y-0.5"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(245,184,0,0.25)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={16} style={{ color: GOLD }} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
                      {label}
                    </span>
                  </div>
                  <div className="text-white text-sm font-bold group-hover:text-[#F5B800] transition-colors break-all">
                    {value}
                  </div>
                  <div className="mt-1 text-[11px] text-white/55">{hint}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
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
      <section className="bg-white">
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <CheckCircle2 size={44} className="mx-auto" style={{ color: '#854F0B' }} />
          <h2 className="mt-5 text-2xl font-extrabold" style={{ color: NAVY }}>Request received</h2>
          <p className="mt-3 text-gray-600 text-sm leading-relaxed">
            Thanks. We&apos;ll be in touch within 1 business day with your quote and
            the steps to get your team provisioned. A confirmation is on its way to
            your inbox.
          </p>
        </div>
      </section>
    )
  }

  const field = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#854F0B]'
  const label = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5'

  return (
    <section className="bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
        <span
          className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-4 block"
          style={{ color: '#854F0B' }}
        >
          Get started
        </span>
        <h2 className="font-display text-4xl sm:text-5xl font-bold" style={{ color: NAVY }}>
          Reach out to get started.
        </h2>
        <p className="mt-3 text-sm text-gray-600 leading-relaxed max-w-xl">
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
            <p className="sm:col-span-2 text-sm text-red-600">{error}</p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit" disabled={sending}
              className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold disabled:opacity-60 transition-transform hover:-translate-y-0.5"
              style={{ background: GOLD, color: '#1a1200' }}
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : null}
              {sending ? 'Sending…' : 'Request a quote'}
            </button>
            <p className="mt-3 text-xs text-gray-500">
              We&apos;ll be in touch within 1 business day.
            </p>
          </div>
        </form>
      </div>
    </section>
  )
}
