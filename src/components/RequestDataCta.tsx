/**
 * "Can't find the data you need?" A box that sends people to /request-data,
 * with our promise to source it and reply. Used on the home page and beside
 * every dataset.
 */

import Link from 'next/link'
import { MessageSquarePlus } from 'lucide-react'

export default function RequestDataCta({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const dark = tone === 'dark'
  return (
    <div className={`rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 ${dark ? 'border-white/10 bg-white/[0.04] text-white' : 'border-[#F5B800]/40 bg-[#fff8e3] text-[#0D2B45]'}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F5B800]/20 text-[#c79a00]">
        <MessageSquarePlus size={22} />
      </span>
      <div className="flex-1">
        <p className="text-base font-bold">Can&apos;t find the data you need?</p>
        <p className={`mt-0.5 text-sm ${dark ? 'text-white/70' : 'text-[#46607a]'}`}>
          Tell us the dataset, country and area. We will source it, add it to Lenga Maps and get back to you.
        </p>
      </div>
      <Link href="/request-data" className="inline-flex items-center justify-center rounded-xl bg-[#F5B800] px-5 py-3 text-sm font-bold text-[#1a1200] hover:bg-[#ffc933] whitespace-nowrap">
        Request a dataset
      </Link>
    </div>
  )
}
