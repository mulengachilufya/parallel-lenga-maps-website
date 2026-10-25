'use client'

/**
 * /admin/sales — the enterprise sales pipeline.
 *
 *   Today      what to do now: tasks due, replies waiting, deals going cold
 *   Drafts     researched first emails to read, edit and send
 *   Prospects  everyone on the radar, filterable by country, stage, sector
 *   Board      the pipeline as columns, one per stage
 *   Countries  how each focus country is going
 *   Numbers    the funnel, conversion between stages, value, lost reasons
 *
 * Each organisation has its own page (/admin/sales/:id) with its people,
 * timeline, email / LinkedIn / call tools and the stage playbook.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Plus, Upload, Settings2, X } from 'lucide-react'
import { SECTORS, SOURCES } from '@/lib/sales/playbook'
import { AFRICAN_COUNTRIES, api, country, type Settings } from '@/lib/sales/client'
import { CountrySelect, Field, Modal, inputCls } from '@/components/sales/ui'
import DraftsTab from '@/components/sales/DraftsTab'
import LinkedInTab from '@/components/sales/LinkedInTab'
import SentTab, { type SentPayload } from '@/components/sales/SentTab'
import OutcomesTab from '@/components/sales/OutcomesTab'
import CountriesTab from '@/components/sales/CountriesTab'

// The pipeline is outreach only: drafts to send on each channel, then Sent.
// What happens after a reply is handled by hand (calls are booked on Calendly).
type Tab = 'email' | 'linkedin' | 'sent' | 'outcomes' | 'countries'
const TABS: { id: Tab; label: string }[] = [
  { id: 'email', label: 'Email drafts' }, { id: 'linkedin', label: 'LinkedIn drafts' }, { id: 'sent', label: 'Sent' },
  { id: 'outcomes', label: 'Outcomes' }, { id: 'countries', label: 'Countries' },
]


export default function SalesPageWrapper() {
  return <Suspense fallback={<div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>}><SalesPage /></Suspense>
}

function SalesPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') as Tab : 'email')
  const [modal, setModal] = useState<null | 'add' | 'import' | 'settings'>(null)
  const [counts, setCounts] = useState<Record<Tab, number | null>>({ email: null, linkedin: null, sent: null, outcomes: null, countries: null })

  // Counts only (cheap): the lists load inside their own tab.
  const loadCounts = useCallback(() => {
    api<SentPayload>('/api/admin/sales/sent?pipeline=sales')
      .then((d) => setCounts((c) => ({ ...c, email: d.counts.email_drafts, linkedin: d.counts.linkedin_drafts, sent: d.email.length + d.linkedin.length })))
      .catch(() => {})
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])
  useEffect(() => { api<{ settings: Settings }>('/api/admin/sales/settings').then((d) => setSettings(d.settings)).catch(() => {}) }, [])

  function go(t: Tab) {
    setTab(t)
    const u = new URL(window.location.href)
    u.searchParams.set('tab', t)
    window.history.replaceState(null, '', u)
  }
  const focus = settings?.focus_countries ?? []

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-gray-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">Who we are reaching out to, by email and on LinkedIn.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setModal('add')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D2B45] text-white text-sm font-semibold px-3.5 py-2"><Plus size={15} /> Add prospect</button>
          <button onClick={() => setModal('import')} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold px-3 py-2 text-gray-700"><Upload size={14} /> Import list</button>
          {settings && <button onClick={() => setModal('settings')} title="Email signature" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-sm px-3 py-2 text-gray-700"><Settings2 size={14} /><span className="hidden sm:inline">Settings</span></button>}
        </div>
      </div>

      <nav className="mt-5 flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)}
                  className={`shrink-0 px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-[#0D2B45] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}{counts[t.id] !== null && <span className="text-gray-400 font-normal"> ({counts[t.id]!.toLocaleString()})</span>}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === 'email' && <DraftsTab onCount={(n) => { setCounts((c) => ({ ...c, email: n })); loadCounts() }} />}
        {tab === 'linkedin' && <LinkedInTab onCount={(n) => { setCounts((c) => ({ ...c, linkedin: n })); loadCounts() }} />}
        {tab === 'sent' && <SentTab />}
        {tab === 'outcomes' && <OutcomesTab />}
        {tab === 'countries' && <CountriesTab />}
      </div>

      {modal === 'add' && <AddProspect focus={focus} onClose={() => setModal(null)} onDone={(id) => { setModal(null); router.push(`/admin/sales/${id}`) }} />}
      {modal === 'import' && <ImportList onClose={() => setModal(null)} onDone={() => { setModal(null); loadCounts(); go('linkedin') }} />}
      {modal === 'settings' && settings && <SettingsModal settings={settings} onClose={() => setModal(null)} onSaved={(s) => { setSettings(s); setModal(null) }} />}
    </div>
  )
}

// ── Modals ──────────────────────────────────────────────────────────────────

function AddProspect({ focus, onClose, onDone }: { focus: string[]; onClose: () => void; onDone: (id: string) => void }) {
  const [f, setF] = useState({ name: '', country_iso3: focus.length === 1 ? focus[0] : '', sector: '', website: '', source: 'outbound', priority: 2, cname: '', ctitle: '', cemail: '', clinkedin: '', seq: true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p })
  async function save() {
    setBusy(true); setErr('')
    try {
      const r = await api<{ account: { id: string } }>('/api/admin/sales', {
        method: 'POST', body: {
          name: f.name, country_iso3: f.country_iso3 || null, sector: f.sector || null, website: f.website, source: f.source, priority: f.priority,
          contact: f.cname ? { name: f.cname, title: f.ctitle, email: f.cemail, linkedin_url: f.clinkedin } : undefined,
          start_sequence: !!f.cname && (!!f.cemail || !!f.clinkedin) && f.seq,
        },
      })
      onDone(r.account.id)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); setBusy(false) }
  }
  return (
    <Modal title="Add a prospect" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Organisation"><input autoFocus className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Kansanshi Mining" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country"><CountrySelect value={f.country_iso3} onChange={(v) => set({ country_iso3: v })} focus={focus} /></Field>
          <Field label="Sector">
            <select className={inputCls} value={f.sector} onChange={(e) => set({ sector: e.target.value })}>
              <option value="">Choose</option>{SECTORS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How we found them">
            <select className={inputCls} value={f.source} onChange={(e) => set({ source: e.target.value })}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </Field>
          <Field label="Priority">
            <select className={inputCls} value={f.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>
              <option value={1}>High</option><option value={2}>Normal</option><option value={3}>Low</option>
            </select>
          </Field>
        </div>
        <Field label="Website (optional)"><input className={inputCls} value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></Field>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-700 mb-2">The person to reach (optional, you can add them later)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className={inputCls} value={f.cname} onChange={(e) => set({ cname: e.target.value })} /></Field>
            <Field label="Job title"><input className={inputCls} value={f.ctitle} onChange={(e) => set({ ctitle: e.target.value })} placeholder="GIS Manager" /></Field>
            <Field label="Email"><input className={inputCls} type="email" value={f.cemail} onChange={(e) => set({ cemail: e.target.value })} /></Field>
            <Field label="LinkedIn profile"><input className={inputCls} value={f.clinkedin} onChange={(e) => set({ clinkedin: e.target.value })} placeholder="https://www.linkedin.com/in/…" /></Field>
          </div>
          {f.cname && (f.cemail || f.clinkedin) && (
            <label className="flex items-center gap-2 mt-3 text-sm text-gray-700">
              <input type="checkbox" checked={f.seq} onChange={(e) => set({ seq: e.target.checked })} /> Start the 3 week outreach sequence now
            </label>
          )}
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={!f.name.trim() || busy} onClick={() => void save()} className="w-full rounded-lg bg-[#0D2B45] text-white font-semibold py-2.5 text-sm disabled:opacity-50">{busy ? 'Saving…' : 'Add to the radar'}</button>
      </div>
    </Modal>
  )
}

const IMPORT_COLS = ['name', 'country', 'sector', 'website', 'contact_name', 'contact_title', 'contact_email', 'contact_linkedin'] as const

function parseList(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const split = (l: string) => {
    const out: string[] = []; let cur = ''; let q = false
    for (const ch of l) {
      if (ch === '"') q = !q
      else if (ch === sep && !q) { out.push(cur.trim()); cur = '' }
      else cur += ch
    }
    out.push(cur.trim()); return out
  }
  let header = split(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, ''))
  const known = (h: string) => (IMPORT_COLS as readonly string[]).includes(h) || ['organisation', 'organization', 'company', 'email', 'linkedin', 'title', 'contact'].includes(h)
  let body = lines.slice(1)
  if (!header.some(known)) { header = [...IMPORT_COLS]; body = lines }
  const alias: Record<string, string> = { organisation: 'name', organization: 'name', company: 'name', email: 'contact_email', linkedin: 'contact_linkedin', title: 'contact_title', contact: 'contact_name' }
  header = header.map((h) => alias[h] ?? h)
  return body.map((l) => Object.fromEntries(split(l).map((v, i) => [header[i] ?? `col${i}`, v])))
}

function ImportList({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ added: number; contactsAdded: number; skipped: number; problems: string[] } | null>(null)
  const [err, setErr] = useState('')
  const rows = useMemo(() => parseList(text), [text])
  async function go() {
    setBusy(true); setErr('')
    try { setResult(await api('/api/admin/sales/import', { method: 'POST', body: { rows } })) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Import failed') }
    finally { setBusy(false) }
  }
  return (
    <Modal title="Import a target list" onClose={result ? () => { onDone(); onClose() } : onClose} wide>
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="text-gray-800"><b>{result.added}</b> organisations added, <b>{result.contactsAdded}</b> contacts added{result.skipped ? `, ${result.skipped} already in the pipeline` : ''}.</p>
          {result.problems.length > 0 && <ul className="text-xs text-amber-800 bg-amber-50 rounded-lg p-3 space-y-1">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <button onClick={() => { onDone(); onClose() }} className="rounded-lg bg-[#0D2B45] text-white font-semibold px-4 py-2 text-sm">See them</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Paste from a spreadsheet (copy the cells) or a CSV. One organisation per line, with these columns in this order, or with a header row naming them:
          </p>
          <code className="block text-[11px] bg-gray-50 rounded-lg p-2.5 text-gray-700 overflow-x-auto whitespace-nowrap">{IMPORT_COLS.join(', ')}</code>
          <p className="text-xs text-gray-500">Only the name is required. Country can be the name (Nigeria) or the code (NGA). Already-listed organisations are not duplicated.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className={`${inputCls} font-mono text-xs`}
                    placeholder={'name,country,sector,website,contact_name,contact_title,contact_email,contact_linkedin\nAcme Water,Kenya,water,https://acme.example,Jane Doe,GIS Lead,jane@acme.example,'} />
          {rows.length > 0 && (
            <div className="text-xs text-gray-600">
              {rows.length} rows. First: <b>{rows[0].name || '(no name)'}</b>{rows[0].country ? `, ${rows[0].country}` : ''}{rows[0].contact_name ? `, ${rows[0].contact_name}` : ''}
            </div>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button disabled={!rows.length || busy} onClick={() => void go()} className="rounded-lg bg-[#0D2B45] text-white font-semibold px-4 py-2 text-sm disabled:opacity-50">{busy ? 'Importing…' : `Import ${rows.length || ''}`}</button>
        </div>
      )}
    </Modal>
  )
}

function SettingsModal({ settings, onClose, onSaved }: { settings: Settings; onClose: () => void; onSaved: (s: Settings) => void }) {
  const [focus, setFocus] = useState<string[]>(settings.focus_countries)
  const [name, setName] = useState(settings.my_name)
  const [sig, setSig] = useState(settings.signature)
  const [add, setAdd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true); setErr('')
    try { onSaved((await api<{ settings: Settings }>('/api/admin/sales/settings', { method: 'PUT', body: { focus_countries: focus, my_name: name, signature: sig } })).settings) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); setBusy(false) }
  }
  return (
    <Modal title="Sales settings" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">Focus countries</p>
          <p className="text-[11px] text-gray-400 mb-2">The markets you are working first. Lists, the board and the numbers start with these. Change them any time.</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {focus.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-[#0D2B45] text-xs font-semibold pl-2.5 pr-1 py-1">
                {country(c)} <button onClick={() => setFocus(focus.filter((x) => x !== c))} className="rounded-full hover:bg-blue-100 p-0.5" aria-label={`Remove ${country(c)}`}><X size={12} /></button>
              </span>
            ))}
            {focus.length === 0 && <span className="text-xs text-gray-400">None yet.</span>}
          </div>
          <select value={add} onChange={(e) => { if (e.target.value && !focus.includes(e.target.value)) setFocus([...focus, e.target.value]); setAdd('') }} className={inputCls}>
            <option value="">Add a country…</option>
            {AFRICAN_COUNTRIES.filter((c) => !focus.includes(c.iso3)).map((c) => <option key={c.iso3} value={c.iso3}>{c.name}</option>)}
          </select>
        </div>
        <Field label="Your name, as it appears in emails"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email signature (under your name)" hint="Emails go out from the founder address. Replies land in your Gmail as usual.">
          <textarea className={inputCls} rows={3} value={sig} onChange={(e) => setSig(e.target.value)} />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy} onClick={() => void save()} className="w-full rounded-lg bg-[#0D2B45] text-white font-semibold py-2.5 text-sm disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}
