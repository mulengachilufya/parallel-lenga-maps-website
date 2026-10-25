'use client'

/**
 * "Your orders" on the dashboard: the user's bank-transfer payments and
 * quote requests. Anything can be taken off the list: unpaid ones are
 * cancelled, paid ones are only hidden (the plan and receipt stay).
 * Renders nothing when they have none.
 */

import { useEffect, useState } from 'react'
import { Loader2, Receipt, X } from 'lucide-react'

interface Payment {
  id: number; reference: string; plan: string; product: string | null; account_type: string | null
  amount_usd: number | null; amount_zmw: number | null; currency: string | null
  status: 'pending' | 'verified' | 'rejected'; submitted_at: string; admin_note: string | null
}
interface Quote { id: string; org_name: string; seats: number | null; datasets_interest: string | null; status: string; created_at: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Waiting for approval', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  verified: { label: 'Paid', cls: 'bg-green-50 text-green-800 border-green-200' },
  rejected: { label: 'Not accepted', cls: 'bg-red-50 text-red-700 border-red-200' },
  quote:    { label: 'Quote requested', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function paymentTitle(p: Payment) {
  const what = p.product === 'updates' ? 'Data updates' : `${cap(p.plan)} plan`
  const amount = p.currency === 'ZMW' ? `K${p.amount_zmw}` : p.amount_usd ? `$${p.amount_usd}` : ''
  return [what, amount].filter(Boolean).join(' · ')
}

export default function MyOrders() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/account/orders').then((r) => r.ok ? r.json() : { payments: [], quotes: [] })
      .then((j) => { setPayments(j.payments ?? []); setQuotes(j.quotes ?? []) }).catch(() => {})
  }, [])

  async function cancel(kind: 'payment' | 'quote', id: string | number, what: string, paid = false) {
    if (!confirm(paid ? `Remove ${what} from your list? Your plan is not affected.` : `Cancel ${what}? It will be removed for good.`)) return
    const key = `${kind}:${id}`
    setBusy(key); setError('')
    try {
      const res = await fetch('/api/account/orders', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 404) { setError(j.message ?? 'Could not remove. Try again.'); return }
      if (kind === 'payment') setPayments((l) => l.filter((p) => p.id !== id))
      else setQuotes((l) => l.filter((q) => q.id !== id))
    } catch {
      setError('Network error. Try again.')
    } finally { setBusy(null) }
  }

  if (!payments.length && !quotes.length) return null

  const rows = [
    ...payments.map((p) => ({
      key: `payment:${p.id}`, date: p.submitted_at, title: paymentTitle(p), sub: `Ref ${p.reference}${p.status === 'rejected' && p.admin_note ? ` · ${p.admin_note}` : ''}`,
      status: p.status, onCancel: () => cancel('payment', p.id, `${paymentTitle(p)} (${p.reference})`, p.status === 'verified'),
      cancelLabel: p.status === 'pending' ? 'Cancel' : 'Remove',
    })),
    ...quotes.map((q) => ({
      key: `quote:${q.id}`, date: q.created_at, title: `Quote for ${q.org_name}`,
      sub: [q.seats && `${q.seats} seats`, q.datasets_interest].filter(Boolean).join(' · '),
      status: 'quote', onCancel: () => cancel('quote', q.id, `the quote request for ${q.org_name}`), cancelLabel: 'Cancel',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 text-sm text-[#0D2B45]">
      <h2 className="font-bold flex items-center gap-2"><Receipt size={16} /> Your orders</h2>
      <ul className="mt-2 divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.key} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex-1 min-w-[180px]">
              <p className="font-semibold">{r.title}</p>
              <p className="text-xs text-gray-500">{day(r.date)}{r.sub ? ` · ${r.sub}` : ''}</p>
            </div>
            <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
            {r.onCancel && (
              <button onClick={r.onCancel} disabled={!!busy}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-red-600 disabled:opacity-50">
                {busy === r.key ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} {r.cancelLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
