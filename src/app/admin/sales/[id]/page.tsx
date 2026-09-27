'use client'

/**
 * /admin/sales/:id — one organisation in the pipeline: where it is and what
 * to do next (the playbook for its stage), the people there, email /
 * LinkedIn / call tools, tasks, discovery notes, the team account once it
 * has one, and the full timeline.
 */

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, Mail, Phone, CalendarCheck, MessageSquareReply, StickyNote, Plus, Star, Trash2, Pencil,
  ExternalLink, Copy, Check, Circle, Flag, Users, Play, BadgeDollarSign, Search, Send,
} from 'lucide-react'
import {
  LOST_REASONS, SECTORS, SOURCES, STAGE, STAGES, TEMPLATES, fill, sectorLabel, stageIndex, template,
  type Channel, type MergeFields, type Stage,
} from '@/lib/sales/playbook'
import {
  ago, api, country, dueLabel, linkedinSearch, money,
  type Activity, type Contact, type Settings, type Task,
} from '@/lib/sales/client'
import { CountrySelect, Field, LinkedInIcon, Modal, StageChip, inputCls } from '@/components/sales/ui'

interface Account {
  id: string; name: string; country_iso3: string | null; sector: string | null; website: string | null
  linkedin_url: string | null; size: string | null; source: string; stage: Stage; priority: number
  seats_estimate: number | null; value_usd: number | null; discovery: Record<string, string>
  lost_reason: string | null; nurture_until: string | null; notes: string | null; org_id: string | null
  stage_history: Record<string, string>; stage_changed_at: string; last_touch_at: string | null; created_at: string
}
interface Team {
  id: string; name: string; status: string; seat_count: number; access_expires_at: string | null
  members: { user_id: string; member_name: string | null; member_email: string | null; role: string }[]
  pending_invites: number; project_count: number; last_project_at: string | null
  plan: 'paid' | 'free'; free_datasets: string[] | null
}
interface Detail { account: Account; contacts: Contact[]; activities: Activity[]; tasks: Task[]; team: Team | null; settings: Settings }

const DISCOVERY: { key: string; label: string; hint: string }[] = [
  { key: 'project', label: 'The project', hint: 'What are they working on right now, and where?' },
  { key: 'countries', label: 'Countries and areas', hint: 'Where they work, and the areas they map most.' },
  { key: 'pain', label: 'What is hard today', hint: 'Finding data, cleaning it, sharing maps, keeping track of versions…' },
  { key: 'tools', label: 'What they use now', hint: 'QGIS, ArcGIS, Google Earth, consultants…' },
  { key: 'team', label: 'Team', hint: 'How many people touch GIS data, and their roles.' },
  { key: 'decision', label: 'Who decides and who pays', hint: 'Name the person who signs, and how they buy (PO, tender, card).' },
  { key: 'budget', label: 'Budget and timing', hint: 'Budget cycle, when a decision could happen.' },
  { key: 'success', label: 'What success looks like', hint: 'Agree this before they start their free team.' },
]

type ComposeState = { channel: Channel; templateId: string; contactId: string; taskId?: string }
type Dialog =
  | { kind: 'compose'; init: ComposeState }
  | { kind: 'log'; what: 'reply' | 'meeting' | 'note'; taskId?: string }
  | { kind: 'contact'; contact?: Contact }
  | { kind: 'task' }
  | { kind: 'stage'; to: Stage }
  | { kind: 'team'; action: 'paid' }
  | { kind: 'edit' }

export default function Wrapper() {
  return <Suspense fallback={<Spinner />}><AccountPage /></Suspense>
}
const Spinner = () => <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>

function AccountPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const params = useSearchParams()
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [openedTask, setOpenedTask] = useState(false)

  const load = useCallback(async () => {
    try { setD(await api<Detail>(`/api/admin/sales/${id}`)); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load') }
  }, [id])
  useEffect(() => { void load() }, [load])

  // Arriving from the Today list: open the tool for that task straight away.
  useEffect(() => {
    if (!d || openedTask) return
    setOpenedTask(true)
    const t = d.tasks.find((x) => x.id === params.get('task') && !x.done_at)
    if (t) openTask(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d])

  const primary = d?.contacts.find((c) => c.is_primary) ?? d?.contacts[0] ?? null

  function openTask(t: Task) {
    const contactId = t.contact_id ?? primary?.id ?? ''
    if (t.kind === 'email' || t.kind === 'linkedin' || t.kind === 'call') {
      const tpl = template(t.template)?.channel === t.kind ? t.template! : TEMPLATES.find((x) => x.channel === t.kind)!.id
      setDialog({ kind: 'compose', init: { channel: t.kind, templateId: tpl, contactId, taskId: t.id } })
    } else if (t.kind === 'meeting') setDialog({ kind: 'log', what: 'meeting', taskId: t.id })
  }

  if (err && !d) return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-gray-600">{err} <Link href="/admin/sales" className="underline">Back to the pipeline</Link></div>
  if (!d) return <Spinner />

  const { account: a } = d
  const info = STAGE[a.stage]
  const openTasks = d.tasks.filter((t) => !t.done_at)
  const merge = (c: Contact | null | undefined): MergeFields => ({
    first_name: (c?.name ?? '').split(/\s+/)[0] || 'there', company: a.name,
    country: country(a.country_iso3) || 'Africa',
    sector_hook: (SECTORS.find((s) => s.id === a.sector) ?? SECTORS[SECTORS.length - 1]).hook,
    my_name: d.settings.my_name,
  })

  async function taskOutcome(t: Task, outcome: 'done' | 'skipped' | null) {
    await api(`/api/admin/sales/${id}/tasks`, { method: 'PATCH', body: { task_id: t.id, outcome } }); void load()
  }
  async function moveTask(t: Task, due_on: string) {
    await api(`/api/admin/sales/${id}/tasks`, { method: 'PATCH', body: { task_id: t.id, due_on } }); void load()
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-gray-900">
      <Link href="/admin/sales" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft size={14} /> Pipeline</Link>

      <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 break-words">{a.priority === 1 && <Flag size={16} className="inline mr-1.5 text-red-500 align-baseline" />}{a.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {[country(a.country_iso3) || 'No country', sectorLabel(a.sector), SOURCES.find((s) => s.id === a.source)?.label].filter(Boolean).join(' · ')}
            {a.website && <> · <a href={a.website.startsWith('http') ? a.website : `https://${a.website}`} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">website</a></>}
            {a.linkedin_url && <> · <a href={a.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">LinkedIn page</a></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StageChip stage={a.stage} />
          <button onClick={() => setDialog({ kind: 'edit' })} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"><Pencil size={12} /> Edit</button>
        </div>
      </div>

      {/* Stage bar */}
      <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const at = stageIndex(a.stage)
          const done = at >= 0 && i < at
          const here = s === a.stage
          return (
            <button key={s} onClick={() => !here && setDialog({ kind: 'stage', to: s })} title={here ? 'Current stage' : `Move to ${STAGE[s].label}`}
                    className={`shrink-0 flex-1 min-w-[88px] rounded-md px-2 py-1.5 text-[11px] font-semibold text-center border ${here ? 'bg-[#0D2B45] text-white border-[#0D2B45]' : done ? 'bg-blue-50 text-[#0D2B45] border-blue-100' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
              {STAGE[s].short}
            </button>
          )
        })}
        <button onClick={() => a.stage !== 'nurture' && setDialog({ kind: 'stage', to: 'nurture' })} className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-semibold border ${a.stage === 'nurture' ? 'bg-stone-600 text-white border-stone-600' : 'bg-white text-gray-500 border-gray-200'}`}>Not now</button>
        <button onClick={() => a.stage !== 'lost' && setDialog({ kind: 'stage', to: 'lost' })} className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-semibold border ${a.stage === 'lost' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-500 border-gray-200'}`}>Lost</button>
      </div>

      <div className="mt-5 grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Playbook */}
          <section className="rounded-2xl border border-[#0D2B45]/15 bg-[#f3f7fb] p-4 sm:p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1E5F8E]">{info.label}: what to do</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">{info.goal}</p>
            <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc pl-5">{info.doNow.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="text-xs text-gray-500 mt-2"><b>Move on when:</b> {info.moveOn}</p>
            {a.stage === 'lost' && a.lost_reason && <p className="text-xs text-gray-600 mt-1"><b>Lost because:</b> {a.lost_reason}</p>}
            {a.stage === 'nurture' && a.nurture_until && <p className="text-xs text-gray-600 mt-1"><b>Check back on:</b> {a.nurture_until}</p>}
          </section>

          {/* Actions */}
          <section className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Action icon={Mail} label="Email" onClick={() => setDialog({ kind: 'compose', init: { channel: 'email', templateId: suggest(a.stage, 'email'), contactId: primary?.id ?? '' } })} />
            <Action icon={LinkedInIcon} label="LinkedIn" onClick={() => setDialog({ kind: 'compose', init: { channel: 'linkedin', templateId: suggest(a.stage, 'linkedin'), contactId: primary?.id ?? '' } })} />
            <Action icon={Phone} label="Call" onClick={() => setDialog({ kind: 'compose', init: { channel: 'call', templateId: 'call', contactId: primary?.id ?? '' } })} />
            <Action icon={MessageSquareReply} label="They replied" onClick={() => setDialog({ kind: 'log', what: 'reply' })} />
            <Action icon={CalendarCheck} label="Meeting held" onClick={() => setDialog({ kind: 'log', what: 'meeting' })} />
            <Action icon={StickyNote} label="Note" onClick={() => setDialog({ kind: 'log', what: 'note' })} />
          </section>

          {/* Tasks */}
          <Box title="Next steps" right={<button onClick={() => setDialog({ kind: 'task' })} className="text-xs font-semibold text-blue-700 inline-flex items-center gap-1"><Plus size={12} /> Add</button>}>
            {openTasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Nothing planned. {primary && a.stage === 'target' ? 'Start the outreach sequence from the person on the right.' : 'Add a next step so this one does not go cold.'}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {openTasks.map((t) => {
                  const dl = dueLabel(t.due_on)
                  const who = d.contacts.find((c) => c.id === t.contact_id)
                  const actionable = ['email', 'linkedin', 'call', 'meeting'].includes(t.kind)
                  return (
                    <li key={t.id} className="py-2.5 flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                      <button onClick={() => void taskOutcome(t, 'done')} title="Mark done" className="shrink-0 text-gray-300 hover:text-green-600"><Circle size={18} /></button>
                      <div className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-0">
                        <div className="text-sm text-gray-900">{t.title}{who ? <span className="text-gray-500">, {who.name}</span> : null}</div>
                        <div className={`text-xs ${dl.late ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{dl.text}{t.sequence ? ' · sequence' : ''}</div>
                      </div>
                      <div className="flex gap-1.5 ml-7 sm:ml-0">
                        {actionable && <button onClick={() => openTask(t)} className="rounded-md bg-[#0D2B45] text-white text-xs font-semibold px-2.5 py-1.5">Do it</button>}
                        <input type="date" value={t.due_on} onChange={(e) => e.target.value && void moveTask(t, e.target.value)} title="Move to another day" className="rounded-md border border-gray-200 text-xs px-1.5 py-1 w-[120px]" />
                        <button onClick={() => void taskOutcome(t, 'skipped')} className="rounded-md border border-gray-200 text-xs px-2 py-1.5 text-gray-500">Skip</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Box>

          {/* Discovery */}
          <Discovery account={a} onSaved={load} />

          {/* Timeline */}
          <Box title="Timeline">
            <ul className="space-y-3">
              {d.activities.map((x) => <TimelineItem key={x.id} x={x} contacts={d.contacts} />)}
            </ul>
          </Box>
        </div>

        <aside className="space-y-5">
          {/* People */}
          <Box title="People" right={<button onClick={() => setDialog({ kind: 'contact' })} className="text-xs font-semibold text-blue-700 inline-flex items-center gap-1"><Plus size={12} /> Add</button>}>
            {d.contacts.length === 0 && <p className="text-sm text-gray-500 py-1">No one yet. Find the GIS lead, environmental manager or project manager.</p>}
            <ul className="space-y-3">
              {d.contacts.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900">{c.name}{c.is_primary && <Star size={11} className="inline ml-1 text-amber-500 fill-amber-500" />}</div>
                      {c.title && <div className="text-xs text-gray-500">{c.title}</div>}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
                        {c.email && <a href={`mailto:${c.email}`} className="text-blue-700 hover:underline break-all">{c.email}</a>}
                        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1"><LinkedInIcon size={11} /> profile</a>}
                        {c.phone && <a href={`tel:${c.phone}`} className="text-blue-700">{c.phone}</a>}
                      </div>
                      {c.opted_out_at && <div className="mt-1 text-[11px] font-semibold text-red-700">Asked not to be emailed ({ago(c.opted_out_at)})</div>}
                    </div>
                    <button onClick={() => setDialog({ kind: 'contact', contact: c })} className="text-gray-300 hover:text-gray-700" title="Edit"><Pencil size={13} /></button>
                  </div>
                  {(c.email || c.linkedin_url) && ['target', 'contacted', 'nurture'].includes(a.stage) && (
                    <SequenceButton accountId={id} contact={c} onDone={load} />
                  )}
                </li>
              ))}
            </ul>
            <a href={linkedinSearch(a.name)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900">
              <Search size={12} /> Find people at {a.name} on LinkedIn
            </a>
          </Box>

          {/* Deal */}
          <Box title="Deal">
            <dl className="text-sm grid grid-cols-2 gap-y-1.5">
              <dt className="text-gray-500">Seats</dt><dd className="text-right text-gray-900">{a.seats_estimate ?? '—'}</dd>
              <dt className="text-gray-500">Value / 3 months</dt><dd className="text-right text-gray-900">{money(a.value_usd) || '—'}</dd>
              <dt className="text-gray-500">In this stage</dt><dd className="text-right text-gray-900">{ago(a.stage_changed_at).replace(' ago', '')}</dd>
              <dt className="text-gray-500">Last contact</dt><dd className="text-right text-gray-900">{ago(a.last_touch_at)}</dd>
              <dt className="text-gray-500">On the radar since</dt><dd className="text-right text-gray-900">{new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
            </dl>
          </Box>

          {/* Team */}
          <TeamBox account={a} team={d.team} onPaid={() => setDialog({ kind: 'team', action: 'paid' })}
                   onInvite={() => setDialog({ kind: 'compose', init: { channel: 'email', templateId: 'free_team', contactId: primary?.id ?? '' } })}
                   onLinked={load} />

          {a.notes && <Box title="Notes"><p className="text-sm text-gray-700 whitespace-pre-wrap">{a.notes}</p></Box>}

          <button onClick={async () => { if (confirm(`Delete ${a.name} and its whole history from the pipeline? This cannot be undone.`)) { await api(`/api/admin/sales/${id}`, { method: 'DELETE' }); router.push('/admin/sales') } }}
                  className="text-xs text-gray-400 hover:text-red-600 inline-flex items-center gap-1"><Trash2 size={12} /> Delete from the pipeline</button>
        </aside>
      </div>

      {dialog?.kind === 'compose' && <Composer accountId={id} init={dialog.init} contacts={d.contacts} merge={merge} signature={`${d.settings.my_name}\n${d.settings.signature}`} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void load() }} />}
      {dialog?.kind === 'log' && <LogDialog accountId={id} what={dialog.what} taskId={dialog.taskId} contacts={d.contacts} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void load() }} />}
      {dialog?.kind === 'contact' && <ContactDialog accountId={id} contact={dialog.contact} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void load() }} />}
      {dialog?.kind === 'task' && <TaskDialog accountId={id} contacts={d.contacts} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void load() }} />}
      {dialog?.kind === 'stage' && <StageDialog account={a} to={dialog.to} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void load() }} onTeam={(action) => setDialog({ kind: 'team', action })} />}
      {dialog?.kind === 'team' && <TeamDialog account={a} action={dialog.action} contacts={d.contacts} hasTeam={!!d.team} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void load() }} />}
      {dialog?.kind === 'edit' && <EditDialog account={a} focus={d.settings.focus_countries} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void load() }} />}
    </div>
  )
}

function suggest(stage: Stage, channel: 'email' | 'linkedin'): string {
  if (channel === 'linkedin') return stage === 'target' ? 'li_connect' : 'li_message'
  return ({ target: 'intro', contacted: 'follow_up', replied: 'meeting', meeting: 'free_team', free: 'free_checkin', proposal: 'proposal', won: 'onboarding', nurture: 'nurture' } as Record<string, string>)[stage] ?? 'intro'
}

function Action({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-semibold text-gray-700 hover:border-gray-400">
      <Icon size={16} className="text-[#1E5F8E]" />{label}
    </button>
  )
}

function Box({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-bold text-gray-900">{title}</h2>{right}</div>
      {children}
    </section>
  )
}

function SequenceButton({ accountId, contact, onDone }: { accountId: string; contact: Contact; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <div className="mt-1.5">
      <button disabled={busy} onClick={async () => {
        setBusy(true); setMsg('')
        try { const r = await api<{ steps: number }>(`/api/admin/sales/${accountId}/sequence`, { method: 'POST', body: { contact_id: contact.id } }); setMsg(`${r.steps} steps planned`); onDone() }
        catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
        finally { setBusy(false) }
      }} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 text-[#0D2B45] text-[11px] font-semibold px-2 py-1">
        <Play size={10} /> {busy ? 'Planning…' : 'Start 3 week sequence'}
      </button>
      {msg && <span className="ml-2 text-[11px] text-gray-500">{msg}</span>}
    </div>
  )
}

function TimelineItem({ x, contacts }: { x: Activity; contacts: Contact[] }) {
  const [open, setOpen] = useState(false)
  const who = contacts.find((c) => c.id === x.contact_id)
  const icon = { email: Mail, linkedin: LinkedInIcon, call: Phone, meeting: CalendarCheck, note: StickyNote, reply: MessageSquareReply, stage: Flag, task: Check, system: Circle }[x.kind] ?? Circle
  const Icon = icon
  const label = {
    email: x.meta?.sent_from_site ? 'Email sent' : 'Email sent (from your inbox)', linkedin: 'LinkedIn message', call: 'Call', meeting: 'Meeting',
    note: 'Note', reply: `They replied${x.meta?.channel ? ` (${String(x.meta.channel)})` : ''}`, stage: 'Stage', task: 'Task', system: '',
  }[x.kind]
  const long = (x.body?.length ?? 0) > 220
  return (
    <li className="flex gap-3">
      <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${x.direction === 'in' ? 'bg-green-50 text-green-700' : x.kind === 'stage' ? 'bg-blue-50 text-[#0D2B45]' : 'bg-gray-100 text-gray-500'}`}><Icon size={13} /></span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="text-gray-900">
          {label && <span className="font-semibold">{label}</span>}{label && (x.subject || who) ? ': ' : ''}
          {x.subject}{who && x.kind !== 'system' ? <span className="text-gray-500">{x.subject ? ', ' : ''}{who.name}</span> : null}
        </div>
        {x.body && (
          <div className="text-gray-600 whitespace-pre-wrap text-[13px] mt-0.5">
            {long && !open ? `${x.body.slice(0, 220)}…` : x.body}
            {long && <button onClick={() => setOpen(!open)} className="ml-1 text-blue-700 text-xs">{open ? 'less' : 'more'}</button>}
          </div>
        )}
        <div className="text-[11px] text-gray-400 mt-0.5">{new Date(x.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{x.created_by && !x.created_by.includes('@') ? ` · ${x.created_by}` : ''}</div>
      </div>
    </li>
  )
}

function Discovery({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState<Record<string, string>>(account.discovery ?? {})
  const [busy, setBusy] = useState(false)
  useEffect(() => setV(account.discovery ?? {}), [account.discovery])
  const filled = DISCOVERY.filter((q) => v[q.key]?.trim()).length
  if (stageIndex(account.stage) < stageIndex('replied') && !filled && !edit) return null
  return (
    <Box title={`Discovery notes (${filled} of ${DISCOVERY.length})`} right={!edit && <button onClick={() => setEdit(true)} className="text-xs font-semibold text-blue-700">Edit</button>}>
      {edit ? (
        <div className="space-y-3">
          {DISCOVERY.map((q) => (
            <Field key={q.key} label={q.label} hint={q.hint}>
              <textarea rows={2} className={inputCls} value={v[q.key] ?? ''} onChange={(e) => setV({ ...v, [q.key]: e.target.value })} />
            </Field>
          ))}
          <div className="flex gap-2">
            <button disabled={busy} onClick={async () => { setBusy(true); await api(`/api/admin/sales/${account.id}`, { method: 'PATCH', body: { discovery: v } }); setBusy(false); setEdit(false); onSaved() }}
                    className="rounded-lg bg-[#0D2B45] text-white text-sm font-semibold px-4 py-2">{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => { setV(account.discovery ?? {}); setEdit(false) }} className="rounded-lg border border-gray-200 text-sm px-4 py-2">Cancel</button>
          </div>
        </div>
      ) : filled === 0 ? (
        <p className="text-sm text-gray-500">Fill these in during or after the first call. They are what you need to win the deal.</p>
      ) : (
        <dl className="space-y-2 text-sm">
          {DISCOVERY.filter((q) => v[q.key]?.trim()).map((q) => (
            <div key={q.key}><dt className="text-xs font-semibold text-gray-500">{q.label}</dt><dd className="text-gray-800 whitespace-pre-wrap">{v[q.key]}</dd></div>
          ))}
          {DISCOVERY.length > filled && <p className="text-xs text-amber-700">Still to find out: {DISCOVERY.filter((q) => !v[q.key]?.trim()).map((q) => q.label.toLowerCase()).join(', ')}.</p>}
        </dl>
      )}
    </Box>
  )
}

function TeamBox({ account, team, onPaid, onInvite, onLinked }: {
  account: Account; team: Team | null; onPaid: () => void; onInvite: () => void; onLinked: () => void
}) {
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState('')
  const at = stageIndex(account.stage)
  if (!team) {
    if (at < stageIndex('replied') && account.stage !== 'nurture') return null
    return (
      <Box title="Team account">
        <p className="text-sm text-gray-600">
          No team yet. Invite them to start a free team (2 people, 3 datasets, no end date). When they do, it links here by itself.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={onInvite} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D2B45] text-white text-xs font-semibold px-3 py-2"><Mail size={12} /> Send the free team email</button>
          <button onClick={onPaid} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-xs font-semibold px-3 py-2 text-gray-700"><BadgeDollarSign size={13} /> Payment received</button>
          <button disabled={checking} onClick={async () => {
            setChecking(true); setMsg('')
            try { const r = await api<{ linked: boolean }>(`/api/admin/sales/${account.id}/team`, { method: 'POST', body: { action: 'link' } }); if (r.linked) onLinked(); else setMsg('No team found yet for the people on this account.') }
            catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setChecking(false) }
          }} className="text-xs text-blue-700 px-1">{checking ? 'Checking…' : 'Check now'}</button>
        </div>
        {msg && <p className="text-xs text-gray-500 mt-2">{msg}</p>}
      </Box>
    )
  }
  const free = team.plan === 'free'
  const ends = team.access_expires_at ? new Date(team.access_expires_at) : null
  const daysLeft = ends ? Math.ceil((ends.getTime() - Date.now()) / 86400_000) : null
  const steps = [
    { ok: true, label: free ? 'Free team created' : 'Team account created' },
    ...(free ? [{ ok: (team.free_datasets?.length ?? 0) >= 3, label: `Datasets chosen (${team.free_datasets?.length ?? 0} of 3)` }] : []),
    { ok: team.members.length + team.pending_invites >= 2, label: `Colleagues invited (${Math.max(0, team.members.length - 1) + team.pending_invites})` },
    { ok: team.members.length >= 2, label: `Colleagues joined (${Math.max(0, team.members.length - 1)})` },
    { ok: team.project_count >= 1, label: `First project made${team.project_count ? ` (${team.project_count})` : ''}` },
  ]
  return (
    <Box title={free ? 'Free team' : 'Customer team'} right={<Link href="/admin/organizations" className="text-xs text-blue-700 inline-flex items-center gap-1"><Users size={12} /> Organizations</Link>}>
      <p className="text-sm text-gray-700">
        <b>{team.name}</b>.{' '}
        {team.status !== 'active' ? <span className="text-red-700 font-semibold">Access is {team.status}. </span> : null}
        {free ? <>Free plan: {team.seat_count} seats{team.free_datasets?.length ? `, datasets: ${team.free_datasets.join(', ')}` : ''}.</>
          : ends ? (daysLeft! > 0 ? <>Paid until <b>{ends.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</b> ({daysLeft} days), {team.seat_count} seats.</> : <span className="text-red-700 font-semibold">Access ended {ends.toLocaleDateString('en-GB')}.</span>)
          : <>Permanent access, {team.seat_count} seats.</>}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {steps.map((s) => <li key={s.label} className={`flex items-center gap-2 ${s.ok ? 'text-gray-800' : 'text-gray-400'}`}>{s.ok ? <Check size={14} className="text-green-600" /> : <Circle size={14} />}{s.label}</li>)}
      </ul>
      {team.last_project_at && <p className="text-xs text-gray-500 mt-2">Last project activity {ago(team.last_project_at)}.</p>}
      {(free || at < stageIndex('won')) && <button onClick={onPaid} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0D2B45] text-white text-xs font-semibold px-3 py-2"><BadgeDollarSign size={13} /> Payment received</button>}
    </Box>
  )
}

// ── Dialogs ─────────────────────────────────────────────────────────────────

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr('')
    try { await fn(); onDone() } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong') } finally { setBusy(false) }
  }
  return { busy, err, run, setErr }
}

const Primary = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
  <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0D2B45] text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-50 ${p.className ?? ''}`}>{children}</button>
const Secondary = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
  <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold px-4 py-2.5 disabled:opacity-50 ${p.className ?? ''}`}>{children}</button>

function Composer({ accountId, init, contacts, merge, signature, onClose, onDone }: {
  accountId: string; init: ComposeState; contacts: Contact[]; merge: (c: Contact | null | undefined) => MergeFields
  signature: string; onClose: () => void; onDone: () => void
}) {
  const [channel, setChannel] = useState<Channel>(init.channel)
  const [tplId, setTplId] = useState(init.templateId)
  const [contactId, setContactId] = useState(init.contactId || contacts[0]?.id || '')
  const contact = contacts.find((c) => c.id === contactId)
  const tpl = template(tplId)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [outcome, setOutcome] = useState('')
  const [interested, setInterested] = useState(false)
  const [copied, setCopied] = useState(false)
  const s = useSubmit(onDone)

  // Refill when the template or the person changes.
  useEffect(() => {
    if (!tpl) return
    const f = merge(contact)
    setSubject(tpl.subject ? fill(tpl.subject, f) : '')
    setBody(fill(tpl.body, f))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplId, contactId])

  const options = TEMPLATES.filter((t) => t.channel === channel)
  function switchChannel(c: Channel) {
    setChannel(c)
    setTplId(c === init.channel ? init.templateId : TEMPLATES.find((t) => t.channel === c)!.id)
  }
  const placeholders = /\[[a-z ]+\]/i.test(`${subject}\n${body}`)
  const tooLong = channel === 'linkedin' && tplId === 'li_connect' && body.length > 300
  const mailto = contact?.email ? `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}\n\n${signature}`)}` : ''
  const logBody = { contact_id: contactId || null, task_id: init.taskId }

  return (
    <Modal title={channel === 'email' ? 'Email' : channel === 'linkedin' ? 'LinkedIn' : 'Call'} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {(['email', 'linkedin', 'call'] as Channel[]).map((c) => (
            <button key={c} onClick={() => switchChannel(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${channel === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
              {c === 'email' ? 'Email' : c === 'linkedin' ? 'LinkedIn' : 'Call'}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="To">
            <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {contacts.length === 0 && <option value="">Add a contact first</option>}
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.title ? `, ${c.title}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Template" hint={tpl?.when}>
            <select className={inputCls} value={tplId} onChange={(e) => setTplId(e.target.value)}>
              {options.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
        </div>

        {channel === 'email' && contact && !contact.email && <Warn>No email address for {contact.name}. Add one under People, or use LinkedIn.</Warn>}
        {channel === 'email' && contact?.opted_out_at && <Warn>{contact.name} asked not to be emailed. Sending is blocked.</Warn>}
        {channel === 'linkedin' && contact && !contact.linkedin_url && <Warn>No LinkedIn profile saved for {contact.name}. Search for them, then add the link under People.</Warn>}

        {channel === 'email' && <Field label="Subject"><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
        <Field label={channel === 'call' ? 'What to say' : 'Message'} hint={channel === 'email' ? 'Your name and signature are added underneath, with a small "rather not hear from me" link.' : undefined}>
          <textarea className={`${inputCls} leading-relaxed`} rows={channel === 'call' ? 8 : 11} value={body} onChange={(e) => setBody(e.target.value)} readOnly={channel === 'call'} />
        </Field>
        {placeholders && channel !== 'call' && <Warn>Fill in the parts in [square brackets] before sending.</Warn>}
        {tooLong && <Warn>LinkedIn connection notes are cut at about 300 characters. This one is {body.length}.</Warn>}

        {channel === 'call' && (
          <>
            <Field label="How did it go?"><textarea className={inputCls} rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Spoke to them / voicemail / no answer, and what was said" /></Field>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={interested} onChange={(e) => setInterested(e.target.checked)} /> They were interested (moves them to Replied)</label>
          </>
        )}

        {s.err && <p className="text-sm text-red-600">{s.err}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          {channel === 'email' && (
            <>
              <Primary disabled={s.busy || !contact?.email || !!contact?.opted_out_at || placeholders || !subject.trim()}
                       onClick={() => s.run(() => api(`/api/admin/sales/${accountId}/email`, { method: 'POST', body: { ...logBody, subject, body, template: tplId } }))}>
                <Send size={14} /> {s.busy ? 'Sending…' : 'Send now'}
              </Primary>
              {mailto && (
                <Secondary disabled={s.busy || !!contact?.opted_out_at} onClick={() => {
                  window.open(mailto, '_blank')
                  if (confirm('Did you send it from your email app? Press OK to log it here.')) void s.run(() => api(`/api/admin/sales/${accountId}/activity`, { method: 'POST', body: { ...logBody, kind: 'email', subject, body } }))
                }}><ExternalLink size={14} /> Open in my email app</Secondary>
              )}
            </>
          )}
          {channel === 'linkedin' && (
            <>
              <Secondary onClick={async () => { await navigator.clipboard.writeText(body).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy message'}
              </Secondary>
              <Secondary onClick={() => window.open(contact?.linkedin_url || linkedinSearch(`${contact?.name ?? ''} ${merge(contact).company}`), '_blank')}>
                <LinkedInIcon size={14} /> {contact?.linkedin_url ? 'Open their profile' : 'Search LinkedIn'}
              </Secondary>
              <Primary disabled={s.busy} onClick={() => s.run(() => api(`/api/admin/sales/${accountId}/activity`, { method: 'POST', body: { ...logBody, kind: 'linkedin', subject: tpl?.label, body } }))}>
                <Check size={14} /> I sent it
              </Primary>
            </>
          )}
          {channel === 'call' && (
            <>
              {contact?.phone && <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 text-sm font-semibold px-4 py-2.5 text-gray-700"><Phone size={14} /> Call {contact.phone}</a>}
              <Primary disabled={s.busy || !outcome.trim()} onClick={() => s.run(async () => {
                await api(`/api/admin/sales/${accountId}/activity`, { method: 'POST', body: { ...logBody, kind: 'call', body: outcome } })
                if (interested) await api(`/api/admin/sales/${accountId}/activity`, { method: 'POST', body: { contact_id: contactId || null, kind: 'reply', channel: 'phone', body: 'Interested on the phone.' } })
              })}><Check size={14} /> Log the call</Primary>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

const Warn = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{children}</p>

function LogDialog({ accountId, what, taskId, contacts, onClose, onDone }: {
  accountId: string; what: 'reply' | 'meeting' | 'note'; taskId?: string; contacts: Contact[]; onClose: () => void; onDone: () => void
}) {
  const [body, setBody] = useState('')
  const [channel, setChannel] = useState('email')
  const [contactId, setContactId] = useState(contacts.find((c) => c.is_primary)?.id ?? contacts[0]?.id ?? '')
  const s = useSubmit(onDone)
  const title = { reply: 'They replied', meeting: 'Meeting held', note: 'Add a note' }[what]
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {what !== 'note' && contacts.length > 0 && (
          <Field label="Who">
            <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
        )}
        {what === 'reply' && (
          <Field label="How">
            <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="phone">Phone</option><option value="in person">In person</option><option value="other">Other</option>
            </select>
          </Field>
        )}
        <Field label={what === 'reply' ? 'What they said (paste their reply, or the gist)' : what === 'meeting' ? 'What you learned' : 'Note'}
               hint={what === 'meeting' ? 'Fill in the discovery notes afterwards too.' : what === 'reply' ? 'The outreach sequence stops by itself.' : undefined}>
          <textarea autoFocus className={inputCls} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {s.err && <p className="text-sm text-red-600">{s.err}</p>}
        <Primary disabled={s.busy || (what === 'note' && !body.trim())} className="w-full"
                 onClick={() => s.run(() => api(`/api/admin/sales/${accountId}/activity`, { method: 'POST', body: { kind: what, body, channel, contact_id: what === 'note' ? null : contactId || null, task_id: taskId } }))}>
          {s.busy ? 'Saving…' : 'Save'}
        </Primary>
      </div>
    </Modal>
  )
}

function ContactDialog({ accountId, contact, onClose, onDone }: { accountId: string; contact?: Contact; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: contact?.name ?? '', title: contact?.title ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '', linkedin_url: contact?.linkedin_url ?? '', notes: contact?.notes ?? '', is_primary: contact?.is_primary ?? false })
  const [reopt, setReopt] = useState(false)
  const s = useSubmit(onDone)
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p })
  return (
    <Modal title={contact ? `Edit ${contact.name}` : 'Add a person'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input autoFocus className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Job title"><input className={inputCls} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        </div>
        <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="LinkedIn profile"><input className={inputCls} value={f.linkedin_url} onChange={(e) => set({ linkedin_url: e.target.value })} placeholder="https://www.linkedin.com/in/…" /></Field>
        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Notes"><textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.is_primary} onChange={(e) => set({ is_primary: e.target.checked })} /> Main contact</label>
        {contact?.opted_out_at && (
          <label className="flex items-start gap-2 text-xs text-gray-600 bg-red-50 rounded-lg p-2.5">
            <input type="checkbox" checked={reopt} onChange={(e) => setReopt(e.target.checked)} className="mt-0.5" />
            They asked not to be emailed. Only tick this if they have since asked you to email them again.
          </label>
        )}
        {s.err && <p className="text-sm text-red-600">{s.err}</p>}
        <div className="flex gap-2">
          <Primary disabled={s.busy || !f.name.trim()} className="flex-1" onClick={() => s.run(() => contact
            ? api(`/api/admin/sales/${accountId}/contacts`, { method: 'PATCH', body: { contact_id: contact.id, ...f, ...(reopt ? { opted_out: false } : {}) } })
            : api(`/api/admin/sales/${accountId}/contacts`, { method: 'POST', body: f }))}>{s.busy ? 'Saving…' : 'Save'}</Primary>
          {contact && <Secondary disabled={s.busy} onClick={() => { if (confirm(`Remove ${contact.name}?`)) void s.run(() => api(`/api/admin/sales/${accountId}/contacts?contact=${contact.id}`, { method: 'DELETE' })) }}><Trash2 size={14} /></Secondary>}
        </div>
      </div>
    </Modal>
  )
}

function TaskDialog({ accountId, contacts, onClose, onDone }: { accountId: string; contacts: Contact[]; onClose: () => void; onDone: () => void }) {
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)
  const [f, setF] = useState({ title: '', due_on: tomorrow, kind: 'email', contact_id: contacts.find((c) => c.is_primary)?.id ?? '' })
  const s = useSubmit(onDone)
  return (
    <Modal title="Add a next step" onClose={onClose}>
      <div className="space-y-3">
        <Field label="What"><input autoFocus className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Send the pilot results" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="When"><input type="date" className={inputCls} value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} /></Field>
          <Field label="How">
            <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="call">Call</option><option value="meeting">Meeting</option><option value="other">Other</option>
            </select>
          </Field>
        </div>
        {contacts.length > 0 && (
          <Field label="With">
            <select className={inputCls} value={f.contact_id} onChange={(e) => setF({ ...f, contact_id: e.target.value })}>
              <option value="">Nobody in particular</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {s.err && <p className="text-sm text-red-600">{s.err}</p>}
        <Primary className="w-full" disabled={s.busy || !f.title.trim()} onClick={() => s.run(() => api(`/api/admin/sales/${accountId}/tasks`, { method: 'POST', body: { ...f, contact_id: f.contact_id || null } }))}>{s.busy ? 'Saving…' : 'Add'}</Primary>
      </div>
    </Modal>
  )
}

function StageDialog({ account, to, onClose, onDone, onTeam }: { account: Account; to: Stage; onClose: () => void; onDone: () => void; onTeam: (a: 'paid') => void }) {
  const [note, setNote] = useState('')
  const [reason, setReason] = useState(LOST_REASONS[0])
  const [other, setOther] = useState('')
  const [until, setUntil] = useState(new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10))
  const s = useSubmit(onDone)
  // Won is best done through "Payment received", which also sets up access.
  const viaTeam = to === 'won' && account.stage !== 'acquired'
  return (
    <Modal title={`Move to ${STAGE[to].label}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">{STAGE[to].goal}</p>
        {viaTeam && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-[#0D2B45]">
            Recording the payment here also starts their 3 months of team access.
            <div className="mt-2"><Primary onClick={() => onTeam('paid')}>Payment received</Primary></div>
            <p className="text-xs mt-2 text-gray-600">Or just move the stage without changing access:</p>
          </div>
        )}
        {to === 'lost' && (
          <Field label="Why">
            <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
            {reason === 'Other' && <input className={`${inputCls} mt-2`} value={other} onChange={(e) => setOther(e.target.value)} placeholder="What happened" />}
          </Field>
        )}
        {to === 'nurture' && <Field label="Check back on"><input type="date" className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)} /></Field>}
        <Field label="Note (optional)"><textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {s.err && <p className="text-sm text-red-600">{s.err}</p>}
        <Primary className="w-full" disabled={s.busy} onClick={() => s.run(() => api(`/api/admin/sales/${account.id}`, {
          method: 'PATCH', body: { stage: to, note, lost_reason: reason === 'Other' && other.trim() ? `Other: ${other.trim()}` : reason, nurture_until: until },
        }))}>{s.busy ? 'Moving…' : `Move to ${STAGE[to].label}`}</Primary>
      </div>
    </Modal>
  )
}

function TeamDialog({ account, action, contacts, hasTeam, onClose, onDone }: {
  account: Account; action: 'paid'; contacts: Contact[]; hasTeam: boolean; onClose: () => void; onDone: () => void
}) {
  const withEmail = contacts.filter((c) => c.email)
  const [contactId, setContactId] = useState(withEmail.find((c) => c.is_primary)?.id ?? withEmail[0]?.id ?? '')
  const [seats, setSeats] = useState(String(account.seats_estimate ?? 4))
  const [value, setValue] = useState(account.value_usd !== null ? String(account.value_usd) : Number(seats) <= 4 ? '350' : '1000')
  const s = useSubmit(onDone)
  const needOwner = !hasTeam
  return (
    <Modal title="Payment received" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          {hasTeam
            ? 'Starts 3 months of paid access for their team: a free team becomes paid in place, with its projects and members, and gets the seats below and every dataset.'
            : 'If this person already started a free team, that team is upgraded. Otherwise a new team is created with them as owner. Either way, 3 months of access start today.'}
        </p>
        {needOwner && (
          <Field label="Team owner" hint="They need a Lenga Maps account with this email. If not, ask them to sign up first (it is free).">
            <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {withEmail.length === 0 && <option value="">Add a contact with an email first</option>}
              {withEmail.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seats"><input type="number" min={1} className={inputCls} value={seats} onChange={(e) => setSeats(e.target.value)} /></Field>
          {<Field label="Paid, USD per 3 months"><input type="number" min={0} className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} /></Field>}
        </div>
        {s.err && <p className="text-sm text-red-600">{s.err}</p>}
        <Primary className="w-full" disabled={s.busy || (needOwner && !contactId)} onClick={() => s.run(() => api(`/api/admin/sales/${account.id}/team`, {
          method: 'POST', body: { action, contact_id: contactId || null, seats: Number(seats), value_usd: action === 'paid' ? Number(value) : undefined },
        }))}>{s.busy ? 'Working…' : 'Record payment and start access'}</Primary>
      </div>
    </Modal>
  )
}

function EditDialog({ account, focus, onClose, onDone }: { account: Account; focus: string[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    name: account.name, country_iso3: account.country_iso3 ?? '', sector: account.sector ?? '', website: account.website ?? '',
    linkedin_url: account.linkedin_url ?? '', size: account.size ?? '', source: account.source, priority: account.priority,
    seats_estimate: account.seats_estimate?.toString() ?? '', value_usd: account.value_usd?.toString() ?? '', notes: account.notes ?? '',
  })
  const s = useSubmit(onDone)
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p })
  return (
    <Modal title="Edit organisation" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country"><CountrySelect value={f.country_iso3} onChange={(v) => set({ country_iso3: v })} focus={focus} /></Field>
          <Field label="Sector"><select className={inputCls} value={f.sector} onChange={(e) => set({ sector: e.target.value })}><option value="">Choose</option>{SECTORS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
          <Field label="How we found them"><select className={inputCls} value={f.source} onChange={(e) => set({ source: e.target.value })}>{SOURCES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
          <Field label="Priority"><select className={inputCls} value={f.priority} onChange={(e) => set({ priority: Number(e.target.value) })}><option value={1}>High</option><option value={2}>Normal</option><option value={3}>Low</option></select></Field>
          <Field label="Seats (estimate)"><input type="number" min={1} className={inputCls} value={f.seats_estimate} onChange={(e) => set({ seats_estimate: e.target.value })} /></Field>
          <Field label="Value, USD per 3 months"><input type="number" min={0} className={inputCls} value={f.value_usd} onChange={(e) => set({ value_usd: e.target.value })} /></Field>
        </div>
        <Field label="Website"><input className={inputCls} value={f.website} onChange={(e) => set({ website: e.target.value })} /></Field>
        <Field label="LinkedIn company page"><input className={inputCls} value={f.linkedin_url} onChange={(e) => set({ linkedin_url: e.target.value })} /></Field>
        <Field label="Size"><input className={inputCls} value={f.size} onChange={(e) => set({ size: e.target.value })} placeholder="e.g. 200 staff, 6 in GIS" /></Field>
        <Field label="Notes"><textarea className={inputCls} rows={4} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        {s.err && <p className="text-sm text-red-600">{s.err}</p>}
        <Primary className="w-full" disabled={s.busy || !f.name.trim()} onClick={() => s.run(() => api(`/api/admin/sales/${account.id}`, { method: 'PATCH', body: { ...f, country_iso3: f.country_iso3 || null, sector: f.sector || null } }))}>{s.busy ? 'Saving…' : 'Save'}</Primary>
      </div>
    </Modal>
  )
}
