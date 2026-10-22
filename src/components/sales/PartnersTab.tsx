'use client'

/**
 * The Board tab of /admin/partners: partners whose job is to get Lenga
 * Maps used and paid for, grouped by track (how the money reaches us).
 * Each card holds the stage, what each side brings, how we earn, the
 * document that closes it and the next step. Their people, timeline and
 * LinkedIn steps live on the organisation page and the LinkedIn tab.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import { api, country, deleteOrg, dueLabel, money } from '@/lib/sales/client'
import { useAdminAccess } from '@/components/admin/AdminAccess'
import {
  DOCUMENTS, DROP_REASONS, PARTNER_OFF, PARTNER_STAGES, TRACKS, docLabel, isLive, partnerStageIndex, partnerStageLabel, track,
  type PartnerStage, type PartnerTrack, type Partnership,
} from '@/lib/sales/partnerships'
import { CountrySelect, Field, LinkedInIcon, Modal, inputCls } from './ui'

interface Partner {
  id: string; name: string; country_iso3: string | null; website: string | null; priority: number
  partnership: Partnership
  contact: { id: string; name: string; title: string | null; linkedin_url: string | null } | null
  contact_count: number
}
type Filter = PartnerTrack | 'all'

export default function PartnersTab({ focus }: { focus: string[] }) {
  const [partners, setPartners] = useState<Partner[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [showOff, setShowOff] = useState(false)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setPartners((await api<{ partners: Partner[] }>('/api/admin/sales/partners')).partners); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load partners') }
  }, [])
  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 }
    for (const p of partners ?? []) if (!['paused', 'dropped'].includes(p.partnership.stage)) {
      c.all++; c[p.partnership.track] = (c[p.partnership.track] ?? 0) + 1
    }
    return c
  }, [partners])

  if (err && !partners) return <p className="text-sm text-red-600 py-6">{err}</p>
  if (!partners) return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>

  const inTrack = partners.filter((p) => filter === 'all' || p.partnership.track === filter)
  const active = inTrack.filter((p) => !['paused', 'dropped'].includes(p.partnership.stage))
    .sort((a, b) => partnerStageIndex(b.partnership.stage) - partnerStageIndex(a.partnership.stage)
      || (a.partnership.next_step_due ?? '9').localeCompare(b.partnership.next_step_due ?? '9') || a.name.localeCompare(b.name))
  const off = inTrack.filter((p) => ['paused', 'dropped'].includes(p.partnership.stage))
  const live = active.filter((p) => isLive(p.partnership.stage))
  const liveValue = live.reduce((s, p) => s + (Number(p.partnership.est_annual_usd) || 0), 0)
  const t = filter === 'all' ? null : track(filter)
  const removed = (id: string) => setPartners((list) => (list ?? []).filter((x) => x.id !== id))

  function updated(id: string, partnership: Partnership) {
    setPartners((ps) => ps?.map((p) => (p.id === id ? { ...p, partnership } : p)) ?? ps)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="max-w-3xl">
            <h2 className="text-sm font-bold text-gray-900">Partnerships</h2>
            <p className="text-sm text-gray-600 mt-1">
              Partners who get Lenga Maps used and paid for, by how the money reaches us. A partnership counts when it is <b>live</b>:
              users in, a listing up or money moving, not when the paper is signed. Keep five to eight active at a time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700">
              <span className="font-bold tabular-nums">{live.length}</span> live{liveValue > 0 && <> · {money(liveValue)} a year</>}
            </div>
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D2B45] text-white text-sm font-semibold px-3.5 py-2"><Plus size={15} /> Add partner</button>
          </div>
        </div>
        <div className="mt-4 flex gap-1.5 flex-wrap">
          {([{ id: 'all', label: 'All tracks' }, ...TRACKS] as { id: Filter; label: string }[]).map((x) => (
            <button key={x.id} onClick={() => setFilter(x.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border ${filter === x.id ? 'bg-[#0D2B45] text-white border-[#0D2B45]' : 'bg-white text-gray-600 border-gray-200'}`}>
              {x.label} · {counts[x.id] ?? 0}
            </button>
          ))}
        </div>
        {t && (
          <div className="mt-3 rounded-xl bg-[#f3f7fb] px-3 py-2.5 text-sm text-gray-700 space-y-1">
            <p><b>How we earn:</b> {t.how}</p>
            <p><b>First ask:</b> {t.firstAsk}</p>
            <p><b>Usually closed with:</b> {docLabel(t.doc)}. <span className="text-gray-500">For example: {t.examples}.</span></p>
          </div>
        )}
      </div>

      {active.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">No partners on this track yet. Add one, or move an organisation here from its page.</p>}
      {active.map((p) => <PartnerCard key={p.id} p={p} onSaved={updated} onDeleted={removed} />)}

      {off.length > 0 && (
        <div>
          <button onClick={() => setShowOff(!showOff)} className="text-xs font-semibold text-gray-500 inline-flex items-center gap-1">
            {showOff ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Paused and dropped · {off.length}
          </button>
          {showOff && <div className="mt-2 space-y-3">{off.map((p) => <PartnerCard key={p.id} p={p} onSaved={updated} onDeleted={removed} />)}</div>}
        </div>
      )}

      {adding && <AddPartner focus={focus} track={filter === 'all' ? 'embedded' : filter} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void load() }} />}
    </div>
  )
}

function PartnerCard({ p, onSaved, onDeleted }: { p: Partner; onSaved: (id: string, partnership: Partnership) => void; onDeleted: (id: string) => void }) {
  const s = p.partnership
  const { full: canDelete } = useAdminAccess()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    we_give: s.we_give ?? '', we_get: s.we_get ?? '', revenue_model: s.revenue_model ?? '',
    est_annual_usd: s.est_annual_usd === null ? '' : String(s.est_annual_usd), next_step: s.next_step ?? '', next_step_due: s.next_step_due ?? '',
    research: s.research ?? '',
  })
  const [why, setWhy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dropping, setDropping] = useState(false)
  const t = track(s.track)
  const at = partnerStageIndex(s.stage)
  const due = s.next_step_due ? dueLabel(s.next_step_due) : null

  async function save(body: Record<string, unknown>) {
    setBusy(true); setErr('')
    try { const d = await api<{ partnership: Partnership }>(`/api/admin/sales/partners/${p.id}`, { method: 'PATCH', body }); onSaved(p.id, d.partnership) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy(false) }
  }
  const saveField = (k: keyof typeof f) => {
    const before = k === 'est_annual_usd' ? (s.est_annual_usd === null ? '' : String(s.est_annual_usd)) : (s[k] ?? '')
    if (f[k] !== before) void save({ [k]: f[k] })
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-5 ${isLive(s.stage) ? 'border-green-200' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href={`/admin/partners/${p.id}`} className="text-base font-bold text-gray-900 hover:underline">{p.name}</Link>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="rounded-full bg-[#E8F1F8] text-[#0D2B45] font-semibold px-2 py-0.5 mr-1.5">{t.short}</span>
            {[country(p.country_iso3) || 'Global', docLabel(s.document)].join(' · ')}
          </p>
          {p.contact ? (
            <p className="text-sm text-gray-800 mt-1.5">
              {p.contact.name}{p.contact.title && <span className="text-gray-500">, {p.contact.title}</span>}
              {p.contact.linkedin_url && <a href={p.contact.linkedin_url} target="_blank" rel="noreferrer" className="ml-1.5 text-[#0A66C2] inline-flex items-center"><LinkedInIcon size={12} /></a>}
              {p.contact_count > 1 && <span className="text-xs text-gray-400"> +{p.contact_count - 1}</span>}
            </p>
          ) : <p className="text-xs text-amber-700 mt-1.5">No person yet. Find the right one and add them on the organisation page.</p>}
        </div>
        <div className="text-right">
          <select value={s.stage} disabled={busy} onChange={(e) => {
            const to = e.target.value as PartnerStage
            if (to === 'dropped') setDropping(true); else void save({ stage: to })
          }} className="rounded-lg border border-gray-200 bg-white text-sm font-semibold px-2 py-1.5 text-gray-800">
            {PARTNER_STAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            {PARTNER_OFF.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          {s.est_annual_usd ? <span className="block text-[11px] text-gray-500 mt-1">{money(Number(s.est_annual_usd))} a year</span> : null}
        </div>
      </div>

      {at >= 0 && (
        <div className="mt-3 flex items-center gap-1" aria-label={partnerStageLabel(s.stage)}>
          {PARTNER_STAGES.map((x, i) => (
            <span key={x.id} title={x.label} className={`h-1.5 flex-1 rounded-full ${i < at ? 'bg-[#0D2B45]' : i === at ? (isLive(s.stage) ? 'bg-green-600' : 'bg-[#F5B800]') : 'bg-gray-100'}`} />
          ))}
        </div>
      )}
      {at >= 0 && <p className="mt-1.5 text-[11px] text-gray-500">{PARTNER_STAGES[at].hint}</p>}
      {s.stage === 'dropped' && s.dropped_reason && <p className="mt-1.5 text-xs text-gray-500">Dropped: {s.dropped_reason}</p>}

      {dropping && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <span className="text-xs text-gray-500 mr-1">Why?</span>
          {DROP_REASONS.map((r) => (
            <button key={r} disabled={busy} onClick={() => void save({ stage: 'dropped', reason: r }).then(() => setDropping(false))}
                    className="rounded-full border border-gray-200 text-xs px-2.5 py-1 text-gray-600 hover:bg-gray-50">{r}</button>
          ))}
          <button onClick={() => setDropping(false)} className="text-xs text-gray-400 px-1">Cancel</button>
        </div>
      )}

      <div className="mt-3 grid sm:grid-cols-[1fr_auto] gap-2 items-end">
        <label className="block">
          <span className="block text-[11px] font-semibold text-gray-500 mb-1">Next step</span>
          <input className={inputCls} value={f.next_step} placeholder={t.firstAsk} onChange={(e) => setF({ ...f, next_step: e.target.value })} onBlur={() => saveField('next_step')} />
        </label>
        <label className="block">
          <span className={`block text-[11px] font-semibold mb-1 ${due?.late ? 'text-red-600' : 'text-gray-500'}`}>{due ? `Due ${due.text}` : 'By when'}</span>
          <input type="date" className={inputCls} value={f.next_step_due} onChange={(e) => setF({ ...f, next_step_due: e.target.value })} onBlur={() => saveField('next_step_due')} />
        </label>
      </div>

      <div className="mt-3 rounded-xl bg-[#F7F4EC] px-3 py-2">
        <button onClick={() => setWhy(!why)} className="w-full flex items-center gap-1 text-xs font-semibold text-[#7A5B0C]">
          {why ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Why them
        </button>
        {why && (
          <div className="mt-1.5 space-y-2">
            <textarea className={inputCls} rows={3} value={f.research} placeholder="Why this partner, what we know, what to check" onChange={(e) => setF({ ...f, research: e.target.value })} onBlur={() => saveField('research')} />
            {s.sources?.length > 0 && (
              <ul className="space-y-0.5">
                {s.sources.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">{x.label}</a></li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <button onClick={() => setOpen(!open)} className="mt-3 text-xs font-semibold text-gray-600 inline-flex items-center gap-1">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} The deal: what each side brings, how we earn, the document
      </button>
      {open && (
        <div className="mt-2 grid sm:grid-cols-2 gap-3">
          <Field label="What we bring"><textarea className={inputCls} rows={2} value={f.we_give} onChange={(e) => setF({ ...f, we_give: e.target.value })} onBlur={() => saveField('we_give')} placeholder="Ready data for 54 countries, a shared workspace, a free team for their staff" /></Field>
          <Field label="What they bring"><textarea className={inputCls} rows={2} value={f.we_get} onChange={(e) => setF({ ...f, we_get: e.target.value })} onBlur={() => saveField('we_get')} placeholder="Their customers, a tender, a listing, projects" /></Field>
          <Field label="How we earn"><input className={inputCls} value={f.revenue_model} onChange={(e) => setF({ ...f, revenue_model: e.target.value })} onBlur={() => saveField('revenue_model')} placeholder={t.how} /></Field>
          <Field label="Rough value a year once live (USD)"><input className={inputCls} inputMode="numeric" value={f.est_annual_usd} onChange={(e) => setF({ ...f, est_annual_usd: e.target.value.replace(/[^\d.]/g, '') })} onBlur={() => saveField('est_annual_usd')} /></Field>
          <Field label="Track">
            <select className={inputCls} value={s.track} onChange={(e) => void save({ track: e.target.value })}>
              {TRACKS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </Field>
          <Field label="Document" hint={DOCUMENTS.find((d) => d.id === s.document)?.when}>
            <select className={inputCls} value={s.document ?? ''} onChange={(e) => void save({ document: e.target.value || null })}>
              <option value="">Not chosen</option>
              {DOCUMENTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </Field>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Link href={`/admin/partners/${p.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">People, timeline and notes <ArrowRight size={12} /></Link>
        {canDelete && (
          <button onClick={() => void deleteOrg(p.id, p.name).then((ok) => ok && onDeleted(p.id))} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600">
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>
    </div>
  )
}

function AddPartner({ focus, track: initial, onClose, onDone }: { focus: string[]; track: PartnerTrack; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', track: initial, country_iso3: '', website: '', cname: '', ctitle: '', clinkedin: '', next_step: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p })
  async function submit() {
    setBusy(true); setErr('')
    try {
      await api('/api/admin/sales/partners', { method: 'POST', body: {
        name: f.name, track: f.track, country_iso3: f.country_iso3 || null, website: f.website, next_step: f.next_step || track(f.track).firstAsk,
        contact: f.cname ? { name: f.cname, title: f.ctitle, linkedin_url: f.clinkedin } : undefined,
      } })
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add') }
    finally { setBusy(false) }
  }
  return (
    <Modal title="Add a partner" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Organisation"><input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Track" hint={track(f.track).how}>
          <select className={inputCls} value={f.track} onChange={(e) => set({ track: e.target.value as PartnerTrack })}>
            {TRACKS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Country" hint="Leave empty for a global partner."><CountrySelect value={f.country_iso3} onChange={(v) => set({ country_iso3: v })} focus={focus} /></Field>
        <Field label="Website"><input className={inputCls} value={f.website} onChange={(e) => set({ website: e.target.value })} /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Person (optional)"><input className={inputCls} value={f.cname} onChange={(e) => set({ cname: e.target.value })} /></Field>
          <Field label="Their title"><input className={inputCls} value={f.ctitle} onChange={(e) => set({ ctitle: e.target.value })} /></Field>
        </div>
        <Field label="Their LinkedIn profile"><input className={inputCls} value={f.clinkedin} onChange={(e) => set({ clinkedin: e.target.value })} placeholder="https://www.linkedin.com/in/…" /></Field>
        <Field label="Next step"><input className={inputCls} value={f.next_step} placeholder={track(f.track).firstAsk} onChange={(e) => set({ next_step: e.target.value })} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy || !f.name.trim()} onClick={() => void submit()} className="w-full rounded-lg bg-[#0D2B45] text-white text-sm font-semibold py-2.5 disabled:opacity-40">
          {busy ? 'Adding…' : 'Add partner'}
        </button>
      </div>
    </Modal>
  )
}
