/**
 * /use-cases — the kinds of work Lenga Maps serves. Two cards per screen,
 * set on a diagonal (one high on the left, the next lower on the right) so
 * the dark ground shows between them and the page reads as a sequence.
 * Images are real renders from open data; each card says what it shows.
 */

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Lock } from 'lucide-react'
import Footer from '@/components/Footer'
import ScrollCue from '@/components/ScrollCue'
import { USE_CASES, type UseCase } from '@/lib/use-cases'

export const metadata: Metadata = {
  title: 'Use cases | Lenga Maps',
  description: 'EIA, mining, closure, satellite imagery and NDVI, agriculture, soil, climate finance, floods, water, wetlands, conservation, infrastructure, humanitarian planning and drone surveys across Africa.',
}

const NAVY = '#0D2B45'
const GOLD = '#F5B800'

function Card({ u, n, side }: { u: UseCase; n: number; side: 'left' | 'right' }) {
  return (
    <article id={u.slug}
             className={`group relative w-full overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)] scroll-mt-28
                         min-h-[420px] md:min-h-[290px] md:h-[40vh] md:max-h-[400px] md:w-[60%] ${side === 'right' ? 'md:ml-auto' : ''}`}>
      <Image src={u.image} alt={u.imageNote} fill sizes="(min-width: 768px) 60vw, 100vw"
             className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(6,14,23,0.94) 0%, rgba(6,14,23,0.82) 42%, rgba(6,14,23,0.25) 100%)' }} />
      <div className="relative flex h-full flex-col justify-center p-6 sm:p-7 md:max-w-[70%]">
        <span className="font-display text-[0.8rem] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
          {String(n).padStart(2, '0')} · {u.name}
        </span>
        <h2 className="mt-2 font-display font-bold leading-[1.08] text-white" style={{ fontSize: 'clamp(1.4rem,2.1vw,2rem)' }}>
          {u.title}
        </h2>
        <p className="mt-2.5 text-[14.5px] leading-relaxed text-white/80">{u.body}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-white/55">{u.datasets.join('  ·  ')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href={u.template ? `/workspace/team?template=${u.template}` : '/workspace'}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all hover:brightness-110"
                style={{ background: GOLD, color: NAVY }}>
            {u.template ? 'Open the ready-made map' : 'Open the workspace'} <ArrowRight size={15} />
          </Link>
          <span className="text-[11px] text-white/45">Image: {u.imageNote}</span>
        </div>
      </div>
    </article>
  )
}

export default function UseCasesPage() {
  const pairs: UseCase[][] = []
  for (let i = 0; i < USE_CASES.length; i += 2) pairs.push(USE_CASES.slice(i, i + 2))

  return (
    <div style={{ background: '#081521' }}>
      <section className="px-6 pt-40 pb-14" style={{ background: NAVY }}>
        <div className="mx-auto max-w-3xl text-center">
          <span className="mb-5 block font-display text-[0.95rem] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
            Use cases
          </span>
          <h1 className="mb-6 font-display font-bold leading-[1.08] text-white" style={{ fontSize: 'clamp(2.4rem,5vw,4rem)' }}>
            Fourteen jobs. One map underneath them.
          </h1>
          <p className="text-lg leading-relaxed text-white/70">
            Harmonised data for all 54 African countries, plus a shared map where your team adds its own imagery,
            drone flights and field data. Every picture on this page is real data, rendered by us.
          </p>
          <nav className="mt-9 flex flex-wrap justify-center gap-2">
            {USE_CASES.map((u) => (
              <a key={u.slug} href={`#${u.slug}`}
                 className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-white/80 hover:border-[#F5B800]/70 hover:text-[#F5B800]">
                {u.name}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {pairs.map((pair, p) => (
          <section key={p} className="flex flex-col gap-6 py-10 md:h-[calc(100vh-5rem)] md:min-h-[640px] md:justify-center md:gap-[3vh] md:py-0">
            <Card u={pair[0]} n={p * 2 + 1} side="left" />
            {pair[1] && <Card u={pair[1]} n={p * 2 + 2} side="right" />}
          </section>
        ))}
      </div>

      <section id="confidentiality" className="scroll-mt-20 px-6 py-20" style={{ background: NAVY }}>
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-5 inline-flex items-center gap-2 font-display text-[0.95rem] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
            <Lock size={16} /> Confidentiality
          </p>
          <p className="mb-9 text-base leading-relaxed text-white/80">
            Files, boundaries and imagery your team uploads stay in your team&apos;s private folder. They are used only to
            show your project to the people you invite. They are never shared, sold or published, and never mixed into the
            Lenga database. An NDA is available on request, and we delete your data whenever you ask.
          </p>
          <h2 className="mb-5 font-display font-bold text-white" style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)' }}>
            Your job is not on this list?
          </h2>
          <p className="mb-9 text-base leading-relaxed text-white/70">
            We also join projects as the GIS partner and build custom mapping tools.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contact-us" className="inline-flex items-center gap-2 rounded-xl px-8 py-4 font-bold transition-all hover:brightness-110" style={{ background: GOLD, color: NAVY }}>
              Talk to us <ArrowRight size={18} />
            </Link>
            <Link href="/request-data" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-8 py-4 font-semibold text-white transition-all hover:bg-white/20">
              Request a dataset
            </Link>
          </div>
          <p className="mt-8 text-sm text-white/55">
            See finished maps in the <Link href="/atlas" className="underline hover:text-white">Lenga Atlas</Link>.
          </p>
        </div>
      </section>

      <ScrollCue />
      <Footer />
    </div>
  )
}
