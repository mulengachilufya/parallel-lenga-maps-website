'use client'

/**
 * "Delete my account" for the dashboard: says exactly what goes and what
 * stays, asks the person to type DELETE, then removes the account and
 * signs them out (/api/account/delete explains the team rules).
 */

import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.message ?? 'Could not delete the account. Try again.'); return }
      await supabase.auth.signOut().catch(() => {})
      window.location.href = '/?account=deleted'
    } catch {
      setError('Network error. Nothing was deleted. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/70">
      <p className="font-semibold text-white">Your account</p>
      <p className="mt-1">Signed up by mistake, or finished with Lenga Maps? You can delete your account here at any time.</p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-2 text-red-300 hover:text-red-200 font-semibold">
          <Trash2 size={15} /> Delete my account
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-4">
          <p className="font-semibold text-white">This cannot be undone.</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Your login, profile, chosen free datasets and API keys are deleted.</li>
            <li>You leave your team, and your seat frees up.</li>
            <li>Comments and layers you added to shared projects stay for your team.</li>
            <li>If you own a team with other people in it, remove them first on the Team page.</li>
          </ul>
          <label className="mt-4 block text-xs text-white/60" htmlFor="del-confirm">Type <b className="text-white">DELETE</b> to confirm</label>
          <input
            id="del-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
            className="mt-1 w-48 rounded-lg bg-[#0D2B45] border border-white/20 px-3 py-2 text-white text-sm focus:outline-none focus:border-red-300"
          />
          {error && <p className="mt-3 text-red-300">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              onClick={remove} disabled={busy || typed.trim() !== 'DELETE'}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-40"
            >
              {busy && <Loader2 size={14} className="animate-spin" />} Delete my account for good
            </button>
            <button onClick={() => { setOpen(false); setTyped(''); setError('') }} className="rounded-lg border border-white/20 px-4 py-2 text-white">
              Keep my account
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
