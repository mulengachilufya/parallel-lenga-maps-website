/**
 * /use-cases — the kinds of work Lenga Maps serves, in the full-bleed photo
 * style the old Services page used: one section per use case (linked from
 * the navbar dropdown by #slug), text over a dimmed photo, sides alternating.
 */

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Lock } from 'lucide-react'
import Footer from '@/components/Footer'
import { USE_CASES, type UseCase } from '@/lib/use-cases'

export const metadata: Metadata = {
  title: 'Use cases | Lenga Maps',
  description: 'EIA, mining and ESG, satellite imagery and NDVI, water, climate risk, agriculture, infrastructure and conservation work across Africa.',
}

const NAVY = '#0D2B45'
const GOLD = '#F5B800'

function Section({ u, i }: { u: UseCase; i: number }) {
  const left = i % 2 === 0
  return (
    <section id={u.slug} className="relative min-h-[92vh] flex items-center overflow-hidden scroll-mt-20">
      <Image src={u.photo} alt="" fill priority={i === 0} sizes="100vw" className="object-cover" />
      <div
        className="absolute inset-0"
        style={{
          background: left
            ? 'linear-gradient(100deg, rgba(6,14,23,0.92) 0%, rgba(6,14,23,0.8) 34%, rgba(6,14,23,0.4) 62%, rgba(6,14,23,0.18) 100%)'
            : 'linear-gradient(260deg, rgba(6,14,23,0.92) 0%, rgba(6,14,23,0.8) 34%, rgba(6,14,23,0.4) 62%, rgba(6,14,23,0.18) 100%)',
        }}
      />
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-20">
        <div className={`max-w-xl ${left ? '' : 'ml-auto text-right'}`}>
          <span className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-5 block" style={{ color: GOLD }}>
            {String(i + 1).padStart(2, '0')} · {u.name}
          </span>
          <h2 className="font-display font-bold text-white leading-[1.05] mb-6" style={{ fontSize: 'clamp(2.3rem,4.5vw,3.8rem)' }}>
            {u.heading}
          </h2>
          <p className="text-white/85 leading-relaxed mb-4" style={{ fontSize: '17px' }}>{u.problem}</p>
          <p className="text-white/85 leading-relaxed mb-4" style={{ fontSize: '17px' }}>{u.workspace}</p>
          <p className="mt-5 text-[14px] leading-loose text-white/70">{u.datasets.join('  ·  ')}</p>
          <div className={`mt-7 flex flex-wrap gap-3 ${left ? '' : 'justify-end'}`}>
            <Link href={u.template ? `/workspace/team?template=${u.template}` : '/workspace'}
                  className="inline-flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-all hover:brightness-110"
                  style={{ background: GOLD, color: NAVY }}>
              {u.template ? 'Start from this ready-made map' : 'Open the workspace'} <ArrowRight size={17} />
            </Link>
            <Link href="/datasets" className="inline-flex items-center text-white font-semibold px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all">
              Browse the datasets
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function UseCasesPage() {
  return (
    <>
      <section className="pt-40 pb-16 px-6" style={{ background: NAVY }}>
        <div className="max-w-3xl mx-auto text-center">
          <span className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-5 block" style={{ color: GOLD }}>
            Use cases
          </span>
          <h1 className="font-display font-bold text-white leading-[1.08] mb-6" style={{ fontSize: 'clamp(2.5rem,5.5vw,4.2rem)' }}>
            The work Lenga Maps is built for.
          </h1>
          <p className="text-white/70 text-lg leading-relaxed">
            Harmonised reference data for all 54 African countries, and a shared map where your team brings its own
            files, imagery and field data alongside it.
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

      {USE_CASES.map((u, i) => <Section key={u.slug} u={u} i={i} />)}

      <section className="relative min-h-[70vh] flex items-end overflow-hidden">
        <Image src="/images/services/impact.jpg" alt="A child drinking clean water from a hand pump" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(6,14,23,0.94) 0%, rgba(6,14,23,0.55) 55%, rgba(6,14,23,0.15) 100%)' }} />
        <div className="relative z-10 w-full max-w-3xl mx-auto px-6 pb-20 text-center">
          <p className="font-display text-white font-bold leading-snug" style={{ fontSize: 'clamp(1.6rem,3vw,2.3rem)' }}>
            Behind every dataset is a decision someone has to make: where to dig a borehole,
            which route survives the rainy season, how far a drought has spread.
            Good data does not make that decision. It just means nobody is guessing.
          </p>
        </div>
      </section>

      <section id="confidentiality" className="py-20 px-6 scroll-mt-20" style={{ background: NAVY }}>
        <div className="max-w-2xl mx-auto text-center">
          <p className="inline-flex items-center gap-2 font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-5" style={{ color: GOLD }}>
            <Lock size={16} /> Confidentiality
          </p>
          <p className="text-white/80 text-base mb-9 leading-relaxed">
            Files, boundaries and imagery your team uploads stay in your team&apos;s private folder. They are used only to
            show your project to the people you invite. They are never shared, sold or published, and never mixed into the
            Lenga database. An NDA is available on request, and we delete your data whenever you ask.
          </p>
          <h2 className="font-display font-bold text-white mb-5" style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)' }}>
            Working on something that is not listed here?
          </h2>
          <p className="text-white/70 text-base mb-9 leading-relaxed">
            We also join projects as the GIS partner and build custom mapping tools. A short conversation is the place to start.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/contact-us" className="inline-flex items-center gap-2 font-bold px-8 py-4 rounded-xl transition-all hover:brightness-110" style={{ background: GOLD, color: NAVY }}>
              Talk to us <ArrowRight size={18} />
            </Link>
            <Link href="/request-data" className="inline-flex items-center gap-2 text-white font-semibold px-8 py-4 rounded-xl bg-white/10 hover:bg-white/20 transition-all">
              Request a dataset
            </Link>
          </div>
          <p className="mt-8 text-sm text-white/55">
            See maps made from this data in the <Link href="/atlas" className="underline hover:text-white">Lenga Atlas</Link>.
          </p>
        </div>
      </section>

      <Footer />
    </>
  )
}
