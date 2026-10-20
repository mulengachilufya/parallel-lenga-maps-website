'use client'

/**
 * The Drafts tab of /admin/sales: researched first emails, one per person,
 * waiting to be read and sent. Each card shows who it is for, why we picked
 * them and where that came from, and the email itself, editable in place.
 *
 * Nothing goes out until Send is pressed and then confirmed. Edits save on
 * their own when you leave the field.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, ChevronDown, ChevronRight, ExternalLink, Loader2, Mail, RotateCcw, Send, Trash2 } from 'lucide-react'
import { sectorLabel } from '@/lib/sales/playbook'
import { api, ago, country } from '@/lib/sales/client'
import { LinkedInIcon, inputCls } from './ui'

export interface Draft {
  id: string; account_id: string; contact_id: string | null; subject: string; body: string
  research: string | null; sources: { label: string; url: string }[]; batch: string | null
  status: 'draft' | 'sent' | 'discarded'; sent_at: string | null; created_at: string
  account: { id: string; name: string; country_iso3: string | null; sector: string | null; website: string | null } | null
  contact: { id: string; name: string; title: string | null; email: string | null; linkedin_url: string | null; opted_out_at: string | null } | null
}
type View = 'draft' | 'sent' | 'discarded'
interface Payload { drafts: Draft[]; counts: Record<View, number>; sent_today: number; per_day: number }

export default function DraftsTab({ onCount, pipeline = 'sales' }: { onCount?: (n: number) => void; pipeline?: 'sales' | 'partner' }) {
  const [view, setView] = useState<View>('draft')
  const [data, setData] = useState<Payload | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await api<Payload>(`/api/admin/sales/drafts?status=${view}&pipeline=${pipeline}`)
      setData(d); setErr(''); onCount?.(d.counts.draft)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load the drafts') }
  }, [view, onCount, pipeline])
  useEffect(() => { void load() }, [load])

  function done(id: string, sentNow: boolean) {
    if (!data) return
    const left = data.drafts.filter((d) => d.id !== id)
    const counts = { ...data.counts, draft: data.counts.draft - 1, [sentNow ? 'sent' : 'discarded']: data.counts[sentNow ? 'sent' : 'discarded'] + 1 }
    setData({ ...data, drafts: left, counts, sent_today: data.sent_today + (sentNow ? 1 : 0) })
    onCount?.(counts.draft)
  }

  if (err && !data) return <p className="text-sm text-red-600 py-6">{err}</p>
  if (!data) return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>

  const atLimit = data.sent_today >= data.per_day
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="max-w-2xl">
            <h2 className="text-sm font-bold text-gray-900">{pipeline === 'partner' ? 'Partnership emails' : 'Researched first emails'}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {pipeline === 'partner'
                ? 'Each one proposes working together, written for that partner. Read it, change anything you like, then press Send. It goes from your address with an opt-out link, lands on their timeline, and the partnership moves to Intro made.'
                : 'Each one is written for that person. Read it, change anything you like, then press Send. It goes from your address with an opt-out link, lands on their timeline, and a call follow-up is planned for you. LinkedIn runs alongside it in the LinkedIn tab.'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              South Africa: POPIA allows one unsolicited email, so after this the follow-ups are LinkedIn and a call, never another email unless they reply.
            </p>
          </div>
          <div className={`rounded-xl px-3 py-2 text-sm ${atLimit ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-700'}`}>
            <span className="font-bold tabular-nums">{data.sent_today}</span> of {data.per_day} sent today
            <span className="block text-xs text-gray-500">Spread them out so they don&apos;t land in spam</span>
          </div>
        </div>
        <div className="mt-4 flex gap-1.5 flex-wrap">
          {(['draft', 'sent', 'discarded'] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border ${view === v ? 'bg-[#0D2B45] text-white border-[#0D2B45]' : 'bg-white text-gray-600 border-gray-200'}`}>
              {v === 'draft' ? 'Waiting' : v === 'sent' ? 'Sent' : 'Set aside'} · {data.counts[v]}
            </button>
          ))}
        </div>
      </div>

      {data.drafts.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">
          {view === 'draft' ? 'No drafts waiting. New researched emails show up here.' : view === 'sent' ? 'Nothing sent from drafts yet.' : 'Nothing set aside.'}
        </p>
      )}
      {data.drafts.map((d) => <DraftCard key={d.id} d={d} base={pipeline === 'partner' ? '/admin/partners' : '/admin/sales'} onDone={done} onRestored={() => void load()} />)}
    </div>
  )
}

function DraftCard({ d, base, onDone, onRestored }: {
  d: Draft; base: string; onDone: (id: string, sent: boolean) => void; onRestored: () => void
}) {
  const [subject, setSubject] = useState(d.subject)
  const [body, setBody] = useState(d.body)
  const [saved, setSaved] = useState({ subject: d.subject, body: d.body })
  const [why, setWhy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState<'' | 'send' | 'save' | 'discard'>('')
  const [err, setErr] = useState('')
  const editable = d.status === 'draft'
  const [c, setC] = useState(d.contact)
  const [email, setEmail] = useState('')
  const blocked = !c ? 'There is no person on this draft.' : !c.email ? `No email address for ${c.name} yet. Add it below, or reach them on LinkedIn.` : c.opted_out_at ? `${c.name} asked not to be emailed.` : ''

  async function saveEmail() {
    const e = email.trim()
    if (!c || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr('That does not look like an email address.'); return }
    setBusy('save'); setErr('')
    try { await api(`/api/admin/sales/${d.account_id}/contacts`, { method: 'PATCH', body: { contact_id: c.id, email: e } }); setC({ ...c, email: e }) }
    catch (x) { setErr(x instanceof Error ? x.message : 'Could not save the email') }
    finally { setBusy('') }
  }

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 5000)
    return () => clearTimeout(t)
  }, [confirming])

  async function save() {
    if (subject === saved.subject && body === saved.body) return
    setBusy('save'); setErr('')
    try { await api(`/api/admin/sales/drafts/${d.id}`, { method: 'PATCH', body: { subject, body } }); setSaved({ subject, body }) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy('') }
  }

  async function send(overLimit = false) {
    setBusy('send'); setErr('')
    try {
      await api(`/api/admin/sales/drafts/${d.id}/send`, { method: 'POST', body: { subject, body, over_limit: overLimit } })
      onDone(d.id, true)
    } catch (e) {
      const status = (e as { status?: number }).status
      const msg = e instanceof Error ? e.message : 'Could not send'
      if (status === 429 && window.confirm(msg)) { setBusy(''); return send(true) }
      setErr(msg); setConfirming(false)
    } finally { setBusy('') }
  }

  async function setStatus(status: 'discarded' | 'draft') {
    setBusy('discard'); setErr('')
    try {
      await api(`/api/admin/sales/drafts/${d.id}`, { method: 'PATCH', body: { status } })
      if (status === 'discarded') onDone(d.id, false); else onRestored()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not update') }
    finally { setBusy('') }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href={`${base}/${d.account_id}`} className="text-base font-bold text-gray-900 hover:underline">{d.account?.name ?? 'Organisation'}</Link>
          <p className="text-xs text-gray-500 mt-0.5">
            {[country(d.account?.country_iso3), d.account?.sector ? sectorLabel(d.account.sector) : '', d.batch].filter(Boolean).join(' · ')}
            {d.account?.website && <> · <a href={d.account.website} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">website</a></>}
          </p>
          {c && (
            <p className="text-sm text-gray-800 mt-2">
              <span className="font-semibold">{c.name}</span>{c.title && <span className="text-gray-500">, {c.title}</span>}
              <span className="block text-xs text-gray-500">
                <Mail size={11} className="inline -mt-0.5 mr-1" />{c.email ?? 'no email'}
                {c.linkedin_url && <> · <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-0.5"><LinkedInIcon size={11} /> LinkedIn</a></>}
              </span>
            </p>
          )}
        </div>
        {d.status === 'sent' && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-800 text-xs font-semibold px-2.5 py-1"><Check size={13} /> Sent {ago(d.sent_at)}</span>}
      </div>

      {(d.research || d.sources?.length > 0) && (
        <div className="mt-3 rounded-xl bg-[#F7F4EC] px-3 py-2">
          <button onClick={() => setWhy(!why)} className="w-full flex items-center gap-1 text-xs font-semibold text-[#7A5B0C]">
            {why ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Why them
          </button>
          {why && (
            <div className="mt-1.5 text-sm text-gray-700">
              {d.research && <p className="whitespace-pre-line">{d.research}</p>}
              {d.sources?.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {d.sources.map((s) => (
                    <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1"><ExternalLink size={11} /> {s.label}</a></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 space-y-2">
        <input className={inputCls} value={subject} disabled={!editable} onChange={(e) => setSubject(e.target.value)} onBlur={() => void save()} aria-label="Subject" />
        <textarea className={`${inputCls} leading-relaxed`} rows={Math.min(18, Math.max(8, body.split('\n').length + 2))} value={body} disabled={!editable}
                  onChange={(e) => setBody(e.target.value)} onBlur={() => void save()} aria-label="Message" />
        {editable && <p className="text-xs text-gray-400">Your signature and the opt-out line are added when it is sent.{busy === 'save' && ' Saving…'}</p>}
      </div>

      {blocked && editable && <p className="mt-2 text-sm text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={14} /> {blocked}</p>}
      {editable && c && !c.email && (
        <div className="mt-2 flex gap-2 max-w-md">
          <input className={inputCls} type="email" placeholder={`${c.name.split(' ')[0]}'s email`} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button disabled={!!busy} onClick={() => void saveEmail()} className="shrink-0 rounded-lg border border-gray-200 text-sm px-3 py-2 text-gray-700">Save</button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      {editable && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {!confirming ? (
            <button disabled={!!blocked || !!busy} onClick={() => setConfirming(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D2B45] text-white text-sm font-semibold px-4 py-2 disabled:opacity-40">
              <Send size={14} /> Send
            </button>
          ) : (
            <button disabled={!!busy} onClick={() => void send()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 text-white text-sm font-semibold px-4 py-2">
              {busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Yes, send to {c?.name.split(' ')[0]}
            </button>
          )}
          <button disabled={!!busy} onClick={() => void setStatus('discarded')} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-sm px-3 py-2 text-gray-600">
            <Trash2 size={14} /> Set aside
          </button>
        </div>
      )}
      {d.status === 'discarded' && (
        <button disabled={!!busy} onClick={() => void setStatus('draft')} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-sm px-3 py-2 text-gray-600">
          <RotateCcw size={14} /> Bring back
        </button>
      )}
    </div>
  )
}
