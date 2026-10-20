'use client'

/**
 * The LinkedIn tab of /admin/sales: the second track, run alongside email.
 * For each person: connect, and once they accept, thank them, comment on
 * two of their posts, then three days after the thank-you send the message
 * about Lenga Maps with the price and an ask for a 10 minute video call.
 *
 * Nothing is sent from here. Each step shows the message ready to copy and
 * a button to open their profile; pressing "I sent it" moves them on and
 * writes it on the account's timeline.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, Check, Copy, ExternalLink, Loader2, MessageSquareReply, RotateCcw, Search, X } from 'lucide-react'
import { api, ago, country } from '@/lib/sales/client'
import {
  LI_CLOSE_REASONS, LI_CONNECT_LIMIT, LI_PITCH_AFTER_DAYS, LI_STEP, firstName, liActionable, liActivityUrl,
  liFindUrl, liMessage, liStep, type LiAction, type LiStep, type LinkedInRow,
} from '@/lib/sales/linkedin'
import { LinkedInIcon, inputCls } from './ui'

interface Person {
  id: string; account_id: string; name: string; title: string | null; linkedin_url: string | null
  account: { id: string; name: string; country_iso3: string | null; sector: string | null; stage: string }
  li: LinkedInRow | null
}
type View = 'todo' | 'waiting' | 'find' | 'meeting' | 'closed' | 'all'
const VIEWS: { id: View; label: string }[] = [
  { id: 'todo', label: 'To do now' }, { id: 'waiting', label: 'Waiting' }, { id: 'find', label: 'No profile yet' },
  { id: 'meeting', label: 'Calls booked' }, { id: 'closed', label: 'Closed' }, { id: 'all', label: 'Everyone' },
]
// The track, left to right, for the progress dots.
const TRACK: LiStep[] = ['connect', 'accept', 'thank', 'comment1', 'comment2', 'pitch', 'reply', 'meeting']

function viewOf(step: LiStep, due: string | null): View {
  if (step === 'find') return 'find'
  if (step === 'meeting') return 'meeting'
  if (step === 'closed') return 'closed'
  return liActionable(step, due) ? 'todo' : 'waiting'
}

export default function LinkedInTab({ onCount }: { onCount?: (n: number) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [view, setView] = useState<View>('todo')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { const d = await api<{ people: Person[] }>('/api/admin/sales/linkedin'); setPeople(d.people); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load the LinkedIn list') }
  }, [])
  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => (people ?? []).map((p) => {
    const { step, due } = liStep(p.li, p.linkedin_url)
    return { p, step, due, view: viewOf(step, due) }
  }), [people])
  const counts = useMemo(() => {
    const c: Record<View, number> = { todo: 0, waiting: 0, find: 0, meeting: 0, closed: 0, all: rows.length }
    for (const r of rows) c[r.view]++
    return c
  }, [rows])
  useEffect(() => { if (people) onCount?.(counts.todo) }, [people, counts.todo, onCount])

  function updated(id: string, li: LinkedInRow, linkedin_url: string | null) {
    setPeople((ps) => ps?.map((p) => (p.id === id ? { ...p, li, linkedin_url } : p)) ?? ps)
  }

  if (err && !people) return <p className="text-sm text-red-600 py-6">{err}</p>
  if (!people) return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>

  const shown = rows.filter((r) => view === 'all' || r.view === view)
    // Oldest due first, so nobody waits longest.
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || a.p.account.name.localeCompare(b.p.account.name))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-1.5"><LinkedInIcon size={15} className="text-[#0A66C2]" /> LinkedIn track</h2>
        <p className="text-sm text-gray-600 mt-1 max-w-3xl">
          Runs alongside email for everyone in the pipeline. Connect, and once they accept: thank them, comment on two of their posts,
          then {LI_PITCH_AFTER_DAYS} days after the thank-you send the Lenga Maps message with the price and an ask for a 10 minute video call.
          Each message is written for you. Copy it, send it on LinkedIn, then press the button so the next step comes up.
        </p>
        <div className="mt-4 flex gap-1.5 flex-wrap">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setView(v.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border ${view === v.id ? 'bg-[#0D2B45] text-white border-[#0D2B45]' : 'bg-white text-gray-600 border-gray-200'}`}>
              {v.label} · {counts[v.id]}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">
          {view === 'todo' ? 'Nothing to do on LinkedIn right now. Waiting on people to accept or reply.' : 'Nobody here.'}
        </p>
      )}
      {shown.map((r) => <PersonCard key={r.p.id} p={r.p} step={r.step} due={r.due} onSaved={updated} />)}
    </div>
  )
}

function PersonCard({ p, step, due, onSaved }: {
  p: Person; step: LiStep; due: string | null; onSaved: (id: string, li: LinkedInRow, url: string | null) => void
}) {
  const meta = LI_STEP[step]
  const first = firstName(p.name)
  const [hook, setHook] = useState(p.li?.hook ?? '')
  const [url, setUrl] = useState('')
  const kind = meta.message
  const edited = kind ? p.li?.messages?.[kind] ?? null : null
  const [text, setText] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [closing, setClosing] = useState(false)

  // The message for this step, rebuilt whenever the step or the hook changes.
  useEffect(() => {
    if (kind) setText(liMessage(kind, { first, org: p.account.name, hook: p.li?.hook ?? null, edited }))
  }, [kind, first, p.account.name, p.li?.hook, edited])

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label); setErr('')
    try {
      const d = await api<{ li: LinkedInRow; linkedin_url: string | null }>(`/api/admin/sales/linkedin/${p.id}`, { method: 'PATCH', body })
      onSaved(p.id, d.li, d.linkedin_url)
      return true
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); return false }
    finally { setBusy('') }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { setErr('Could not copy. Select the text and copy it yourself.') }
  }

  // Saves the edit only if it differs from what the template gives.
  function saveText() {
    if (!kind) return
    const plain = liMessage(kind, { first, org: p.account.name, hook: p.li?.hook ?? null })
    const stored = text.trim() === plain.trim() ? null : text
    if ((stored ?? null) !== (edited ?? null)) void patch({ message: { kind, text: stored } }, 'save')
  }

  const profile = p.linkedin_url
  const done = (action: LiAction, extra: Record<string, unknown> = {}) => patch({ action, ...extra }, action)
  const notYet = due && Date.parse(due) > Date.now()
  const at = TRACK.indexOf(step)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-900">{p.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {[p.title, <Link key="o" href={`/admin/sales/${p.account_id}`} className="hover:underline">{p.account.name}</Link>, country(p.account.country_iso3)]
              .filter(Boolean).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}
          </p>
          {profile && (
            <a href={profile} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[#0A66C2] hover:underline">
              <LinkedInIcon size={11} /> {profile.replace(/^https:\/\/www\./, '').replace(/\/$/, '')}
            </a>
          )}
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.waiting ? 'bg-gray-100 text-gray-600' : step === 'meeting' ? 'bg-green-50 text-green-800' : step === 'closed' ? 'bg-gray-100 text-gray-500' : 'bg-[#E8F1F8] text-[#0D2B45]'}`}>
            {meta.label}
          </span>
          {notYet && <span className="block text-[11px] text-gray-400 mt-1">from {new Date(due!).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
          {step === 'accept' && p.li?.requested_at && <span className="block text-[11px] text-gray-400 mt-1">requested {ago(p.li.requested_at)}</span>}
          {step === 'reply' && p.li?.pitched_at && <span className="block text-[11px] text-gray-400 mt-1">messaged {ago(p.li.pitched_at)}</span>}
          {step === 'closed' && p.li?.closed_reason && <span className="block text-[11px] text-gray-400 mt-1">{p.li.closed_reason}</span>}
        </div>
      </div>

      {at >= 0 && (
        <div className="mt-3 flex items-center gap-1" aria-label={`Step ${at + 1} of ${TRACK.length}`}>
          {TRACK.map((s, i) => (
            <span key={s} title={LI_STEP[s].short} className={`h-1.5 flex-1 rounded-full ${i < at ? 'bg-[#0D2B45]' : i === at ? 'bg-[#F5B800]' : 'bg-gray-100'}`} />
          ))}
        </div>
      )}

      {/* What we noticed about them; it goes into the messages. */}
      {step !== 'closed' && step !== 'meeting' && (
        <label className="mt-3 block">
          <span className="block text-[11px] font-semibold text-gray-500 mb-1">What you noticed about them (finishes &quot;I came across ...&quot;)</span>
          <input className={inputCls} value={hook} placeholder={`the work ${p.account.name} is doing`}
                 onChange={(e) => setHook(e.target.value)}
                 onBlur={() => { if (hook.trim() !== (p.li?.hook ?? '')) void patch({ hook }, 'save') }} />
        </label>
      )}

      {step === 'find' && (
        <div className="mt-3 space-y-2">
          <a href={liFindUrl(p.name, p.account.name)} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A66C2] text-white text-sm font-semibold px-3 py-2">
            <Search size={14} /> Search LinkedIn for {first}
          </a>
          <div className="flex gap-2 max-w-xl">
            <input className={inputCls} placeholder="Paste their profile link (linkedin.com/in/...)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button disabled={!!busy || !url.trim()} onClick={() => void patch({ linkedin_url: url }, 'url').then((ok) => ok && setUrl(''))}
                    className="shrink-0 rounded-lg border border-gray-200 text-sm px-3 py-2 text-gray-700 disabled:opacity-40">Save</button>
          </div>
        </div>
      )}

      {kind && (
        <div className="mt-3">
          <textarea className={`${inputCls} leading-relaxed`} rows={Math.min(16, Math.max(3, text.split('\n').length + (kind === 'pitch' ? 3 : 1)))}
                    value={text} onChange={(e) => setText(e.target.value)} onBlur={saveText} aria-label="Message" />
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
            <span>
              {kind === 'connect' && <>Add it as a note on the request. <span className={text.length > LI_CONNECT_LIMIT ? 'text-red-600 font-semibold' : ''}>{text.length}/{LI_CONNECT_LIMIT}</span></>}
              {kind === 'thank' && 'Short and warm. No pitch yet.'}
              {kind === 'pitch' && (notYet ? `Ready, but wait until ${LI_PITCH_AFTER_DAYS} days after the thank-you.` : 'Free to start, the price, and the ask for a 10 minute call.')}
            </span>
            {edited && <button onClick={() => { setText(liMessage(kind, { first, org: p.account.name, hook: p.li?.hook ?? null })); void patch({ message: { kind, text: null } }, 'save') }} className="hover:text-gray-700">Back to the standard text</button>}
          </div>
        </div>
      )}

      {(step === 'comment1' || step === 'comment2') && (
        <p className="mt-3 text-sm text-gray-600">
          Open their recent posts and leave a real comment on one: something specific about what they shared, a question, or your own experience.
          Not just &quot;Great post&quot;. {step === 'comment2' && 'Pick a different post from the first one.'}
        </p>
      )}

      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {kind && (
          <button onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-sm px-3 py-2 text-gray-700">
            {copied ? <Check size={14} className="text-green-700" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
        )}
        {profile && step !== 'closed' && (
          <a href={step === 'comment1' || step === 'comment2' ? liActivityUrl(profile) : profile} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-sm px-3 py-2 text-gray-700">
            <ExternalLink size={14} /> {step === 'comment1' || step === 'comment2' ? 'Their recent posts' : 'Open their profile'}
          </a>
        )}
        {meta.action && (
          <button disabled={!!busy || (kind === 'connect' && text.length > LI_CONNECT_LIMIT)}
                  onClick={() => void done(meta.action!, kind ? { text } : {})}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D2B45] text-white text-sm font-semibold px-4 py-2 disabled:opacity-40">
            {busy === meta.action ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {meta.button}
          </button>
        )}
        {(step === 'comment1' || step === 'comment2') && (
          <button disabled={!!busy} onClick={() => void done(step)} className="text-xs text-gray-500 hover:text-gray-800 px-1">No posts to comment on, skip</button>
        )}
        {(step === 'reply' || step === 'pitch' || step === 'comment1' || step === 'comment2') && (
          <>
            {!p.li?.replied_at && (
              <button disabled={!!busy} onClick={() => void done('replied')} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-sm px-3 py-2 text-gray-700">
                <MessageSquareReply size={14} /> They replied
              </button>
            )}
            <button disabled={!!busy} onClick={() => void done('meeting')} className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 text-sm px-3 py-2 text-green-800">
              <CalendarCheck size={14} /> Call booked
            </button>
          </>
        )}
        {step !== 'closed' && step !== 'find' && (
          closing ? (
            <span className="inline-flex items-center gap-1 flex-wrap">
              {LI_CLOSE_REASONS.map((r) => (
                <button key={r} disabled={!!busy} onClick={() => void done('closed', { reason: r }).then(() => setClosing(false))}
                        className="rounded-full border border-gray-200 text-xs px-2.5 py-1 text-gray-600 hover:bg-gray-50">{r}</button>
              ))}
              <button onClick={() => setClosing(false)} className="text-gray-400 px-1" aria-label="Cancel"><X size={14} /></button>
            </span>
          ) : (
            <button onClick={() => setClosing(true)} className="text-xs text-gray-500 hover:text-gray-800 px-1">Close</button>
          )
        )}
        {p.li?.requested_at && (
          <button disabled={!!busy} onClick={() => void patch({ action: 'undo' }, 'undo')} className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
            <RotateCcw size={12} /> Undo last step
          </button>
        )}
      </div>
    </div>
  )
}
