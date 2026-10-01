/**
 * /use-cases — the kinds of work Lenga Maps serves. White page, a big title,
 * then two squarish cards per screen: one high on the left, one lower on the
 * right, overlapping by about a third so they read as a pair. The images are
 * real renders from open data and carry most of each card, dimmed slightly
 * so the text reads.
 */

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check, Lock } from 'lucide-react'
import Footer from '@/components/Footer'
import ScrollCue from '@/components/ScrollCue'
import { USE_CASES, type UseCase } from '@/lib/use-cases'

export const metadata: Metadata = {
  title: 'Use cases | Lenga Maps',
  description: 'How project teams use Lenga Maps: ESIA, mining and tailings, REDD+ and ARR carbon, climate finance proposals, El Niño drought response, agriculture, lending and insurance, solar siting, hydropower, water supply, biodiversity disclosure, corridors, humanitarian planning, data pipelines and drone surveys.',
}

const NAVY = '#0D2B45'
const GOLD = '#F5B800'

/** Text sits at the top of the left card and the bottom of the right one, away from the overlap. */
function Card({ u, side }: { u: UseCase; side: 'left' | 'right' }) {
  const top = side === 'left'
  return (
    <article id={u.slug}
             className={`group relative overflow-hidden rounded-3xl shadow-[0_40px_80px_-40px_rgba(13,43,69,0.55)] ring-1 ring-black/5 scroll-mt-28
                         min-h-[520px] w-full
                         md:absolute md:h-[64vh] md:max-h-[600px] md:min-h-[460px] md:w-[44%]
                         ${top ? 'md:left-[7%] md:top-0' : 'md:right-[7%] md:bottom-0 md:z-10'}`}>
      <Image src={u.image} alt={u.imageNote} fill sizes="(min-width: 768px) 44vw, 100vw"
             className="object-cover brightness-[0.72] saturate-[0.85] transition-transform duration-700 group-hover:scale-[1.04]" />
      <div className="absolute inset-0"
           style={{ background: top
             ? 'linear-gradient(180deg, rgba(6,14,23,0.94) 0%, rgba(6,14,23,0.8) 45%, rgba(6,14,23,0.15) 85%)'
             : 'linear-gradient(0deg, rgba(6,14,23,0.94) 0%, rgba(6,14,23,0.8) 45%, rgba(6,14,23,0.15) 85%)' }} />
      <div className={`relative flex h-full flex-col p-6 sm:p-8 ${top ? 'justify-start' : 'justify-end'}`}>
        <span className="font-display text-[0.78rem] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>{u.name}</span>
        <h2 className="mt-2 max-w-[26ch] font-display font-bold leading-[1.12] text-white" style={{ fontSize: 'clamp(1.35rem,1.9vw,1.8rem)' }}>
          {u.title}
        </h2>
        <p className="mt-2.5 max-w-[52ch] text-[14.5px] leading-relaxed text-white/85">{u.body}</p>
        <ul className="mt-3 space-y-1.5">
          {u.uses.map((t) => (
            <li key={t} className="flex gap-2 text-[14px] leading-snug text-white/90">
              <Check size={15} className="mt-[3px] shrink-0" style={{ color: GOLD }} /> {t}
            </li>
          ))}
        </ul>
        <Link href={u.template ? `/workspace/team?template=${u.template}` : '/workspace'}
              className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all hover:brightness-110"
              style={{ background: GOLD, color: NAVY }}>
          {u.template ? 'Open the ready-made map' : 'Open the workspace'} <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  )
}

export default function UseCasesPage() {
  const pairs: UseCase[][] = []
  for (let i = 0; i < USE_CASES.length; i += 2) pairs.push(USE_CASES.slice(i, i + 2))

  return (
    <div className="bg-white">
      <section className="px-6 pt-36 pb-6 sm:pt-40">
        <h1 className="mx-auto max-w-7xl font-display font-bold leading-[1.02] tracking-tight sm:px-2" style={{ color: NAVY, fontSize: 'clamp(3rem,7vw,5.6rem)' }}>
          Use cases
        </h1>
      </section>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {pairs.map((pair, p) => (
          <section key={p} className="flex flex-col gap-6 py-6 md:relative md:block md:h-[calc(64vh*1.65)] md:max-h-[990px] md:min-h-[760px] md:py-0 md:my-10">
            <Card u={pair[0]} side="left" />
            {pair[1] && <Card u={pair[1]} side="right" />}
          </section>
        ))}
      </div>

      <section id="confidentiality" className="scroll-mt-20 px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-5 inline-flex items-center gap-2 font-display text-[0.95rem] font-bold uppercase tracking-[0.14em] text-[#a07a00]">
            <Lock size={16} /> Confidentiality
          </p>
          <p className="mb-10 text-base leading-relaxed text-[#46607a]">
            Files, boundaries and imagery your team uploads stay in your team&apos;s private folder. They are used only to
            show your project to the people you invite. They are never shared, sold or published, and never mixed into the
            Lenga database. An NDA is available on request, and we delete your data whenever you ask.
          </p>
          <h2 className="mb-4 font-display font-bold" style={{ color: NAVY, fontSize: 'clamp(1.7rem,3vw,2.4rem)' }}>
            Your job is not here?
          </h2>
          <p className="mb-9 text-base leading-relaxed text-[#46607a]">
            We also join projects as the GIS partner and build custom mapping tools.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contact-us" className="inline-flex items-center gap-2 rounded-xl px-8 py-4 font-bold text-white transition-all hover:brightness-110" style={{ background: NAVY }}>
              Talk to us <ArrowRight size={18} />
            </Link>
            <Link href="/request-data" className="inline-flex items-center gap-2 rounded-xl border border-[#0D2B45]/20 px-8 py-4 font-semibold transition-all hover:border-[#F5B800]" style={{ color: NAVY }}>
              Request a dataset
            </Link>
          </div>
        </div>
      </section>

      <ScrollCue />
      <Footer />
    </div>
  )
}
