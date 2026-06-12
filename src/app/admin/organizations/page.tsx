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

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, RefreshCw, Crown, Mail, Plus } from 'lucide-react'

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
  members: Member[]; pending_invites: Invite[]
}

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState<Org[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const res = await fetch('/api/admin/orgs', { cache: 'no-store' })
    if (res.status === 403) { setForbidden(true); return }
    const j = await res.json().catch(() => ({}))
    setOrgs(j.orgs ?? [])
  }
  useEffect(() => { load() }, [])

  async function patch(id: string, changes: Record<string, unknown>) {
    setMsg('')
    const res = await fetch('/api/admin/orgs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...changes }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setMsg(j.message ?? 'Update failed.')
    }
    await load()
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

        {showCreate && <CreateOrgForm onDone={() => { setShowCreate(false); load() }} />}

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
                    <span className="text-[11px] text-gray-500">
                      {o.members.length}/{o.seat_count} seats
                      {o.pending_invites.length > 0 && ` · ${o.pending_invites.length} pending`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {[o.sector, o.region, o.monthly_price_usd ? `$${o.monthly_price_usd}/mo` : null, `${o.api_rate_per_min} req/min API`].filter(Boolean).join(' · ')}
                    {' · '}since {new Date(o.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                  </p>
                  {o.notes && <p className="mt-1.5 text-xs text-gray-500 italic">{o.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                    <input
                      type="checkbox" checked={o.promo_emails}
                      onChange={(e) => patch(o.id, { promo_emails: e.target.checked })}
                    />
                    promo emails
                  </label>
                  <select
                    value={o.status}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v !== 'active' && !confirm(`Set ${o.name} to ${v}? Every member loses download access immediately.`)) { load(); return }
                      patch(o.id, { status: v })
                    }}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs bg-white"
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                  <input
                    type="number" min={1} defaultValue={o.seat_count}
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (v !== o.seat_count && v >= o.members.length) patch(o.id, { seat_count: v })
                      else if (v < o.members.length) { setMsg(`Cannot set ${o.name} below ${o.members.length} seats (members would exceed the cap).`); e.target.value = String(o.seat_count) }
                    }}
                    className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                    title="Seat count (applies on blur)"
                  />
                </div>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-3">
                <table className="w-full text-left text-xs">
                  <thead className="text-gray-400">
                    <tr><th className="py-1 font-semibold">Member</th><th className="py-1 font-semibold">Email</th><th className="py-1 font-semibold">Role</th><th className="py-1 font-semibold">Joined</th></tr>
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
                      </tr>
                    ))}
                    {o.pending_invites.map((i) => (
                      <tr key={i.id} className="border-t border-gray-50 text-gray-400">
                        <td className="py-1.5 italic">invited</td>
                        <td className="py-1.5">{i.email}</td>
                        <td className="py-1.5">member</td>
                        <td className="py-1.5">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CreateOrgForm({ onDone }: { onDone: () => void }) {
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
      onDone()
    } catch { setErr('Network error.') } finally { setBusy(false) }
  }

  const field = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm'
  return (
    <form onSubmit={submit} className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 grid sm:grid-cols-2 gap-4">
      <h2 className="sm:col-span-2 text-sm font-bold text-gray-900">Provision a new organization</h2>
      <div><label className="text-xs text-gray-500">Org name *</label><input name="name" required className={field} /></div>
      <div>
        <label className="text-xs text-gray-500">Owner email * (must have an account)</label>
        <input name="owner_email" type="email" required className={field} />
      </div>
      <div><label className="text-xs text-gray-500">Seats *</label><input name="seat_count" type="number" min={1} defaultValue={3} required className={field} /></div>
      <div><label className="text-xs text-gray-500">Quoted price USD/mo</label><input name="monthly_price_usd" type="number" step="0.01" className={field} /></div>
      <div><label className="text-xs text-gray-500">Sector</label><input name="sector" className={field} placeholder="mining / water / ngo / gov / research" /></div>
      <div><label className="text-xs text-gray-500">Region</label><input name="region" className={field} /></div>
      <div className="sm:col-span-2"><label className="text-xs text-gray-500">Notes</label><input name="notes" className={field} placeholder="e.g. quote ref, renewal day of month" /></div>
      {err && <p className="sm:col-span-2 text-sm text-red-600">{err}</p>}
      <div className="sm:col-span-2">
        <button disabled={busy} className="rounded-xl bg-gray-900 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
          {busy ? 'Provisioning…' : 'Create org + owner seat'}
        </button>
        <p className="mt-2 text-[11px] text-gray-400">Sets the owner&apos;s profile to plan=team (active). They manage member invites themselves from /team.</p>
      </div>
    </form>
  )
}
