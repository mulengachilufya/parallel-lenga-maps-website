'use client'

/**
 * Dashboard: "Download GIS data", the core of Lenga Maps, always in view.
 * A vertical list beside the rest of the dashboard on large screens (it
 * stays in place while you scroll), and a compact two-column block at the
 * top on phones. Every dataset opens its country files; free accounts see
 * which ones are theirs.
 */

import Link from 'next/link'
import { Download, Lock, MessageSquarePlus } from 'lucide-react'
import { DATASETS, LIVE_DATASET_ROUTES, sortDatasetsByTier } from '@/lib/supabase'

export default function DataRail({ isFree, mine }: { isFree: boolean; mine: Set<string> }) {
  const live = sortDatasetsByTier(DATASETS).filter((d) => d.id in LIVE_DATASET_ROUTES)
  // One entry per page (two catalogue rows can point at the same page).
  const seen = new Set<string>()
  const items = live.filter((d) => {
    const href = LIVE_DATASET_ROUTES[d.id]
    if (seen.has(href)) return false
    seen.add(href); return true
  }).map((d) => {
    const href = LIVE_DATASET_ROUTES[d.id]
    const slug = href.split('section=')[1] ?? ''
    return { d, href, owned: !isFree || mine.has(slug) }
  }).sort((a, b) => Number(b.owned) - Number(a.owned))

  return (
    <aside className="rounded-2xl border border-gray-200 bg-white shadow-[0_18px_40px_-26px_rgba(13,43,69,0.5)] overflow-hidden lg:sticky lg:top-24">
      <div className="bg-[#0D2B45] px-5 py-4 text-white">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F5B800]">
          <Download size={14} /> GIS data
        </p>
        <h2 className="mt-1 text-xl font-extrabold leading-tight">Download &amp; view datasets</h2>
        <p className="mt-1 text-sm text-white/80">All 54 African countries. Pick a dataset, then a country.</p>
      </div>
      <ul className="grid grid-cols-2 gap-1 p-2 lg:grid-cols-1">
        {items.map(({ d, href, owned }) => (
          <li key={href}>
            <Link href={href}
                  className="group flex items-center gap-2.5 rounded-xl px-3 py-3 hover:bg-[#fbf5e2] transition-colors">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg" style={{ backgroundColor: `${d.color}18` }}>{d.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-bold text-[#0D2B45] group-hover:text-primary">{d.name}</span>
                <span className="mt-0.5 block text-[12.5px] text-gray-500">
                  {owned ? (isFree ? '★ Yours to download' : 'Download or view') : <><Lock size={11} className="inline -mt-0.5" /> Paid plans</>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/request-data"
            className="flex items-center gap-2 border-t border-gray-100 px-5 py-4 text-[14px] font-semibold text-[#9a7400] hover:bg-[#fbf5e2]">
        <MessageSquarePlus size={16} /> Can&apos;t find the data you need? Ask us for it
      </Link>
    </aside>
  )
}
