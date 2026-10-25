'use client'

/**
 * Outcomes: for every organisation we have reached, tick how it turned out:
 * won, lost or no response. Tapping the ticked one again clears it.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail } from 'lucide-react'
import { api, country } from '@/lib/sales/client'
import { LinkedInIcon } from './ui'

type Outcome = 'won' | 'lost' | 'no_response'
interface Row { id: string; name: string; country_iso3: string | null; outcome: Outcome | null; outcome_at: string | null; email_at: string | null; linkedin_at: string | null }
type Filter = 'open' | Outcome | 'all'

const OUTCOME: Record<Outcome, { label: string; on: string }> = {
  won:         { label: 'Won',         on: 'bg-green-600 text-white border-green-600' },
  lost:        { label: 'Lost',        on: 'bg-red-600 text-white border-red-600' },
  no_response: { label: 'No response', on: 'bg-gray-600 text-white border-gray-600' },
}
const PAGE = 50

export default function OutcomesTab({ pipeline = 'sales' }: { pipeline?: 'sales' | 'partner' }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<Filter>('open')
  const [busy, setBusy] = useState('')
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    api<{ accounts: Row[] }>(`/api/admin/sales/outcomes?pipeline=${pipeline}`).then((d) => setRows(d.accounts)).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load'))
  }, [pipeline])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { open: 0, won: 0, lost: 0, no_response: 0, all: rows?.length ?? 0 }
    for (const r of rows ?? []) c[r.outcome ?? 'open']++
    return c
  }, [rows])

  async function tick(r: Row, o: Outcome) {
    const next = r.outcome === o ? null : o
    setBusy(r.id); setErr('')
    try {
      const d = await api<{ outcome: Outcome | null; outcome_at: string | null }>('/api/admin/sales/outcomes', { method: 'PATCH', body: { account_id: r.id, outcome: next } })
      setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, outcome: d.outcome, outcome_at: d.outcome_at } : x)) ?? rs)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy('') }
  }

  if (err && !rows) return <p className="text-sm text-red-600 py-6">{err}</p>
  if (!rows) return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  const shown = rows.filter((r) => filter === 'all' || (r.outcome ?? 'open') === filter)
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null)
  const base = pipeline === 'partner' ? '/admin/partners' : '/admin/sales'

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {([['open', 'Not ticked'], ['won', 'Won'], ['lost', 'Lost'], ['no_response', 'No response'], ['all', 'All']] as [Filter, string][]).map(([f, label]) => (
          <button key={f} onClick={() => { setFilter(f); setLimit(PAGE) }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border ${filter === f ? 'bg-[#0D2B45] text-white border-[#0D2B45]' : 'bg-white text-gray-600 border-gray-200'}`}>
            {label} · {counts[f]}
          </button>
        ))}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {shown.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">{rows.length ? 'Nobody here.' : 'Nobody reached yet. Once you send an email or a LinkedIn request, they show up here.'}</p>}
      <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {shown.slice(0, limit).map((r) => (
          <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <Link href={`${base}/${r.id}`} className="text-sm font-semibold text-gray-900 hover:underline">{r.name}</Link>
              <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                {country(r.country_iso3)}
                {r.email_at && <span className="inline-flex items-center gap-1"><Mail size={11} /> {day(r.email_at)}</span>}
                {r.linkedin_at && <span className="inline-flex items-center gap-1"><LinkedInIcon size={11} /> {day(r.linkedin_at)}</span>}
              </p>
            </div>
            <div className="flex gap-1.5">
              {(Object.keys(OUTCOME) as Outcome[]).map((o) => (
                <button key={o} disabled={busy === r.id} onClick={() => void tick(r, o)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${r.outcome === o ? OUTCOME[o].on : 'bg-white text-gray-700 border-gray-200'}`}>
                  {r.outcome === o ? '✓ ' : ''}{OUTCOME[o].label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {shown.length > limit && (
        <button onClick={() => setLimit((n) => n + PAGE)} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700">
          Show more · {shown.length - limit} left
        </button>
      )}
    </div>
  )
}
