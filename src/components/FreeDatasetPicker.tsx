'use client'

/**
 * Choose the free plan's 3 datasets. Used on the dashboard (your own 3) and
 * the Team page (a free team's 3, owner only). Picks are permanent: the
 * server only ever adds, so this asks for a clear confirmation first.
 */

import { useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { FREE_DATASET_LIMIT, FREE_PICKABLE, type DatasetSlug } from '@/lib/pricing'
import { DATASET_META } from '@/lib/teams'

export const freeDatasetName = (s: string) => DATASET_META[s as DatasetSlug]?.name ?? s

export default function FreeDatasetPicker({ picks, endpoint, onSaved, dark, canPick = true, who = 'you' }: {
  picks: string[]
  endpoint: '/api/account/free-datasets' | '/api/team/free-datasets'
  onSaved: () => void
  dark?: boolean
  canPick?: boolean
  who?: 'you' | 'team'
}) {
  const [sel, setSel] = useState<string[]>([])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const left = FREE_DATASET_LIMIT - picks.length

  const tone = dark
    ? { card: 'bg-[#102f4e] border-blue-800/60', text: 'text-white', muted: 'text-blue-300', chip: 'border-blue-700 text-blue-100', on: 'border-[#F5B800] bg-[#F5B800]/15 text-white', mine: 'border-green-500/60 bg-green-500/15 text-green-100' }
    : { card: 'bg-white border-gray-200', text: 'text-gray-900', muted: 'text-gray-500', chip: 'border-gray-200 text-gray-700 hover:border-gray-400', on: 'border-[#0D2B45] bg-blue-50 text-[#0D2B45]', mine: 'border-green-300 bg-green-50 text-green-800' }

  function toggle(s: string) {
    setConfirm(false)
    setSel((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : cur.length >= left ? cur : [...cur, s])
  }

  async function save() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasets: sel }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message || 'Could not save')
      setSel([]); setConfirm(false); onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy(false) }
  }

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${tone.card}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`text-sm font-bold ${tone.text}`}>
          {who === 'team' ? 'Your team\'s free datasets' : 'Your free datasets'}: {picks.length} of {FREE_DATASET_LIMIT} chosen
        </p>
        {left > 0 && canPick && <p className={`text-xs ${tone.muted}`}>Choose {left === FREE_DATASET_LIMIT ? FREE_DATASET_LIMIT : `${left} more`}. Chosen datasets are kept for good and can&apos;t be swapped.</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {FREE_PICKABLE.map((s) => {
          const mine = picks.includes(s)
          const on = sel.includes(s)
          const disabled = mine || !canPick || left <= 0 || (!on && sel.length >= left)
          return (
            <button key={s} type="button" disabled={disabled} onClick={() => toggle(s)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${mine ? tone.mine : on ? tone.on : tone.chip} ${disabled && !mine ? 'opacity-45 cursor-not-allowed' : ''}`}>
              {mine ? <Check size={12} /> : on ? <Check size={12} /> : left <= 0 ? <Lock size={11} /> : null}
              {freeDatasetName(s)}
            </button>
          )
        })}
      </div>
      {!canPick && left > 0 && <p className={`mt-3 text-xs ${tone.muted}`}>The team owner chooses the team&apos;s datasets.</p>}
      {sel.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirm ? (
            <>
              <span className={`text-xs ${tone.text}`}>Keep {sel.map(freeDatasetName).join(', ')} for good? You can&apos;t change {sel.length > 1 ? 'these' : 'this'} later.</span>
              <button disabled={busy} onClick={() => void save()} className="rounded-lg bg-[#F5B800] text-[#0D2B45] text-xs font-bold px-4 py-2 disabled:opacity-60">{busy ? 'Saving…' : 'Yes, keep them'}</button>
              <button onClick={() => setConfirm(false)} className={`text-xs ${tone.muted}`}>Back</button>
            </>
          ) : (
            <button onClick={() => setConfirm(true)} className="rounded-lg bg-[#0D2B45] text-white text-xs font-bold px-4 py-2 border border-white/10">
              Choose {sel.length} dataset{sel.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}
      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
    </div>
  )
}
