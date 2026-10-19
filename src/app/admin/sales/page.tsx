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
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Loader2, Plus, Upload, Settings2, Search, Mail, Phone, CalendarCheck, Circle, RefreshCw, X, ChevronRight, Flag,
} from 'lucide-react'
import {
  ACTIVE_STAGES, LOST_REASONS, SECTORS, SOURCES, STAGE, STAGES, STALE_DAYS, furthest, sectorLabel, stageIndex, type Stage,
} from '@/lib/sales/playbook'
import {
  AFRICAN_COUNTRIES, ago, api, country, dueLabel, money,
  type AccountSummary, type Settings, type Task,
} from '@/lib/sales/client'
import { CountrySelect, Field, LinkedInIcon, Modal, StageChip, inputCls } from '@/components/sales/ui'
import DraftsTab from '@/components/sales/DraftsTab'

type Tab = 'today' | 'drafts' | 'prospects' | 'board' | 'countries' | 'numbers'
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'drafts', label: 'Drafts' }, { id: 'prospects', label: 'Prospects' }, { id: 'board', label: 'Board' },
  { id: 'countries', label: 'Countries' }, { id: 'numbers', label: 'Numbers' },
]

const KIND_ICON = { email: Mail, linkedin: LinkedInIcon, call: Phone, meeting: CalendarCheck, other: Circle } as const

export default function SalesPageWrapper() {
  return <Suspense fallback={<div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>}><SalesPage /></Suspense>
}

function SalesPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [data, setData] = useState<{ accounts: AccountSummary[]; tasks: Task[]; settings: Settings } | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'today')
  const [modal, setModal] = useState<null | 'add' | 'import' | 'settings'>(null)
  const [filters, setFilters] = useState({ q: '', country: params.get('country') || 'focus', stage: 'open', sector: '' })
  const [drafts, setDrafts] = useState(0)

  const load = useCallback(async () => {
    try { setData(await api('/api/admin/sales')); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    api<{ counts: { draft: number } }>('/api/admin/sales/drafts?status=draft').then((d) => setDrafts(d.counts.draft)).catch(() => {})
  }, [])

  function go(t: Tab, patch?: Partial<typeof filters>) {
    setTab(t)
    if (patch) setFilters((f) => ({ ...f, ...patch }))
    const u = new URL(window.location.href)
    u.searchParams.set('tab', t)
    window.history.replaceState(null, '', u)
  }

  if (err && !data) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-sm text-gray-600">{err}</div>
  }
  if (!data) return <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>

  const focus = data.settings.focus_countries

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-gray-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">
            From first message to a team that pays and uses Lenga Maps.
            {focus.length > 0 && <> Focus: {focus.map(country).join(', ')}.</>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setModal('add')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D2B45] text-white text-sm font-semibold px-3.5 py-2"><Plus size={15} /> Add prospect</button>
          <button onClick={() => setModal('import')} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold px-3 py-2 text-gray-700"><Upload size={14} /> Import list</button>
          <button onClick={() => setModal('settings')} title="Focus countries and email signature" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-sm px-3 py-2 text-gray-700"><Settings2 size={14} /><span className="hidden sm:inline">Settings</span></button>
          <button onClick={() => void load()} title="Refresh" className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-gray-500"><RefreshCw size={14} /></button>
        </div>
      </div>

      <nav className="mt-5 flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)}
                  className={`shrink-0 px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-[#0D2B45] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}
            {t.id === 'today' && dueToday(data.tasks) > 0 && <span className="ml-1.5 rounded-full bg-red-600 text-white text-[10px] px-1.5 py-0.5">{dueToday(data.tasks)}</span>}
            {t.id === 'drafts' && drafts > 0 && <span className="ml-1.5 rounded-full bg-[#0D2B45] text-white text-[10px] px-1.5 py-0.5">{drafts}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === 'today' && <TodayTab data={data} onOpen={(id, task) => router.push(`/admin/sales/${id}${task ? `?task=${task}` : ''}`)} onAdd={() => setModal('add')} onImport={() => setModal('import')} onSettings={() => setModal('settings')} />}
        {tab === 'drafts' && <DraftsTab onCount={setDrafts} />}
        {tab === 'prospects' && <ProspectsTab accounts={data.accounts} focus={focus} filters={filters} setFilters={setFilters} />}
        {tab === 'board' && <BoardTab accounts={data.accounts} focus={focus} />}
        {tab === 'countries' && <CountriesTab accounts={data.accounts} focus={focus} onCountry={(c) => go('prospects', { country: c, stage: 'all' })} onSettings={() => setModal('settings')} />}
        {tab === 'numbers' && <NumbersTab accounts={data.accounts} focus={focus} />}
      </div>

      {modal === 'add' && <AddProspect focus={focus} onClose={() => setModal(null)} onDone={(id) => { setModal(null); router.push(`/admin/sales/${id}`) }} />}
      {modal === 'import' && <ImportList onClose={() => setModal(null)} onDone={() => { void load(); go('prospects', { stage: 'all' }) }} />}
      {modal === 'settings' && <SettingsModal settings={data.settings} onClose={() => setModal(null)} onSaved={(s) => { setData({ ...data, settings: s }); setModal(null) }} />}
    </div>
  )
}

const today = () => new Date().toISOString().slice(0, 10)
const dueToday = (tasks: Task[]) => tasks.filter((t) => t.due_on <= today() && t.account_stage !== 'lost').length

// ── Today ───────────────────────────────────────────────────────────────────

function TodayTab({ data, onOpen, onAdd, onImport, onSettings }: {
  data: { accounts: AccountSummary[]; tasks: Task[]; settings: Settings }
  onOpen: (id: string, task?: string) => void; onAdd: () => void; onImport: () => void; onSettings: () => void
}) {
  const t = today()
  const tasks = data.tasks.filter((x) => x.account_stage !== 'lost')
  const due = tasks.filter((x) => x.due_on <= t)
  const soon = tasks.filter((x) => x.due_on > t)
  const now = Date.now()
  const waiting = data.accounts.filter((a) => a.stage === 'replied')
  const cold = data.accounts.filter((a) => ACTIVE_STAGES.includes(a.stage) && a.stage !== 'contacted'
    && now - new Date(a.last_touch_at ?? a.stage_changed_at).getTime() > STALE_DAYS * 86400_000)
  const noPlan = data.accounts.filter((a) => a.stage !== 'lost' && a.stage !== 'acquired' && !a.next_task)

  if (data.accounts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 max-w-2xl">
        <h2 className="text-lg font-bold text-gray-900">Start here</h2>
        <ol className="mt-3 space-y-2.5 text-sm text-gray-700 list-decimal pl-5">
          <li><button onClick={onSettings} className="text-blue-700 underline">Pick your focus countries</button>. Start with a few big markets rather than the whole continent.</li>
          <li>Build a target list: 10 to 20 organisations per country (mining houses, EIA consultancies, water utilities, engineering firms, NGOs). <button onClick={onImport} className="text-blue-700 underline">Paste it in</button>, or <button onClick={onAdd} className="text-blue-700 underline">add them one by one</button>.</li>
          <li>For each one, find the right person on LinkedIn and start the outreach sequence. It plans the next three weeks: emails, LinkedIn and a call.</li>
          <li>Come back to this tab every morning. It lists exactly what to do. You also get it by email.</li>
        </ol>
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <section className="lg:col-span-2 space-y-5">
        <Card title={`To do today${due.length ? ` (${due.length})` : ''}`}>
          {due.length === 0 ? <Empty>Nothing due. Add prospects or start a sequence to fill this up.</Empty> : <TaskList tasks={due} onOpen={onOpen} />}
        </Card>
        {soon.length > 0 && <Card title="Coming up this week"><TaskList tasks={soon} onOpen={onOpen} muted /></Card>}
      </section>
      <aside className="space-y-5">
        <Card title="Replied, waiting on you">
          {waiting.length === 0 ? <Empty>No one waiting.</Empty> : waiting.map((a) => <AccountLine key={a.id} a={a} note={`replied ${ago(a.stage_changed_at)}`} />)}
        </Card>
        <Card title={`Going cold (${STALE_DAYS}+ days quiet)`}>
          {cold.length === 0 ? <Empty>Nothing going cold.</Empty> : cold.slice(0, 12).map((a) => <AccountLine key={a.id} a={a} note={`last contact ${ago(a.last_touch_at)}`} />)}
        </Card>
        {noPlan.length > 0 && (
          <Card title="No next step planned">
            {noPlan.slice(0, 12).map((a) => <AccountLine key={a.id} a={a} note={STAGE[a.stage].short} />)}
            {noPlan.length > 12 && <p className="text-xs text-gray-400 pt-2">and {noPlan.length - 12} more</p>}
          </Card>
        )}
      </aside>
    </div>
  )
}

function TaskList({ tasks, onOpen, muted }: { tasks: Task[]; onOpen: (id: string, task?: string) => void; muted?: boolean }) {
  return (
    <ul className="divide-y divide-gray-100">
      {tasks.map((t) => {
        const Icon = KIND_ICON[t.kind] ?? Circle
        const d = dueLabel(t.due_on)
        return (
          <li key={t.id}>
            <button onClick={() => onOpen(t.account_id, t.id)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-gray-50 rounded-lg px-1">
              <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${muted ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700'}`}><Icon size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900 truncate">{t.title}</span>
                <span className="block text-xs text-gray-500 truncate">
                  {t.account_name}{t.country_iso3 ? ` · ${country(t.country_iso3)}` : ''}{t.contact ? ` · ${t.contact.name}` : ''}
                </span>
              </span>
              <span className={`shrink-0 text-xs ${d.late ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{d.text}</span>
              <ChevronRight size={15} className="shrink-0 text-gray-300" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function AccountLine({ a, note }: { a: AccountSummary; note: string }) {
  return (
    <Link href={`/admin/sales/${a.id}`} className="flex items-center gap-2 py-2 text-sm hover:bg-gray-50 rounded-lg px-1">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-gray-900 truncate">{a.name}</span>
        <span className="block text-xs text-gray-500 truncate">{[country(a.country_iso3), note].filter(Boolean).join(' · ')}</span>
      </span>
      <ChevronRight size={14} className="text-gray-300" />
    </Link>
  )
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-2"><h2 className="text-sm font-bold text-gray-900">{title}</h2>{right}</div>
      {children}
    </div>
  )
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-gray-400 py-3">{children}</p>

// ── Prospects ───────────────────────────────────────────────────────────────

type Filters = { q: string; country: string; stage: string; sector: string }

function applyFilters(accounts: AccountSummary[], f: Filters, focus: string[]) {
  const q = f.q.trim().toLowerCase()
  return accounts.filter((a) => {
    if (f.country === 'focus' && focus.length && !focus.includes(a.country_iso3 ?? '')) return false
    if (f.country === 'other' && focus.includes(a.country_iso3 ?? '')) return false
    if (f.country.length === 3 && a.country_iso3 !== f.country) return false
    if (f.stage === 'open' && (a.stage === 'lost' || a.stage === 'acquired')) return false
    if (f.stage !== 'open' && f.stage !== 'all' && a.stage !== f.stage) return false
    if (f.sector && a.sector !== f.sector) return false
    if (q && !`${a.name} ${a.contact?.name ?? ''} ${a.contact?.email ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
}

function ProspectsTab({ accounts, focus, filters, setFilters }: {
  accounts: AccountSummary[]; focus: string[]; filters: Filters; setFilters: (f: Filters) => void
}) {
  const shown = useMemo(() => applyFilters(accounts, filters, focus)
    .sort((a, b) => (a.priority - b.priority) || (stageIndex(b.stage) - stageIndex(a.stage)) || a.name.localeCompare(b.name)),
  [accounts, filters, focus])
  const set = (p: Partial<Filters>) => setFilters({ ...filters, ...p })
  const hiddenOutside = applyFilters(accounts, { ...filters, country: 'all' }, focus).length - shown.length
  const used = [...new Set(accounts.map((a) => a.country_iso3).filter(Boolean))] as string[]

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search organisations or people"
                 className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-sm" />
        </label>
        <select value={filters.country} onChange={(e) => set({ country: e.target.value })} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm">
          {focus.length > 0 && <option value="focus">Focus countries</option>}
          <option value="all">All countries</option>
          {focus.length > 0 && <option value="other">Outside the focus</option>}
          <optgroup label="Country">
            {AFRICAN_COUNTRIES.filter((c) => used.includes(c.iso3) || focus.includes(c.iso3)).map((c) => <option key={c.iso3} value={c.iso3}>{c.name}</option>)}
          </optgroup>
        </select>
        <select value={filters.stage} onChange={(e) => set({ stage: e.target.value })} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm">
          <option value="open">Still in play</option>
          <option value="all">Every stage</option>
          {[...STAGES, 'nurture', 'lost'].map((s) => <option key={s} value={s}>{STAGE[s as Stage].label}</option>)}
        </select>
        <select value={filters.sector} onChange={(e) => set({ sector: e.target.value })} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm">
          <option value="">Every sector</option>
          {SECTORS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {shown.length} of {accounts.length} organisations
        {filters.country === 'focus' && focus.length > 0 && hiddenOutside > 0 && (
          <> · {hiddenOutside} outside your focus countries or with no country set. <button onClick={() => set({ country: 'all' })} className="text-blue-700 underline">Show all</button></>
        )}
      </p>

      {/* Wide screens: a table. Phones: cards. */}
      <div className="hidden md:block mt-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr><th className="px-4 py-2.5 font-semibold">Organisation</th><th className="px-3 py-2.5 font-semibold">Country</th><th className="px-3 py-2.5 font-semibold">Stage</th><th className="px-3 py-2.5 font-semibold">Next step</th><th className="px-3 py-2.5 font-semibold">Last contact</th><th className="px-4 py-2.5 font-semibold text-right">Value</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((a) => {
              const d = a.next_task ? dueLabel(a.next_task.due_on) : null
              return (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/sales/${a.id}`} className="font-semibold text-gray-900 hover:underline">{a.priority === 1 && <Flag size={12} className="inline mr-1 text-red-500" />}{a.name}</Link>
                    <div className="text-xs text-gray-500">{a.contact ? `${a.contact.name}${a.contact.title ? `, ${a.contact.title}` : ''}` : <span className="text-amber-700">No contact yet</span>} · {sectorLabel(a.sector)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{country(a.country_iso3) || '—'}</td>
                  <td className="px-3 py-2.5"><StageChip stage={a.stage} /></td>
                  <td className="px-3 py-2.5 text-xs">{a.next_task ? <><span className="text-gray-800">{a.next_task.title}</span> <span className={d!.late ? 'text-red-600 font-semibold' : 'text-gray-400'}>{d!.text}</span></> : <span className="text-gray-400">None planned</span>}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{ago(a.last_touch_at)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{money(a.value_usd)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>No organisations match.</Empty>}
      </div>
      <div className="md:hidden mt-2 space-y-2">
        {shown.map((a) => (
          <Link key={a.id} href={`/admin/sales/${a.id}`} className="block bg-white rounded-xl border border-gray-100 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-gray-900">{a.priority === 1 && <Flag size={12} className="inline mr-1 text-red-500" />}{a.name}</span>
              <StageChip stage={a.stage} />
            </div>
            <div className="text-xs text-gray-500 mt-1">{[country(a.country_iso3), a.contact?.name ?? 'No contact yet', money(a.value_usd)].filter(Boolean).join(' · ')}</div>
            {a.next_task && <div className={`text-xs mt-1.5 ${dueLabel(a.next_task.due_on).late ? 'text-red-600' : 'text-gray-600'}`}>Next: {a.next_task.title}, {dueLabel(a.next_task.due_on).text}</div>}
          </Link>
        ))}
        {shown.length === 0 && <Empty>No organisations match.</Empty>}
      </div>
    </div>
  )
}

// ── Board ───────────────────────────────────────────────────────────────────

function BoardTab({ accounts, focus }: { accounts: AccountSummary[]; focus: string[] }) {
  const [scope, setScope] = useState(focus.length ? 'focus' : 'all')
  const list = accounts.filter((a) => scope === 'all' || focus.includes(a.country_iso3 ?? ''))
  const side = list.filter((a) => a.stage === 'nurture' || a.stage === 'lost')
  return (
    <div>
      {focus.length > 0 && (
        <div className="flex gap-2 mb-3 text-xs">
          {[['focus', 'Focus countries'], ['all', 'All countries']].map(([id, l]) => (
            <button key={id} onClick={() => setScope(id)} className={`rounded-full px-3 py-1.5 font-semibold border ${scope === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
          ))}
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
        {STAGES.map((s) => {
          const col = list.filter((a) => a.stage === s)
          const value = col.reduce((n, a) => n + (a.value_usd ?? 0), 0)
          return (
            <div key={s} className="snap-start shrink-0 w-[250px] bg-gray-100/80 rounded-xl p-2.5">
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-xs font-bold text-gray-700">{STAGE[s].label} · {col.length}</span>
                {value > 0 && <span className="text-[11px] text-gray-500">{money(value)}</span>}
              </div>
              <div className="space-y-2 max-h-[65vh] overflow-y-auto">
                {col.map((a) => (
                  <Link key={a.id} href={`/admin/sales/${a.id}`} className="block bg-white rounded-lg border border-gray-200 p-2.5 hover:border-gray-400">
                    <div className="text-sm font-semibold text-gray-900 leading-snug">{a.priority === 1 && <Flag size={11} className="inline mr-1 text-red-500" />}{a.name}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{[country(a.country_iso3), a.contact?.name].filter(Boolean).join(' · ') || 'No contact yet'}</div>
                    <div className="text-[11px] text-gray-400 mt-1">in stage {ago(a.stage_changed_at).replace(' ago', '')}{a.value_usd ? ` · ${money(a.value_usd)}` : ''}</div>
                  </Link>
                ))}
                {col.length === 0 && <p className="text-[11px] text-gray-400 px-1 py-2">Empty</p>}
              </div>
            </div>
          )
        })}
      </div>
      {side.length > 0 && (
        <p className="text-xs text-gray-500 mt-2">
          Also: {side.filter((a) => a.stage === 'nurture').length} not now, {side.filter((a) => a.stage === 'lost').length} lost. See them under Prospects.
        </p>
      )}
    </div>
  )
}

// ── Countries ───────────────────────────────────────────────────────────────

const BUCKETS: { label: string; stages: Stage[] }[] = [
  { label: 'On the radar', stages: ['target'] },
  { label: 'Contacted', stages: ['contacted'] },
  { label: 'Talking', stages: ['replied', 'meeting'] },
  { label: 'Free plan or proposal', stages: ['free', 'proposal'] },
  { label: 'Customers', stages: ['won', 'acquired'] },
]

function CountriesTab({ accounts, focus, onCountry, onSettings }: {
  accounts: AccountSummary[]; focus: string[]; onCountry: (iso3: string) => void; onSettings: () => void
}) {
  const others = [...new Set(accounts.map((a) => a.country_iso3 ?? '').filter((c) => !focus.includes(c)))]
  const rows = [...focus.map((c) => ({ iso3: c, focus: true })), ...others.map((c) => ({ iso3: c, focus: false }))]
  return (
    <div>
      {focus.length === 0 && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-sm text-amber-900">
          No focus countries yet. <button onClick={onSettings} className="underline font-semibold">Pick them</button> so the pipeline shows the markets you are working first.
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(({ iso3, focus: f }) => {
          const list = accounts.filter((a) => (a.country_iso3 ?? '') === iso3)
          const open = list.filter((a) => a.stage !== 'lost')
          const value = list.filter((a) => a.stage === 'won' || a.stage === 'acquired').reduce((n, a) => n + (a.value_usd ?? 0), 0)
          return (
            <button key={iso3 || 'none'} onClick={() => iso3 && onCountry(iso3)} className={`text-left bg-white rounded-2xl border shadow-sm p-4 hover:border-gray-400 ${f ? 'border-[#0D2B45]/30' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-gray-900">{country(iso3) || 'No country set'}</span>
                {f && <span className="text-[10px] font-bold uppercase tracking-wide text-[#0D2B45] bg-blue-50 rounded px-1.5 py-0.5">Focus</span>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{open.length} in play{value ? ` · ${money(value)} won` : ''}</p>
              <div className="mt-3 space-y-1.5">
                {BUCKETS.map((b) => {
                  const n = list.filter((a) => b.stages.includes(a.stage)).length
                  return (
                    <div key={b.label} className="flex items-center gap-2 text-xs" title={`${b.label}: ${n}`}>
                      <span className="w-28 shrink-0 text-gray-600">{b.label}</span>
                      <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <span className="block h-full rounded-full bg-[#1E5F8E]" style={{ width: `${list.length ? Math.max(n ? 4 : 0, (n / list.length) * 100) : 0}%` }} />
                      </span>
                      <span className="w-6 text-right tabular-nums text-gray-800">{n}</span>
                    </div>
                  )
                })}
              </div>
              {list.length === 0 && <p className="text-xs text-amber-700 mt-3">No prospects yet. Build the target list for this country.</p>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Numbers ─────────────────────────────────────────────────────────────────

function NumbersTab({ accounts, focus }: { accounts: AccountSummary[]; focus: string[] }) {
  const [scope, setScope] = useState(focus.length ? 'focus' : 'all')
  const list = accounts.filter((a) => scope === 'all' || focus.includes(a.country_iso3 ?? ''))
  const reached = STAGES.map((_, i) => list.filter((a) => furthest(a.stage_history, a.stage) >= i).length)
  const top = Math.max(1, reached[0])
  const won = list.filter((a) => a.stage === 'won' || a.stage === 'acquired')
  const lost = list.filter((a) => a.stage === 'lost')
  const open = list.filter((a) => !['won', 'acquired', 'lost'].includes(a.stage))
  const pipeline = open.reduce((n, a) => n + (a.value_usd ?? 0), 0)
  const weighted = open.reduce((n, a) => n + (a.value_usd ?? 0) * STAGE[a.stage].probability, 0)
  const wonValue = won.reduce((n, a) => n + (a.value_usd ?? 0), 0)
  const days = won.map((a) => (Date.parse(a.stage_history.won ?? a.stage_changed_at) - Date.parse(a.created_at)) / 86400_000).filter((d) => d >= 0)
  const avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null
  const reasons = LOST_REASONS.map((r) => ({ r, n: lost.filter((a) => (a.lost_reason ?? 'Other') === r).length })).filter((x) => x.n)
  const sources = SOURCES.map((s) => ({ ...s, n: list.filter((a) => a.source === s.id).length, w: list.filter((a) => a.source === s.id && (a.stage === 'won' || a.stage === 'acquired')).length })).filter((s) => s.n)

  return (
    <div className="space-y-5">
      {focus.length > 0 && (
        <div className="flex gap-2 text-xs">
          {[['focus', 'Focus countries'], ['all', 'All countries']].map(([id, l]) => (
            <button key={id} onClick={() => setScope(id)} className={`rounded-full px-3 py-1.5 font-semibold border ${scope === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Customers" value={String(won.length)} sub={wonValue ? `${money(wonValue)} per term` : 'none yet'} />
        <Stat label="Open pipeline" value={money(pipeline) || '$0'} sub={`${open.length} organisations`} />
        <Stat label="Likely to close" value={money(weighted) || '$0'} sub="pipeline × chance at each stage" />
        <Stat label="Win rate" value={won.length + lost.length ? `${Math.round((won.length / (won.length + lost.length)) * 100)}%` : '—'} sub={avgDays !== null ? `about ${avgDays} days to close` : 'of deals decided'} />
      </div>

      <Card title="The funnel: how many reached each stage">
        <div className="space-y-2 mt-1">
          {STAGES.map((s, i) => {
            const n = reached[i]
            const conv = i > 0 && reached[i - 1] ? Math.round((n / reached[i - 1]) * 100) : null
            return (
              <div key={s} className="flex items-center gap-3 text-sm" title={`${STAGE[s].label}: ${n}${conv !== null ? `, ${conv}% of the stage before` : ''}`}>
                <span className="w-28 sm:w-32 shrink-0 text-gray-700 text-xs sm:text-sm">{STAGE[s].label}</span>
                <span className="flex-1 h-5 bg-gray-50 rounded">
                  <span className="block h-full rounded bg-[#1E5F8E]" style={{ width: `${n ? Math.max(1.5, (n / top) * 100) : 0}%` }} />
                </span>
                <span className="w-8 text-right tabular-nums font-semibold text-gray-900">{n}</span>
                <span className="w-16 text-right text-xs text-gray-500 tabular-nums">{conv !== null ? `${conv}%` : ''}</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">The percentage is how many made it from the stage above. The weakest step is where to spend your effort.</p>
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        <Card title="Where deals come from">
          {sources.length === 0 ? <Empty>No data yet.</Empty> : (
            <table className="w-full text-sm"><tbody className="divide-y divide-gray-100">
              {sources.map((s) => <tr key={s.id}><td className="py-1.5 text-gray-700">{s.label}</td><td className="py-1.5 text-right tabular-nums">{s.n}</td><td className="py-1.5 text-right text-xs text-gray-500 w-24">{s.w} won</td></tr>)}
            </tbody></table>
          )}
        </Card>
        <Card title="Why deals were lost">
          {reasons.length === 0 ? <Empty>Nothing lost yet.</Empty> : (
            <table className="w-full text-sm"><tbody className="divide-y divide-gray-100">
              {reasons.sort((a, b) => b.n - a.n).map((x) => <tr key={x.r}><td className="py-1.5 text-gray-700">{x.r}</td><td className="py-1.5 text-right tabular-nums">{x.n}</td></tr>)}
            </tbody></table>
          )}
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>
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
