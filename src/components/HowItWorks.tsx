'use client'

/**
 * Home page: how the workspace works, as a simple left-to-right flow
 * (top-to-bottom on phones) that anyone can follow. Four stations, each
 * with a small drawing of what you actually see, joined by arrows:
 *   Lenga data → your project map → your team → your delivery.
 */

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Database, Map as MapIcon, MessageSquare, History } from 'lucide-react'

const STEPS = [
  {
    icon: Database,
    title: 'Pick the data',
    text: 'Choose from our cleaned GIS layers for all 54 African countries: boundaries, rivers, roads, soils, land cover and more. Or upload your own.',
    art: 'library',
  },
  {
    icon: MapIcon,
    title: 'Build your project map',
    text: 'Drop the layers onto one live map in your browser. Style them, filter them, measure, and open the attribute table. No software to install.',
    art: 'map',
  },
  {
    icon: MessageSquare,
    title: 'Work on it together',
    text: 'Everyone on your team sees the same map. Pin comments to places, reply, leave a voice note, and mention a colleague so they get an email.',
    art: 'team',
  },
  {
    icon: History,
    title: 'Deliver with confidence',
    text: 'Every change is saved in the project history, so you can see who changed what and go back. Export for QGIS or your report when you are done.',
    art: 'history',
  },
] as const

function Art({ kind }: { kind: typeof STEPS[number]['art'] }) {
  // Small, flat drawings in the brand colours. Decorative only.
  const common = 'w-full h-[92px] rounded-lg bg-[#0a121c] border border-white/10'
  if (kind === 'library') {
    return (
      <svg viewBox="0 0 200 92" className={common} aria-hidden="true">
        {['Boundaries', 'Rivers', 'Roads', 'Soils'].map((t, i) => (
          <g key={t} transform={`translate(${14 + (i % 2) * 90}, ${14 + Math.floor(i / 2) * 36})`}>
            <rect width="82" height="28" rx="5" fill="#123049" stroke="#F5B800" strokeOpacity={i === 1 ? 0.9 : 0.25} />
            <circle cx="12" cy="14" r="4" fill={['#C9A227', '#38BDF8', '#F97316', '#A16207'][i]} />
            <text x="22" y="18" fontSize="10" fill="#E8F1F8" fontFamily="Inter, sans-serif">{t}</text>
          </g>
        ))}
      </svg>
    )
  }
  if (kind === 'map') {
    return (
      <svg viewBox="0 0 200 92" className={common} aria-hidden="true">
        <path d="M18 70 C 50 40, 70 80, 100 50 S 150 20, 184 38" stroke="#38BDF8" strokeWidth="3" fill="none" />
        <path d="M30 20 L 80 30 L 120 18 L 176 72" stroke="#F97316" strokeWidth="2" fill="none" strokeDasharray="5 4" />
        <polygon points="120,56 150,48 162,70 132,78" fill="#22C55E" fillOpacity="0.35" stroke="#22C55E" />
        <rect x="8" y="8" width="54" height="36" rx="4" fill="#123049" stroke="#ffffff" strokeOpacity="0.15" />
        {[0, 1, 2].map((i) => <rect key={i} x="14" y={14 + i * 9} width={i === 1 ? 30 : 40} height="4" rx="2" fill="#E8F1F8" fillOpacity="0.6" />)}
      </svg>
    )
  }
  if (kind === 'team') {
    return (
      <svg viewBox="0 0 200 92" className={common} aria-hidden="true">
        <path d="M16 72 C 60 44, 110 76, 184 40" stroke="#38BDF8" strokeWidth="3" fill="none" strokeOpacity="0.5" />
        <circle cx="100" cy="58" r="6" fill="#F5B800" />
        <rect x="108" y="12" width="80" height="30" rx="6" fill="#123049" stroke="#F5B800" strokeOpacity="0.6" />
        <text x="116" y="31" fontSize="10" fill="#E8F1F8" fontFamily="Inter, sans-serif">Site access here?</text>
        <path d="M112 42 L 104 52" stroke="#F5B800" strokeOpacity="0.6" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={24 + i * 18} cy="24" r="10" fill={['#534AB7', '#1E5F8E', '#C9A227'][i]} stroke="#0a121c" strokeWidth="2" />
        ))}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 92" className={common} aria-hidden="true">
      <line x1="30" y1="14" x2="30" y2="80" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="2" />
      {['r3  Added soils', 'r2  Styled rivers', 'r1  Created project'].map((t, i) => (
        <g key={t} transform={`translate(0, ${16 + i * 24})`}>
          <circle cx="30" cy="6" r="5" fill={i === 0 ? '#F5B800' : '#1E5F8E'} />
          <text x="44" y="10" fontSize="10" fill="#E8F1F8" fontFamily="Inter, sans-serif">{t}</text>
        </g>
      ))}
      <rect x="140" y="58" width="48" height="22" rx="5" fill="#F5B800" />
      <text x="149" y="73" fontSize="10" fill="#1a1200" fontWeight="700" fontFamily="Inter, sans-serif">Export</text>
    </svg>
  )
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 lg:py-24 bg-dark border-t border-white/[0.06] scroll-mt-20">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-12">
        <div className="max-w-2xl">
          <span className="font-display text-[0.78rem] font-bold tracking-[0.18em] text-gold uppercase">The workspace</span>
          <h2 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.7rem)] font-bold text-white leading-tight">
            From raw data to a finished project map, with your whole team.
          </h2>
          <p className="mt-4 text-white/65 leading-relaxed">
            Four steps, all in the browser. Here is how a project moves through Lenga Maps.
          </p>
        </div>

        <div className="mt-10 flex flex-col lg:flex-row lg:items-stretch gap-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="contents">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-gold text-[#1a1200] font-bold flex items-center justify-center text-sm">{i + 1}</span>
                  <s.icon size={18} className="text-gold" />
                </div>
                <h3 className="mt-4 text-white font-bold text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-white/65 leading-relaxed min-h-[84px]">{s.text}</p>
                <div className="mt-4"><Art kind={s.art} /></div>
              </motion.div>
              {i < STEPS.length - 1 && (
                <div className="flex items-center justify-center text-gold/70 lg:px-0.5" aria-hidden="true">
                  <ArrowRight size={22} className="rotate-90 lg:rotate-0" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/team?start=free" className="inline-flex items-center gap-2 bg-gold text-[#1a1200] text-[0.92rem] font-bold px-7 py-3.5 hover:bg-gold-light transition-all">
            Start a free team <ArrowRight size={16} />
          </Link>
          <span className="text-sm text-white/55">Free for 2 people with 3 datasets. Upgrade when your team grows.</span>
        </div>
      </div>
    </section>
  )
}
