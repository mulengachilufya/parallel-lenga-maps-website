'use client'

/**
 * The LinkedIn tab of /admin/sales: the second track, run alongside email.
 * For each person: connect, and once they accept, thank them, comment on
 * two of their posts, then three days after the thank-you send the message
 * about Lenga Maps with the price and an ask for a 10 minute video call.
 *
 * Nothing is sent from here. Every card shows the message ready to copy and
 * a button to open (or find) their profile; pressing "I sent it" moves them on and
 * writes it on the account's timeline.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, Check, Copy, ExternalLink, Loader2, MessageSquareReply, RotateCcw, Search, X } from 'lucide-react'
import { api, ago, country } from '@/lib/sales/client'
import {
  LI_CLOSE_REASONS, LI_CONNECT_LIMIT, LI_PITCH_AFTER_DAYS, LI_STEP, firstName, liActivityUrl,
  liFindUrl, liMessage, liOrgSearchUrl, liStep, type LiAction, type LiVoice, type LiStep, type LinkedInRow,
} from '@/lib/sales/linkedin'
import { LinkedInIcon, OtherChannelNote, inputCls } from './ui'
import type { ChannelTouch } from '@/lib/sales/channels'

interface Person {
  id: string; account_id: string; name: string; title: string | null; linkedin_url: string | null
  account: { id: string; name: string; country_iso3: string | null; sector: string | null; stage: string; pipeline?: 'sales' | 'partner' }
  li: LinkedInRow | null
  email: ChannelTouch | null
}
// Cards drawn at once; thousands at a time is slow on a phone.
const PAGE = 40
const TRACK: LiStep[] = ['connect', 'accept', 'thank', 'comment1', 'comment2', 'pitch', 'reply', 'meeting']

export default function LinkedInTab({ onCount, pipeline = 'sales' }: { onCount?: (n: number) => void; pipeline?: 'sales' | 'partner' }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [voice, setVoice] = useState<LiVoice>('founder')
  const [owner, setOwner] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { const d = await api<{ people: Person[]; voice?: LiVoice; owners?: { linkedin: string } }>(`/api/admin/sales/linkedin?pipeline=${pipeline}`); setPeople(d.people); setVoice(d.voice ?? 'founder'); setOwner(d.owners?.linkedin ?? ''); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load the LinkedIn list') }
  }, [pipeline])
  useEffect(() => { void load() }, [load])

  // LinkedIn drafts: only people not reached yet. Once the connection
  // request is sent they move to the Sent tab, where the pipeline ends.
  const rows = useMemo(() => (people ?? []).map((p) => ({ p, ...liStep(p.li, p.linkedin_url) }))
    .filter((r) => r.step === 'find' || r.step === 'connect'), [people])
  useEffect(() => { if (people) onCount?.(rows.length) }, [people, rows.length, onCount])

  function updated(id: string, li: LinkedInRow, linkedin_url: string | null, name?: string) {
    setPeople((ps) => ps?.map((p) => (p.id === id ? { ...p, li, linkedin_url, ...(name ? { name } : {}) } : p)) ?? ps)
  }

  if (err && !people) return <p className="text-sm text-red-600 py-6">{err}</p>
  if (!people) return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>

  // A named person with their profile first, then a named person to search
  // for, then organisations where we have no name yet.
  const rank = (r: { p: Person }) => (firstName(r.p.name) ? (r.p.linkedin_url ? 0 : 1) : 2)
  const shown = [...rows].sort((a, b) => rank(a) - rank(b) || a.p.account.name.localeCompare(b.p.account.name))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-1.5"><LinkedInIcon size={15} className="text-[#0A66C2]" /> LinkedIn track{owner && <span className="font-normal text-gray-500">· run by {owner}</span>}</h2>
        <p className="text-sm text-gray-600 mt-1 max-w-3xl">
          {rows.length.toLocaleString()} people to reach. Open their profile (or search LinkedIn for them), send the connection request with the note below,
          then press the button: they move to Sent.
        </p>
      </div>

      {shown.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">
          Everyone has been reached. They are in Sent.
        </p>
      )}
      {shown.slice(0, limit).map((r) => <PersonCard key={r.p.id} p={r.p} step={r.step} due={r.due} voice={voice} onSaved={updated} />)}
      {shown.length > limit && (
        <button onClick={() => setLimit((n) => n + PAGE)} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700">
          Show more · {shown.length - limit} left
        </button>
      )}
    </div>
  )
}

function PersonCard({ p, step, due, voice, onSaved }: {
  p: Person; step: LiStep; due: string | null; voice: LiVoice; onSaved: (id: string, li: LinkedInRow, url: string | null, name?: string) => void
}) {
  const partner = p.account.pipeline === 'partner'
  // Partners get an ask to work together in place of the pricing message.
  // No profile yet: the same card as with one, with the full message from the start, plus finding them.
  const finding = step === 'find'
  const meta = partner && step === 'pitch' ? { ...LI_STEP.pitch, label: 'Suggest working together' } : LI_STEP[finding ? 'connect' : step]
  const first = firstName(p.name)
  const [hook, setHook] = useState(p.li?.hook ?? '')
  const [url, setUrl] = useState('')
  const [who, setWho] = useState('')
  const kind = meta.message
  const edited = kind ? p.li?.messages?.[kind] ?? null : null
  const [text, setText] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [closing, setClosing] = useState(false)

  // The message for this step, rebuilt whenever the step or the hook changes.
  useEffect(() => {
    if (kind) setText(liMessage(kind, { first, org: p.account.name, hook: p.li?.hook ?? null, edited, partner, voice }))
  }, [kind, first, p.account.name, p.li?.hook, edited, partner, voice])

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label); setErr('')
    try {
      const d = await api<{ li: LinkedInRow; linkedin_url: string | null; name?: string }>(`/api/admin/sales/linkedin/${p.id}`, { method: 'PATCH', body })
      onSaved(p.id, d.li, d.linkedin_url, d.name)
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
    const plain = liMessage(kind, { first, org: p.account.name, hook: p.li?.hook ?? null, partner, voice })
    const stored = text.trim() === plain.trim() ? null : text
    if ((stored ?? null) !== (edited ?? null)) void patch({ message: { kind, text: stored } }, 'save')
  }

  const profile = p.linkedin_url
  const done = (action: LiAction, extra: Record<string, unknown> = {}) => patch({ action, ...extra }, action)
  const notYet = due && Date.parse(due) > Date.now()
  const at = TRACK.indexOf(finding ? 'connect' : step)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {/* The organisation and its key person by name; job titles are left out.
              With no name yet, the organisation alone. */}
          <p className="text-base font-bold text-gray-900">
            <Link href={`/admin/${p.account.pipeline === 'partner' ? 'partners' : 'sales'}/${p.account_id}`} className="hover:underline">{p.account.name}</Link>
            {partner && <span className="ml-2 align-middle rounded-full bg-amber-50 text-amber-800 text-[10px] font-semibold px-2 py-0.5">Partner</span>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {[first ? <span key="n" className="font-semibold text-gray-800">{p.name}</span> : 'Key person not named yet', country(p.account.country_iso3)]
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

      <OtherChannelNote channel="email" touch={p.email} />

      {/* What we noticed about them; it goes into the messages. */}
      {step !== 'closed' && step !== 'meeting' && (
        <label className="mt-3 block">
          <span className="block text-[11px] font-semibold text-gray-500 mb-1">What you noticed about them (finishes &quot;I came across ...&quot;)</span>
          <input className={inputCls} value={hook} placeholder={`the work ${p.account.name} is doing`}
                 onChange={(e) => setHook(e.target.value)}
                 onBlur={() => { if (hook.trim() !== (p.li?.hook ?? '')) void patch({ hook }, 'save') }} />
        </label>
      )}

      {kind && (
        <div className="mt-3">
          <textarea className={`${inputCls} leading-relaxed`} rows={Math.min(16, Math.max(kind === 'connect' ? 6 : 3, text.split('\n').length + (kind === 'pitch' ? 3 : 1)))}
                    value={text} onChange={(e) => setText(e.target.value)} onBlur={saveText} aria-label="Message" />
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
            <span>
              {kind === 'connect' && <>Add it as a note on the request. <span className={text.length > LI_CONNECT_LIMIT ? 'text-red-600 font-semibold' : ''}>{text.length}/{LI_CONNECT_LIMIT}</span></>}
              {kind === 'thank' && 'Short and warm. No pitch yet.'}
              {kind === 'pitch' && (notYet ? `Ready, but wait until ${LI_PITCH_AFTER_DAYS} days after the thank-you.` : partner ? 'A partner: no pricing, an ask to explore working together.' : 'Free to start, the price, and the ask for a 10 minute call.')}
            </span>
            {edited && <button onClick={() => { setText(liMessage(kind, { first, org: p.account.name, hook: p.li?.hook ?? null, partner, voice })); void patch({ message: { kind, text: null } }, 'save') }} className="hover:text-gray-700">Back to the standard text</button>}
          </div>
        </div>
      )}

      {finding && (
        <div className="mt-3 space-y-2">
          {/* A real name searches for that person; with no name yet, search the organisation itself and pick its decision maker. */}
          <a href={first ? liFindUrl(p.name, p.account.name) : liOrgSearchUrl(p.account.name)} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A66C2] text-white text-sm font-semibold px-3 py-2">
            <Search size={14} /> {first ? `Search LinkedIn for ${p.name.replace(/^(dr|prof)\.?\s+/i, '')}` : `Search LinkedIn for ${p.account.name}`}
          </a>
          {!first && <p className="text-[11px] text-gray-500">Filter the results to People, then pick the CEO, MD or director: they decide fastest.</p>}
          {!first && (
            <input className={`${inputCls} max-w-xl`} placeholder="Their name and role, e.g. Jane Banda, Managing Director" value={who} onChange={(e) => setWho(e.target.value)} />
          )}
          <input className={`${inputCls} max-w-xl`} placeholder="Paste their profile link (linkedin.com/in/...)" value={url} onChange={(e) => setUrl(e.target.value)} />
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
          <button disabled={!!busy || (kind === 'connect' && text.length > LI_CONNECT_LIMIT) || (finding && (!url.trim() || (!first && !who.trim())))}
                  onClick={() => void (async () => {
                    if (finding) {
                      // "Jane Banda, Managing Director" -> name and title
                      const [n, ...t] = who.split(',')
                      if (!(await patch({ linkedin_url: url, ...(first ? {} : { name: n.trim(), title: t.join(',').trim() || null }) }, meta.action!))) return
                    }
                    await done(meta.action!, kind ? { text } : {})
                  })()}
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
        {step !== 'closed' && !finding && (
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
