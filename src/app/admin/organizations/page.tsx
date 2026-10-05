'use client'

/**
 * /admin/organizations — provision and manage team-tier organizations.
 *
 * This is the founder's "which company is each member on a plan for" view:
 * every org, its seats, every member with their email, pending invites, the
 * promo-email flag (org-level marketing opt-in), status and quoted price.
 *
 * Suspending an org here immediately revokes its members' download access
 * (the API flips their plan_status); reactivating restores it.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, RefreshCw, Crown, Mail, Plus, CheckCircle2, AlertCircle, Minus } from 'lucide-react'
import { TEAM_MIN_SEATS, TEAM_TERMS, TEAM_TERM_ORDER, isTeamTerm, teamPrice, type TeamTerm } from '@/lib/pricing'

/** Which term was paid for: month, quarter or year. null = cancelled. */
function askTerm(): TeamTerm | null {
  const v = prompt('Term paid for: month, quarter (3 months) or year', 'month')?.trim().toLowerCase()
  if (!v) return null
  if (isTeamTerm(v)) return v
  alert('Type month, quarter or year.')
  return null
}

interface Member {
  org_id: string; user_id: string; role: 'owner' | 'member'
  member_name: string | null; member_email: string | null; joined_at: string | null
}
interface Invite { id: string; org_id: string; email: string; created_at: string }
interface Org {
  id: string; name: string; sector: string | null; region: string | null
  operating_countries: string[]; seat_count: number
  status: 'active' | 'suspended' | 'cancelled'
  contact_email: string | null; promo_emails: boolean
  monthly_price_usd: number | null; api_rate_per_min: number
  notes: string | null; created_at: string
  access_expires_at: string | null
  plan?: 'paid' | 'free'; free_datasets?: string[] | null
  members: Member[]; pending_invites: Invite[]
}

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState<Org[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [msg, setMsg] = useState('')
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Confirmation (or error) that stays on screen for a few seconds. */
  function notify(ok: boolean, text: string) {
    setToast({ ok, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), ok ? 4500 : 9000)
  }

  async function load() {
    const res = await fetch('/api/admin/orgs', { cache: 'no-store' })
    if (res.status === 403) { setForbidden(true); return }
    const j = await res.json().catch(() => ({}))
    setOrgs(j.orgs ?? [])
  }
  useEffect(() => { load() }, [])

  async function patch(id: string, changes: Record<string, unknown>, okText = 'Saved.'): Promise<boolean> {
    setMsg('')
    const res = await fetch('/api/admin/orgs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...changes }),
    }).catch(() => null)
    if (!res?.ok) {
      const j = await res?.json().catch(() => ({})) ?? {}
      notify(false, j.message ?? 'That did not save. Try again.')
    } else notify(true, okText)
    await load()
    return !!res?.ok
  }

  /** Admin write to a team; shows the error, reloads. True when it worked. */
  async function call(url: string, method: string, body: Record<string, unknown>, okText = 'Done.'): Promise<boolean> {
    setMsg('')
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const j = await res?.json().catch(() => ({})) ?? {}
    notify(!!res?.ok, j.message ?? (res?.ok ? okText : 'That did not work. Try again.'))
    await load()
    return !!res?.ok
  }

  if (forbidden) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">Admin access only.</div>
  }
  if (!orgs) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
  }

  const promoList = orgs
    .filter((o) => o.promo_emails && o.status === 'active')
    .flatMap((o) => o.members.map((m) => m.member_email).filter(Boolean)) as string[]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft size={15} /> Admin
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
            <p className="text-sm text-gray-500 mt-1">
              Team-tier accounts: seats, members, status, and the promo-email list.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={load} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 text-white px-4 py-2.5 text-sm font-semibold"
            >
              <Plus size={15} /> Provision org
            </button>
          </div>
        </div>

        {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}
        {toast && (
          <div role="status" aria-live="polite"
               className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-start gap-2.5 max-w-lg w-[calc(100%-2rem)] rounded-xl px-4 py-3 text-sm font-medium shadow-2xl ${
                 toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {toast.ok ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
            <span className="flex-1">{toast.text}</span>
            <button onClick={() => setToast(null)} className="opacity-80 hover:opacity-100" aria-label="Close">✕</button>
          </div>
        )}

        {showCreate && <CreateOrgForm onDone={(m) => { setShowCreate(false); notify(true, m); load() }} />}

        {/* Promo-email helper: copy-ready list of opted-in member addresses. */}
        {promoList.length > 0 && (
          <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2">
              <Mail size={15} className="text-gray-400" />
              <h2 className="text-sm font-bold text-gray-900">Promo-email audience ({promoList.length})</h2>
            </div>
            <p className="mt-1 text-xs text-gray-500">Members of active orgs that opted in to team updates. Copy-paste into your campaign BCC.</p>
            <textarea
              readOnly value={promoList.join(', ')}
              className="mt-3 w-full rounded-lg border border-gray-200 p-3 text-xs text-gray-700 bg-gray-50"
              rows={2}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        )}

        <div className="mt-6 space-y-5">
          {orgs.length === 0 && <p className="text-sm text-gray-400 py-10 text-center">No organizations provisioned yet.</p>}
          {orgs.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="font-bold text-gray-900">{o.name}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      o.status === 'active' ? 'bg-green-100 text-green-800'
                      : o.status === 'suspended' ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-200 text-gray-600'
                    }`}>{o.status}</span>
                    {o.plan === 'free' && <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-blue-100 text-blue-800">free team</span>}
                    <span className="text-[11px] text-gray-500">
                      {o.members.length}/{o.seat_count} seats
                      {o.pending_invites.length > 0 && ` · ${o.pending_invites.length} pending`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {[o.sector, o.region, o.monthly_price_usd ? `$${o.monthly_price_usd}/mo` : null, `${o.api_rate_per_min} req/min API`].filter(Boolean).join(' · ')}
                    {' · '}since {new Date(o.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    {' · '}{o.plan === 'free'
                      ? <>free plan (projects use members&apos; picks)</>
                      : o.access_expires_at
                      ? <span className={new Date(o.access_expires_at) < new Date() ? 'text-red-600 font-semibold' : ''}>
                          access until {new Date(o.access_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      : 'permanent access'}
                  </p>
                  {o.notes && <p className="mt-1.5 text-xs text-gray-500 italic">{o.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {o.plan === 'free' && (
                    <button
                      onClick={() => {
                        const seats = Number(prompt(`Payment received from ${o.name}. How many seats did they pay for? (${TEAM_MIN_SEATS} or more)`, String(TEAM_MIN_SEATS)))
                        if (!Number.isFinite(seats) || seats < Math.max(1, o.members.length)) return
                        const term = askTerm()
                        if (!term) return
                        const price = Number(prompt(`Amount paid, USD ${TEAM_TERMS[term].per}`, String(teamPrice(seats, term))))
                        patch(o.id, { upgrade: true, seat_count: seats, term, ...(Number.isFinite(price) ? { monthly_price_usd: price } : {}) }, `${o.name} is now a paid team with ${seats} seats and every dataset.`)
                      }}
                      className="rounded-lg bg-[#0D2B45] text-white px-2.5 py-1.5 text-xs font-semibold"
                    >Upgrade to paid</button>
                  )}
                  {o.plan !== 'free' && o.access_expires_at && (
                    <button
                      onClick={() => { const term = askTerm(); if (term && confirm(`Record a renewal payment for ${o.name}? Adds ${TEAM_TERMS[term].label.toLowerCase()} of access for every member.`)) patch(o.id, { extend: true, term }, `${o.name}: ${TEAM_TERMS[term].label.toLowerCase()} added for every member.`) }}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-gray-50"
                    >Record renewal</button>
                  )}
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                    <input
                      type="checkbox" checked={o.promo_emails}
                      onChange={(e) => patch(o.id, { promo_emails: e.target.checked }, e.target.checked ? 'Promo emails on.' : 'Promo emails off.')}
                    />
                    promo emails
                  </label>
                  <select
                    value={o.status}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v !== 'active' && !confirm(`Set ${o.name} to ${v}? Every member loses download access immediately.`)) { load(); return }
                      patch(o.id, { status: v }, `${o.name} is now ${v}.${v === 'active' ? ' Members have access again.' : ' Members lost download access.'}`)
                    }}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs bg-white"
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                  <SeatsControl
                    key={`${o.id}-${o.seat_count}`}
                    seats={o.seat_count} min={Math.max(1, o.members.length)} max={o.plan === 'free' ? 2 : 500}
                    onSave={(v) => patch(o.id, { seat_count: v }, `${o.name} now has ${v} seats. Their team page shows it straight away.`)}
                  />
                </div>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead className="text-gray-400">
                    <tr><th className="py-1 font-semibold">Member</th><th className="py-1 font-semibold">Email</th><th className="py-1 font-semibold">Role</th><th className="py-1 font-semibold">Joined</th><th /></tr>
                  </thead>
                  <tbody className="text-gray-700">
                    {o.members.map((m) => (
                      <tr key={m.user_id} className="border-t border-gray-50">
                        <td className="py-1.5">{m.member_name ?? '—'}</td>
                        <td className="py-1.5">{m.member_email}</td>
                        <td className="py-1.5">
                          {m.role === 'owner'
                            ? <span className="inline-flex items-center gap-1 font-bold text-amber-700"><Crown size={11} /> owner</span>
                            : 'member'}
                        </td>
                        <td className="py-1.5">{m.joined_at ? new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'pending'}</td>
                        <td className="py-1.5 text-right">
                          {m.role !== 'owner' && (
                            <button
                              onClick={() => { if (confirm(`Remove ${m.member_email ?? 'this person'} from ${o.name}? They leave its projects too.`)) void call('/api/admin/orgs/members', 'DELETE', { org_id: o.id, user_id: m.user_id }, 'Removed.') }}
                              className="text-red-600 font-semibold hover:underline"
                            >Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {o.pending_invites.map((i) => (
                      <tr key={i.id} className="border-t border-gray-50 text-gray-400">
                        <td className="py-1.5 italic">invited</td>
                        <td className="py-1.5">{i.email}</td>
                        <td className="py-1.5">member</td>
                        <td className="py-1.5">—</td>
                        <td className="py-1.5 text-right">
                          <button
                            onClick={() => { if (confirm(`Cancel the invite to ${i.email}?`)) void call('/api/admin/orgs/members', 'DELETE', { org_id: o.id, invite_id: i.id }, 'Invite cancelled.') }}
                            className="text-red-600 font-semibold hover:underline"
                          >Cancel invite</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <AddPerson onAdd={(email) => call('/api/admin/orgs/members', 'POST', { org_id: o.id, email }, `${email} added.`)} />
                <ProjectsPanel orgId={o.id} notify={notify} onChange={load} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CreateOrgForm({ onDone }: { onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const fd = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/admin/orgs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.message ?? 'Create failed.'); return }
      onDone(j.message ?? 'Team created.')
    } catch { setErr('Network error.') } finally { setBusy(false) }
  }

  const field = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm'
  return (
    <form onSubmit={submit} className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 grid sm:grid-cols-2 gap-4">
      <h2 className="sm:col-span-2 text-sm font-bold text-gray-900">Provision a new organization</h2>
      <div><label className="text-xs text-gray-500">Org name *</label><input name="name" required className={field} /></div>
      <div>
        <label className="text-xs text-gray-500">Owner email * (no account yet? they get an invite)</label>
        <input name="owner_email" type="email" required className={field} />
      </div>
      <div><label className="text-xs text-gray-500">Seats *</label><input name="seat_count" type="number" min={1} defaultValue={TEAM_MIN_SEATS} required className={field} /></div>
      <div>
        <label className="text-xs text-gray-500">Term paid for *</label>
        <select name="term" defaultValue="month" className={field}>
          {TEAM_TERM_ORDER.map((t) => <option key={t} value={t}>{TEAM_TERMS[t].label}</option>)}
        </select>
      </div>
      <div><label className="text-xs text-gray-500">Quoted price USD/mo</label><input name="monthly_price_usd" type="number" step="0.01" className={field} /></div>
      <div><label className="text-xs text-gray-500">Sector</label><input name="sector" className={field} placeholder="mining / water / ngo / gov / research" /></div>
      <div><label className="text-xs text-gray-500">Region</label><input name="region" className={field} /></div>
      <div className="sm:col-span-2"><label className="text-xs text-gray-500">Notes</label><input name="notes" className={field} placeholder="e.g. quote ref, renewal day of month" /></div>
      {err && <p className="sm:col-span-2 text-sm text-red-600">{err}</p>}
      <div className="sm:col-span-2">
        <button disabled={busy} className="rounded-xl bg-gray-900 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
          {busy ? 'Provisioning…' : 'Create org + owner seat'}
        </button>
        <p className="mt-2 text-[11px] text-gray-400">Sets the owner&apos;s profile to plan=team, active for the term paid for from today. They manage member invites themselves from /team. Use Record renewal when the next payment arrives.</p>
      </div>
    </form>
  )
}

interface AdminProject {
  id: string; name: string; visibility: string; updated_at: string
  people: { user_id: string; name: string | null; email: string | null; fixed: boolean; role: 'viewer' | 'editor' | 'manager' | null }[]
}

/** A team's projects and everyone's role on each; the admin can change any of them. */
function ProjectsPanel({ orgId, notify, onChange }: { orgId: string; notify: (ok: boolean, text: string) => void; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<AdminProject[] | null>(null)
  const [err, setErr] = useState('')

  async function load() {
    const res = await fetch(`/api/admin/orgs/projects?org_id=${orgId}`, { cache: 'no-store' }).catch(() => null)
    if (!res?.ok) { setErr('Projects could not be loaded.'); return }
    setProjects((await res.json()).projects ?? [])
  }

  async function setRole(projectId: string, userId: string, role: string) {
    setErr('')
    const res = await fetch('/api/admin/orgs/projects', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, user_id: userId, role }),
    }).catch(() => null)
    if (!res?.ok) notify(false, (await res?.json().catch(() => ({})))?.message ?? 'Could not change that role.')
    else notify(true, role === 'none' ? 'Taken off the project.' : `Role saved: ${role}.`)
    await load()
  }

  async function invite(projectId: string, email: string, role: string): Promise<boolean> {
    const res = await fetch('/api/admin/orgs/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, email, project_id: projectId, project_role: role }),
    }).catch(() => null)
    const j = await res?.json().catch(() => ({})) ?? {}
    notify(!!res?.ok, j.message ?? (res?.ok ? 'Done.' : 'That did not work. Try again.'))
    await load(); onChange()
    return !!res?.ok
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => { setOpen((v) => !v); if (!projects) void load() }}
        className="text-xs font-semibold text-[#1E5F8E] hover:underline"
      >{open ? 'Hide projects' : 'Projects and who is on them'}</button>
      {open && (
        <div className="mt-2 space-y-3">
          {err && <p className="text-xs text-red-600">{err}</p>}
          {!projects && !err && <p className="text-xs text-gray-400">Loading…</p>}
          {projects?.length === 0 && <p className="text-xs text-gray-400">No projects yet.</p>}
          {projects?.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-bold text-gray-900">{p.name} <span className="font-normal text-gray-400">· {p.visibility === 'private' ? 'private' : 'whole team'}</span></p>
              <div className="mt-2 grid gap-1.5">
                {p.people.map((u) => (
                  <div key={u.user_id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-gray-700 truncate">{u.name || u.email}</span>
                    {u.fixed ? (
                      <span className="text-gray-400">Manager (always)</span>
                    ) : (
                      <select
                        value={u.role ?? 'none'}
                        onChange={(e) => void setRole(p.id, u.user_id, e.target.value)}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                      >
                        <option value="none">Not on project</option>
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="manager">Manager</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
              <AddPerson compact roles onAdd={(email, role) => invite(p.id, email, role ?? 'editor')} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** − n + seat control; Save appears once the number changes. */
function SeatsControl({ seats, min, max, onSave }: { seats: number; min: number; max: number; onSave: (n: number) => Promise<boolean> }) {
  const [n, setN] = useState(seats)
  const [busy, setBusy] = useState(false)
  const btn = 'w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30'
  return (
    <div className="flex items-center gap-1.5" title="Seats">
      <button type="button" className={btn} disabled={n <= min || busy} onClick={() => setN(n - 1)} aria-label="One seat fewer"><Minus size={13} /></button>
      <span className="min-w-[4.2rem] text-center text-xs font-bold tabular-nums">{n} seats</span>
      <button type="button" className={btn} disabled={n >= max || busy} onClick={() => setN(n + 1)} aria-label="One seat more"><Plus size={13} /></button>
      {n !== seats && (
        <button
          type="button" disabled={busy}
          onClick={async () => { setBusy(true); const ok = await onSave(n); setBusy(false); if (!ok) setN(seats) }}
          className="rounded-md bg-emerald-600 text-white px-2.5 py-1.5 text-xs font-bold disabled:opacity-60"
        >{busy ? 'Saving…' : 'Save'}</button>
      )}
    </div>
  )
}

/** Email box that adds someone (or invites them when they have no account). */
function AddPerson({ onAdd, compact = false, roles = false }: {
  onAdd: (email: string, role?: string) => Promise<boolean>; compact?: boolean; roles?: boolean
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className={`${compact ? 'mt-2.5' : 'mt-3'} flex flex-wrap items-center gap-2`}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!email.trim() || busy) return
        setBusy(true)
        const ok = await onAdd(email.trim(), roles ? role : undefined)
        setBusy(false)
        if (ok) setEmail('')
      }}
    >
      <input
        type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder={compact ? 'Invite to this project by email' : 'Add a person by email (no account? they get an invite)'}
        className="flex-1 min-w-[220px] rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
      />
      {roles && (
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
          <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="manager">Manager</option>
        </select>
      )}
      <button disabled={busy || !email.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
        {busy && <Loader2 size={12} className="animate-spin" />}{busy ? 'Working…' : compact ? 'Add to project' : 'Add to team'}
      </button>
    </form>
  )
}
