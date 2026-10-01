/**
 * /use-cases — the kinds of work Lenga Maps serves, one section each
 * (linked from the navbar dropdown by #slug), with the datasets involved,
 * what the shared workspace adds, and how uploaded data is kept confidential.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Lock } from 'lucide-react'
import { USE_CASES } from '@/lib/use-cases'

export const metadata: Metadata = {
  title: 'Use cases | Lenga Maps',
  description: 'EIA, mining and ESG, satellite imagery and NDVI, water, climate risk, agriculture, infrastructure and conservation work across Africa.',
}

export default function UseCasesPage() {
  return (
    <main className="bg-[#f7f4ec] text-[#0D2B45]">
      <section className="bg-[#0b1620] pt-32 pb-14 text-white">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F5B800]">Use cases</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl">The work Lenga Maps is built for</h1>
          <p className="mt-4 max-w-2xl text-white/70">
            Harmonised reference data for all 54 African countries, and a shared map where your team brings its own
            files, imagery and field data alongside it.
          </p>
          <nav className="mt-8 flex flex-wrap gap-2">
            {USE_CASES.map((u) => (
              <a key={u.slug} href={`#${u.slug}`}
                 className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-white/80 hover:border-[#F5B800]/70 hover:text-[#F5B800]">
                {u.name}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-12 sm:px-8">
        {USE_CASES.map((u, i) => (
          <section key={u.slug} id={u.slug} className="scroll-mt-28 overflow-hidden rounded-2xl border border-[#e6dcc2] bg-white shadow-[0_18px_40px_-30px_rgba(13,43,69,0.5)]">
            <div className={`grid ${i % 2 ? 'md:grid-cols-[320px_minmax(0,1fr)]' : 'md:grid-cols-[minmax(0,1fr)_320px]'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.image} alt="" loading="lazy" className={`h-48 w-full object-cover md:h-full ${i % 2 ? 'md:order-first' : 'md:order-last'}`} />
              <div className="p-6 sm:p-8">
                <h2 className="text-2xl font-extrabold">{u.name}</h2>
                <p className="mt-2 text-[15px] text-[#46607a]">{u.problem}</p>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#a07a00]">Lenga data</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {u.datasets.map((d) => <li key={d} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F5B800]" />{d}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#a07a00]">In the shared workspace</p>
                    <p className="mt-2 text-sm text-[#46607a]">{u.workspace}</p>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={u.template ? `/workspace/team?template=${u.template}` : '/workspace'}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0D2B45] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#153a5a]">
                    {u.template ? 'Start from this ready-made map' : 'Open the workspace'} <ArrowRight size={15} />
                  </Link>
                  <Link href="/datasets" className="inline-flex items-center rounded-xl border border-[#0D2B45]/20 px-5 py-2.5 text-sm font-semibold hover:border-[#F5B800]">
                    Browse the datasets
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ))}

        <section id="confidentiality" className="scroll-mt-28 rounded-2xl border border-[#0D2B45]/15 bg-[#0D2B45] p-6 text-white sm:p-8">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#F5B800]"><Lock size={14} /> Confidentiality</p>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-white/85">
            Files, boundaries and imagery your team uploads stay in your team&apos;s private folder. They are used only to
            show your project to the people you invite. They are never shared, sold or published, and never mixed into the
            Lenga database. An NDA is available on request, and we delete your data whenever you ask.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/contact-us" className="inline-flex items-center rounded-xl bg-[#F5B800] px-5 py-2.5 text-sm font-bold text-[#1a1200] hover:bg-[#ffc933]">Request an NDA</Link>
            <Link href="/request-data" className="inline-flex items-center rounded-xl border border-white/25 px-5 py-2.5 text-sm font-semibold hover:border-[#F5B800]">Need data we don&apos;t list? Request it</Link>
          </div>
        </section>

        <p className="text-center text-sm text-[#46607a]">
          See maps made from this data in the <Link href="/atlas" className="font-semibold text-[#0D2B45] underline">Lenga Atlas</Link>.
        </p>
      </div>
    </main>
  )
}
