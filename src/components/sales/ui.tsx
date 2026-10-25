'use client'

// Small shared pieces for the /admin/sales pages.

import { X } from 'lucide-react'
import { STAGE, type Stage } from '@/lib/sales/playbook'
import { AFRICAN_COUNTRIES, country } from '@/lib/sales/client'
import type { ChannelTouch } from '@/lib/sales/channels'

export function StageChip({ stage }: { stage: Stage }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${STAGE[stage].tone}`}>{STAGE[stage].label}</span>
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`bg-white text-gray-900 w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto`}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900'
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  )
}

export function CountrySelect({ value, onChange, focus }: { value: string; onChange: (v: string) => void; focus: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">Choose a country</option>
      {focus.length > 0 && <optgroup label="Focus countries">{focus.map((c) => <option key={c} value={c}>{country(c)}</option>)}</optgroup>}
      <optgroup label="All countries">{AFRICAN_COUNTRIES.map((c) => <option key={c.iso3} value={c.iso3}>{c.name}</option>)}</optgroup>
    </select>
  )
}


/** LinkedIn's "in" mark; lucide no longer ships brand icons. */
export function LinkedInIcon({ size = 16, className }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.06c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.77 2.65 4.77 6.1v5.45h-4v-4.83c0-1.15-.02-2.63-1.6-2.63-1.6 0-1.85 1.25-1.85 2.55v4.91h-3.95v-11Z" />
    </svg>
  )
}

/**
 * What the other channel has already done with this organisation, so nobody
 * writes to them as if cold: on an email draft, the LinkedIn history; on a
 * LinkedIn card, the emails.
 */
export function OtherChannelNote({ channel, touch }: { channel: 'email' | 'linkedin'; touch: ChannelTouch | null | undefined }) {
  if (!touch) return null
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const who = touch.by ? `${touch.by} ` : ''
  const what = channel === 'linkedin'
    ? `${who}reached them on LinkedIn: ${touch.count} step${touch.count > 1 ? 's' : ''} since ${day(touch.first_at)}`
    : `${who}emailed them: ${touch.count} email${touch.count > 1 ? 's' : ''} since ${day(touch.first_at)}`
  return (
    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-900">
      <p className="font-semibold inline-flex items-center gap-1">{channel === 'linkedin' && <LinkedInIcon size={11} />} Already contacted. {what}.</p>
      {touch.last && <p className="mt-0.5">Latest, {day(touch.last_at)}: {touch.last}</p>}
      <p className="mt-0.5 text-amber-800/80">Write as a follow-up, not a first hello.</p>
    </div>
  )
}
