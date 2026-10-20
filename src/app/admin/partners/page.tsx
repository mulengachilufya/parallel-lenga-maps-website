'use client'

/**
 * /admin/partners — the Partnerships pipeline, standing on its own next to
 * Sales: partners who get Lenga Maps used and paid for, by track (how the
 * money reaches us). Its own board, email drafts, LinkedIn track, research
 * and track playbooks. Customers live in /admin/sales.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ExternalLink, Loader2 } from 'lucide-react'
import PartnersTab from '@/components/sales/PartnersTab'
import DraftsTab from '@/components/sales/DraftsTab'
import LinkedInTab from '@/components/sales/LinkedInTab'
import { api, country } from '@/lib/sales/client'
import { DOCUMENTS, PARTNER_STAGES, TRACKS, docLabel, isLive, type Partnership } from '@/lib/sales/partnerships'

type Tab = 'board' | 'drafts' | 'linkedin' | 'research' | 'tracks'
const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'Board' }, { id: 'drafts', label: 'Email drafts' }, { id: 'linkedin', label: 'LinkedIn' },
  { id: 'research', label: 'Research' }, { id: 'tracks', label: 'Tracks' },
]

interface Row { id: string; name: string; country_iso3: string | null; partnership: Partnership; contact: { name: string; title: string | null } | null }

export default function Wrapper() {
  return <Suspense fallback={<div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>}><PartnersPage /></Suspense>
}

function PartnersPage() {
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'board')
  const [drafts, setDrafts] = useState(0)
  const [liTodo, setLiTodo] = useState(0)

  useEffect(() => {
    api<{ counts: { draft: number } }>('/api/admin/sales/drafts?status=draft&pipeline=partner').then((d) => setDrafts(d.counts.draft)).catch(() => {})
  }, [])

  function go(t: Tab) {
    setTab(t)
    const u = new URL(window.location.href)
    u.searchParams.set('tab', t)
    window.history.replaceState(null, '', u)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-gray-900">
      <h1 className="text-2xl font-bold text-gray-900">Partnerships</h1>
      <p className="text-sm text-gray-500 mt-1">
        Partners who get Lenga Maps used and paid for, by how the money reaches us. Customers are in <Link href="/admin/sales" className="underline">Sales</Link>.
      </p>

      <nav className="mt-5 flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)}
                  className={`shrink-0 px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-[#0D2B45] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}
            {t.id === 'drafts' && drafts > 0 && <span className="ml-1.5 rounded-full bg-[#0D2B45] text-white text-[10px] px-1.5 py-0.5">{drafts}</span>}
            {t.id === 'linkedin' && liTodo > 0 && <span className="ml-1.5 rounded-full bg-[#0A66C2] text-white text-[10px] px-1.5 py-0.5">{liTodo}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === 'board' && <PartnersTab focus={[]} />}
        {tab === 'drafts' && <DraftsTab pipeline="partner" onCount={setDrafts} />}
        {tab === 'linkedin' && <LinkedInTab pipeline="partner" onCount={setLiTodo} />}
        {tab === 'research' && <ResearchTab />}
        {tab === 'tracks' && <TracksTab />}
      </div>
    </div>
  )
}

function usePartners() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try { setRows((await api<{ partners: Row[] }>('/api/admin/sales/partners')).partners) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load partners') }
  }, [])
  useEffect(() => { void load() }, [load])
  return { rows, err }
}

/** Why each partner, and where that came from, by track. Edit it on the Board. */
function ResearchTab() {
  const { rows, err } = usePartners()
  if (err) return <p className="text-sm text-red-600 py-6">{err}</p>
  if (!rows) return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  return (
    <div className="space-y-6">
      {TRACKS.map((t) => {
        const list = rows.filter((r) => r.partnership.track === t.id && r.partnership.stage !== 'dropped')
        if (!list.length) return null
        return (
          <section key={t.id}>
            <h2 className="text-sm font-bold text-gray-900">{t.label} <span className="text-gray-400 font-normal">· {list.length}</span></h2>
            <div className="mt-2 grid md:grid-cols-2 gap-3">
              {list.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <Link href={`/admin/partners/${r.id}`} className="text-sm font-bold text-gray-900 hover:underline">{r.name}</Link>
                  <p className="text-xs text-gray-500">{[country(r.country_iso3) || 'Global', r.contact ? `${r.contact.name}${r.contact.title ? `, ${r.contact.title}` : ''}` : 'No person yet'].join(' · ')}</p>
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{r.partnership.research || <span className="text-gray-400">No research yet. Add it on the Board under &quot;Why them&quot;.</span>}</p>
                  {r.partnership.sources?.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {r.partnership.sources.map((s) => (
                        <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1"><ExternalLink size={11} /> {s.label}</a></li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** The five tracks: how each earns, the first ask, the document, and where each partner stands. */
function TracksTab() {
  const { rows } = usePartners()
  const byTrack = useMemo(() => {
    const m: Record<string, Row[]> = {}
    for (const r of rows ?? []) (m[r.partnership.track] ??= []).push(r)
    return m
  }, [rows])
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        {TRACKS.map((t) => {
          const list = (byTrack[t.id] ?? []).filter((r) => !['paused', 'dropped'].includes(r.partnership.stage))
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-gray-900">{t.label}</h2>
                <span className="text-xs text-gray-500">{list.length} active · {list.filter((r) => isLive(r.partnership.stage)).length} live</span>
              </div>
              <p className="mt-2 text-sm text-gray-700"><b>How we earn:</b> {t.how}</p>
              <p className="mt-1 text-sm text-gray-700"><b>First ask:</b> {t.firstAsk}</p>
              <p className="mt-1 text-sm text-gray-700"><b>Closed with:</b> {docLabel(t.doc)}</p>
              <p className="mt-1 text-xs text-gray-500">For example: {t.examples}</p>
              {list.length > 0 && (
                <div className="mt-3 flex gap-1 flex-wrap">
                  {PARTNER_STAGES.map((s) => {
                    const n = list.filter((r) => r.partnership.stage === s.id).length
                    return n ? <span key={s.id} className="rounded-full bg-gray-50 border border-gray-200 text-[11px] px-2 py-0.5 text-gray-700">{s.short} {n}</span> : null
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <h2 className="text-sm font-bold text-gray-900">Which document</h2>
        <p className="text-xs text-gray-500 mt-0.5">Have a lawyer read anything binding before you sign.</p>
        <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {DOCUMENTS.filter((d) => d.id !== 'other').map((d) => (
            <div key={d.id}><dt className="text-sm font-semibold text-gray-900">{d.label}</dt><dd className="text-sm text-gray-600">{d.when}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  )
}
