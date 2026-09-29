'use client'

/**
 * The shared GIS workspace as a full box of its own: what it is, one clear
 * button in, and the ready-made maps by field (mining, EIA, water...), each
 * of which opens a new project already loaded with that field's layers.
 */

import Link from 'next/link'
import { ArrowRight, Map as MapIcon, MessageSquare, Mic, History } from 'lucide-react'
import { TEMPLATES } from '@/lib/workspace/templates'

const TILES = ['s2_mine', 's2_mine_ndvi', 'lulc', 'wetlands', 'hydrorivers', 's2_sugar'].map((n) => `/images/mosaic/gis-${n}.webp`)

export default function WorkspaceBox({ hasTeam, compact = false, href }: { hasTeam: boolean; compact?: boolean; href?: string }) {
  const start = href ?? (hasTeam ? '/workspace' : '/team?start=free')
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#0D2B45]/10 bg-[#0D2B45] text-white shadow-[0_22px_48px_-26px_rgba(13,43,69,0.8)]">
      <div aria-hidden className="absolute inset-0 grid grid-cols-3 sm:grid-cols-6 opacity-35">
        {TILES.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        ))}
      </div>
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#0D2B45] via-[#0D2B45]/90 to-[#0D2B45]/60" />
      <div className="relative p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F5B800]">Shared GIS workspace</p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold leading-tight">One live map for your whole team</h2>
        <p className="mt-2 max-w-2xl text-[15px] text-white/80">
          Put Lenga datasets and your own files on the same map, comment on exact places, leave voice notes,
          and keep every change. Free for 2 people.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/85">
          <span className="inline-flex items-center gap-1.5"><MapIcon size={15} className="text-[#F5B800]" /> Shared map</span>
          <span className="inline-flex items-center gap-1.5"><MessageSquare size={15} className="text-[#F5B800]" /> Comments on places</span>
          <span className="inline-flex items-center gap-1.5"><Mic size={15} className="text-[#F5B800]" /> Voice notes</span>
          <span className="inline-flex items-center gap-1.5"><History size={15} className="text-[#F5B800]" /> Full history</span>
        </div>
        <Link href={start} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#F5B800] px-6 py-3 text-[15px] font-bold text-[#1a1200] hover:bg-[#ffc933]">
          {hasTeam ? 'Open the workspace' : 'Start a free team'} <ArrowRight size={17} />
        </Link>

        {!compact && (
          <div className="mt-7">
            <p className="text-sm font-bold">Start from a ready-made map for your field</p>
            <p className="text-xs text-white/70">Pick one and a country: the right layers go straight onto a new project map, styled and in order.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES.map((t) => (
                <Link key={t.id} href={hasTeam ? `/workspace/team?template=${t.id}` : '/team?start=free'}
                      className="group rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 backdrop-blur hover:border-[#F5B800]/70 hover:bg-white/[0.12] transition-colors">
                  <span className="block text-[13.5px] font-bold group-hover:text-[#F5B800]">{t.name}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-white/70">{t.layers.length} layers · {t.blurb}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
