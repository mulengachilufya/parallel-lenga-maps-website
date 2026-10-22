'use client'

/**
 * /admin/team — the owners decide who else gets into admin, and which parts.
 *
 * Add someone by the email they sign in with, tick their areas, save. Change
 * the ticks any time; Remove ends their access straight away. No code change
 * or redeploy is needed. Every change is in the ops audit log.
 */
import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Loader2, Trash2, UserPlus } from 'lucide-react'
import { useAdminAccess } from '@/components/admin/AdminAccess'

interface AreaDef { id: string; label: string; help: string }
interface Staff { email: string; name: string | null; title: string | null; areas: string[]; added_by: string | null; created_at: string; has_account: boolean }
interface Data { staff: Staff[]; full_admins: { email: string; owner: boolean }[]; areas: AreaDef[] }

async function call(method: string, body?: unknown) {
  const res = await fetch('/api/admin/staff', {
    method, cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.message || j.error || `Request failed (${res.status})`)
  return j
}

export default function TeamAccessPage() {
  const access = useAdminAccess()
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try { setData(await call('GET')); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { if (access.isOwner) void load() }, [access.isOwner, load])

  if (!access.loaded) return <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
  if (!access.isOwner) return <p className="max-w-3xl mx-auto px-4 py-16 text-sm text-gray-600">Only the owners manage who has admin access.</p>

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-gray-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><KeyRound size={22} /> Team access</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Who else can open admin, and which parts. They sign in with their normal Lenga Maps account; the email here must match it.
            Changes work straight away.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D2B45] text-white text-sm font-semibold px-3.5 py-2">
          <UserPlus size={15} /> Add someone
        </button>
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {!data && !err && <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>}

      {data && (
        <>
          {adding && <StaffForm areas={data.areas} onDone={() => { setAdding(false); void load() }} onCancel={() => setAdding(false)} />}

          <h2 className="mt-6 text-xs font-bold uppercase tracking-wider text-gray-500">Staff</h2>
          {data.staff.length === 0 && <p className="mt-2 text-sm text-gray-500">Nobody yet.</p>}
          <div className="mt-2 space-y-3">
            {data.staff.map((s) => <StaffForm key={s.email} staff={s} areas={data.areas} onDone={load} />)}
          </div>

          <h2 className="mt-8 text-xs font-bold uppercase tracking-wider text-gray-500">Full access</h2>
          <ul className="mt-2 bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {data.full_admins.map((a) => (
              <li key={a.email} className="px-4 py-2.5 text-sm flex items-center justify-between gap-2">
                <span>{a.email}</span>
                <span className="text-xs text-gray-500">{a.owner ? 'Owner' : 'ADMIN_EMAILS in Vercel'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            Owners are set in the code and can never be locked out. Full access also covers deleting, the ops console and this page
            (this page is owners only). For everyone else, use Staff above.
          </p>
        </>
      )}
    </div>
  )
}

function StaffForm({ staff, areas, onDone, onCancel }: { staff?: Staff; areas: AreaDef[]; onDone: () => void; onCancel?: () => void }) {
  const [f, setF] = useState({ email: staff?.email ?? '', name: staff?.name ?? '', title: staff?.title ?? '' })
  const [picked, setPicked] = useState<string[]>(staff?.areas ?? [])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = !staff || f.name !== (staff.name ?? '') || f.title !== (staff.title ?? '') ||
    [...picked].sort().join() !== [...staff.areas].sort().join()

  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  async function save() {
    setBusy(true); setMsg(null)
    try {
      await call('POST', { ...f, areas: picked })
      setMsg({ ok: true, text: 'Saved.' })
      onDone()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save' }) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!staff || !confirm(`Remove ${staff.name || staff.email}? Their admin access ends now. Their normal account stays.`)) return
    setBusy(true)
    try { await call('DELETE', { email: staff.email }); onDone() }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not remove' }); setBusy(false) }
  }

  const input = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 mt-3">
      {staff ? (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{staff.name || staff.email}</p>
            <p className="text-xs text-gray-500 break-all">
              {staff.email}
              {!staff.has_account && <span className="ml-1.5 text-amber-700">· no account with this email yet</span>}
            </p>
          </div>
          <button onClick={remove} disabled={busy} className="shrink-0 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">
            <Trash2 size={13} /> Remove
          </button>
        </div>
      ) : (
        <>
          <p className="font-semibold">Add someone</p>
          <input className={`${input} mt-2`} placeholder="Email they sign in with" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </>
      )}
      <div className="mt-2 grid sm:grid-cols-2 gap-2">
        <input className={input} placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={input} placeholder="Role, e.g. Chief Commercial Officer" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-2">
        {areas.map((a) => (
          <label key={a.id} className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} />
            <span><span className="font-medium">{a.label}</span><span className="block text-xs text-gray-500">{a.help}</span></span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy || !dirty || !picked.length || !f.email.trim()}
                className="rounded-lg bg-[#0D2B45] text-white text-sm font-semibold px-4 py-2 disabled:opacity-40 inline-flex items-center gap-1.5">
          {busy && <Loader2 size={14} className="animate-spin" />} {staff ? 'Save changes' : 'Give access'}
        </button>
        {onCancel && <button onClick={onCancel} className="text-sm text-gray-500">Cancel</button>}
        {msg && <span className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
