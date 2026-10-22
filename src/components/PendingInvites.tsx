'use client'

/**
 * "You've been invited to join X" banner for the dashboard.
 *
 * The backup path for invites: if someone lost the email or signed up
 * without the link, any pending invite for their address still shows here
 * and joins with one click. Renders nothing when there is none.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, Loader2 } from 'lucide-react'

interface Pending { id: string; org_name: string; free: boolean }

export default function PendingInvites() {
  const [invites, setInvites] = useState<Pending[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [joined, setJoined] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/team/join').then((r) => r.ok ? r.json() : { invites: [] })
      .then((j) => setInvites(j.invites ?? [])).catch(() => {})
  }, [])

  async function accept(i: Pending) {
    setBusy(i.id); setError('')
    try {
      const res = await fetch('/api/team/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: i.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.message ?? 'Could not join. Try again.'); return }
      setJoined(j.org_name ?? i.org_name)
      setInvites([])
    } catch {
      setError('Network error. Try again.')
    } finally { setBusy(null) }
  }

  async function decline(i: Pending) {
    if (!confirm(`Decline the invitation to ${i.org_name}?`)) return
    setBusy(i.id); setError('')
    try {
      const res = await fetch('/api/team/join', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: i.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 404) { setError(j.message ?? 'Could not decline. Try again.'); return }
      setInvites((list) => list.filter((x) => x.id !== i.id))
    } catch {
      setError('Network error. Try again.')
    } finally { setBusy(null) }
  }

  if (joined) {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-400/40 bg-emerald-50 p-4 text-sm text-emerald-900 flex flex-wrap items-center gap-3">
        <Users size={18} className="text-emerald-600" />
        <span className="flex-1">You joined <strong>{joined}</strong>.</span>
        <Link href="/workspace" className="rounded-lg bg-[#F5B800] px-4 py-2 text-xs font-bold text-[#1a1200]">Open the workspace</Link>
      </div>
    )
  }
  if (!invites.length) return null
  return (
    <div className="mb-6 space-y-2">
      {invites.map((i) => (
        <div key={i.id} className="rounded-2xl border border-[#F5B800]/50 bg-[#fff6d9] p-4 text-sm text-[#0D2B45] flex flex-wrap items-center gap-3">
          <Users size={18} className="text-[#9a7400]" />
          <span className="flex-1">
            You have been invited to join <strong>{i.org_name}</strong>
            {i.free ? '\'s free GIS workspace.' : ' on Lenga Maps.'}
          </span>
          <button
            onClick={() => accept(i)}
            disabled={!!busy}
            className="rounded-lg bg-[#F5B800] px-4 py-2 text-xs font-bold text-[#1a1200] disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {busy === i.id && <Loader2 size={13} className="animate-spin" />} Join team
          </button>
          <button
            onClick={() => decline(i)}
            disabled={!!busy}
            className="rounded-lg border border-[#0D2B45]/25 px-3 py-2 text-xs font-semibold text-[#0D2B45] hover:bg-white/60 disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
