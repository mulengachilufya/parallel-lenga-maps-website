'use client'

/**
 * The shared GIS workspace as a box of its own: what it is and one clear
 * button in. (Ready-made field maps live inside the workspace itself.)
 */

import Link from 'next/link'
import { ArrowRight, Map as MapIcon, MessageSquare, Mic, History } from 'lucide-react'

const TILES = ['s2_mine', 's2_mine_ndvi', 'lulc', 'wetlands', 'hydrorivers', 's2_sugar'].map((n) => `/images/mosaic/gis-${n}.webp`)

export default function WorkspaceBox({ hasTeam, href }: { hasTeam: boolean; href?: string }) {
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

      </div>
    </section>
  )
}
