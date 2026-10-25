'use client'

/**
 * "Find company emails": checks prospects' own websites for a published
 * general inbox, batch after batch while the page is open, and shows how far
 * it has got. Each address found puts that prospect into Email drafts.
 */

import { useRef, useState } from 'react'
import { Loader2, MailSearch } from 'lucide-react'
import { api } from '@/lib/sales/client'

export default function FindEmailsButton({ pipeline = 'sales', onFound }: { pipeline?: 'sales' | 'partner'; onFound?: () => void }) {
  const [state, setState] = useState<{ checked: number; found: number; left: number | null; running: boolean; err: string }>({ checked: 0, found: 0, left: null, running: false, err: '' })
  const stop = useRef(false)

  async function run() {
    stop.current = false
    setState((s) => ({ ...s, running: true, err: '' }))
    try {
      for (;;) {
        const r = await api<{ checked: number; found: number; left: number }>('/api/admin/sales/find-emails', { method: 'POST', body: { pipeline } })
        setState((s) => ({ ...s, checked: s.checked + r.checked, found: s.found + r.found, left: r.left }))
        if (r.found) onFound?.()
        if (!r.left || !r.checked || stop.current) break
      }
    } catch (e) { setState((s) => ({ ...s, err: e instanceof Error ? e.message : 'Stopped' })) }
    setState((s) => ({ ...s, running: false }))
  }

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <button onClick={() => (state.running ? (stop.current = true) : void run())}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold px-3 py-2 text-gray-700">
        {state.running ? <Loader2 size={14} className="animate-spin" /> : <MailSearch size={14} />} {state.running ? 'Stop' : 'Find company emails'}
      </button>
      {(state.checked > 0 || state.err) && (
        <span className="text-xs text-gray-500">
          {state.found} found · {state.checked} checked{state.left !== null && ` · ${state.left.toLocaleString()} left`}{state.err && ` · ${state.err}`}
        </span>
      )}
    </div>
  )
}
