'use client'

/**
 * /admin/quotes — the founder's quote pipeline for team plans.
 * Requests move new → contacted → quoted → won → lost. A "won" request's
 * natural next step is creating the org in /admin/organizations.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, RefreshCw, Building2 } from 'lucide-react'

interface Quote {
  id: string; org_name: string; contact_name: string | null; email: string
  sector: string | null; region: string | null; seats: number | null
  datasets_interest: string | null; notes: string | null
  status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost'
  created_at: string; updated_at: string
}

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'] as const
const STATUS_STYLE: Record<Quote['status'], string> = {
  new:       'bg-blue-100 text-blue-800',
  contacted: 'bg-amber-100 text-amber-800',
  quoted:    'bg-purple-100 text-purple-800',
  won:       'bg-green-100 text-green-800',
  lost:      'bg-gray-200 text-gray-600',
}

export default function AdminQuotesPage() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [filter, setFilter] = useState<string>('all')

  async function load() {
    const res = await fetch('/api/admin/quotes', { cache: 'no-store' })
    if (res.status === 403) { setForbidden(true); return }
    const j = await res.json().catch(() => ({}))
    setQuotes(j.quotes ?? [])
  }
  useEffect(() => { load() }, [])

  async function setStatus(id: string, status: string) {
    setQuotes((qs) => qs?.map((q) => q.id === id ? { ...q, status: status as Quote['status'] } : q) ?? null)
    await fetch('/api/admin/quotes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
  }

  if (forbidden) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">Admin access only.</div>
  }
  if (!quotes) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
  }

  const shown = filter === 'all' ? quotes : quotes.filter((q) => q.status === filter)
  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: quotes.filter((q) => q.status === s).length }), {} as Record<string, number>)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft size={15} /> Admin
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Team quote requests</h1>
            <p className="text-sm text-gray-500 mt-1">
              For Project Teams and Businesses. Won a deal? Provision it in{' '}
              <Link href="/admin/organizations" className="text-blue-700 underline">Organizations</Link>.
            </p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {['all', ...STATUSES].map((s) => (
            <button
              key={s} onClick={() => setFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                filter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {s}{s !== 'all' && ` · ${counts[s]}`}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {shown.length === 0 && (
            <p className="text-sm text-gray-400 py-10 text-center">No requests{filter !== 'all' ? ` in "${filter}"` : ' yet'}.</p>
          )}
          {shown.map((q) => (
            <div key={q.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Building2 size={16} className="text-gray-400" />
                    <h2 className="font-bold text-gray-900">{q.org_name}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[q.status]}`}>{q.status}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-gray-600">
                    {q.contact_name ? `${q.contact_name} · ` : ''}
                    <a href={`mailto:${q.email}`} className="text-blue-700 underline">{q.email}</a>
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {[q.sector, q.region, q.seats ? `${q.seats} seats` : null].filter(Boolean).join(' · ') || 'No details given'}
                    {' · '}received {new Date(q.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </p>
                  {q.datasets_interest && <p className="mt-2 text-xs text-gray-600"><span className="font-semibold">Datasets:</span> {q.datasets_interest}</p>}
                  {q.notes && <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap"><span className="font-semibold">Notes:</span> {q.notes}</p>}
                </div>
                <select
                  value={q.status}
                  onChange={(e) => setStatus(q.id, e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
