'use client'

/**
 * The shared GIS workspace as a box of its own: what it is and one clear
 * button in. The right side shows the idea on a real Sentinel-2 scene (an
 * open-pit mine): a comment pinned to a spot, a voice note, the layer list.
 * (Ready-made field maps live inside the workspace itself.)
 */

import Link from 'next/link'
import { ArrowRight, Map as MapIcon, MessageSquare, Mic, History, Layers } from 'lucide-react'

export default function WorkspaceBox({ hasTeam, href }: { hasTeam: boolean; href?: string }) {
  const start = href ?? (hasTeam ? '/workspace' : '/team?start=free')
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8dfc7] bg-[#fbf7ec] text-[#0D2B45] shadow-[0_22px_48px_-30px_rgba(13,43,69,0.55)]">
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#a07a00]">Shared GIS workspace</p>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold leading-tight">One live map for your whole team</h2>
          <p className="mt-2 max-w-xl text-[15px] text-[#46607a]">
            Put Lenga datasets and your own files on the same map, comment on exact places, leave voice notes,
            and keep every change. Free for 2 people.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium">
            <span className="inline-flex items-center gap-1.5"><MapIcon size={15} className="text-[#c79a00]" /> Shared map</span>
            <span className="inline-flex items-center gap-1.5"><MessageSquare size={15} className="text-[#c79a00]" /> Comments on places</span>
            <span className="inline-flex items-center gap-1.5"><Mic size={15} className="text-[#c79a00]" /> Voice notes</span>
            <span className="inline-flex items-center gap-1.5"><History size={15} className="text-[#c79a00]" /> Full history</span>
          </div>
          <Link href={start} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0D2B45] px-6 py-3 text-[15px] font-bold text-white hover:bg-[#153a5a]">
            {hasTeam ? 'Open the workspace' : 'Start a free team'} <ArrowRight size={17} />
          </Link>
        </div>

        {/* The workspace idea on a real scene. */}
        <div aria-hidden className="relative min-h-[240px] md:min-h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/mosaic/gis-s2_mine.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />

          <div className="absolute left-3 top-3 w-[150px] rounded-lg bg-white/95 p-2.5 text-[11px] shadow-lg">
            <p className="mb-1.5 flex items-center gap-1 font-bold"><Layers size={12} /> Layers</p>
            {[['#f59e0b', 'Mine licence'], ['#2563eb', 'Rivers'], ['#16a34a', 'Protected areas']].map(([c, n]) => (
              <p key={n} className="flex items-center gap-1.5 py-0.5 text-[#334]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c }} /> {n}
              </p>
            ))}
          </div>

          <div className="absolute left-[48%] top-[42%]">
            <span className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-[#F5B800] shadow" />
            <div className="absolute left-4 top-[-6px] w-[170px] rounded-lg bg-white p-2 text-[11px] leading-snug shadow-lg">
              <p className="font-bold">Chanda · 2h</p>
              <p className="text-[#46607a]">Tailings edge moved about 40 m since March.</p>
            </div>
          </div>

          <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold shadow-lg">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0D2B45] text-white"><Mic size={11} /></span>
            Voice note · 0:14
          </div>
        </div>
      </div>
    </section>
  )
}
