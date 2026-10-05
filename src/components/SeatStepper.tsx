'use client'

import { Minus, Plus } from 'lucide-react'
import { TEAM_MIN_SEATS } from '@/lib/pricing'

/** − [n seats] + control for the team price calculators. */
export default function SeatStepper({ seats, onChange, dark = false, max = 200 }: {
  seats: number; onChange: (n: number) => void; dark?: boolean; max?: number
}) {
  const btn = `w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-35 ${
    dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-black/[0.07] text-current hover:bg-black/[0.12]'}`
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Number of seats">
      <button type="button" className={btn} onClick={() => onChange(Math.max(TEAM_MIN_SEATS, seats - 1))}
              disabled={seats <= TEAM_MIN_SEATS} aria-label="One seat fewer">
        <Minus size={16} />
      </button>
      <span className="min-w-[5.5rem] text-center text-base font-bold tabular-nums">
        {seats} seats
      </span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, seats + 1))}
              disabled={seats >= max} aria-label="One seat more">
        <Plus size={16} />
      </button>
    </div>
  )
}
