'use client'

/**
 * /admin/partners — the Partnerships pipeline, next to Sales. Outreach only:
 * email drafts, LinkedIn drafts, then Sent. What happens after a reply is
 * handled by hand. Customers live in /admin/sales.
 */

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import DraftsTab from '@/components/sales/DraftsTab'
import LinkedInTab from '@/components/sales/LinkedInTab'
import SentTab, { type SentPayload } from '@/components/sales/SentTab'
import OutcomesTab from '@/components/sales/OutcomesTab'
import CountriesTab from '@/components/sales/CountriesTab'
import { api } from '@/lib/sales/client'

type Tab = 'email' | 'linkedin' | 'sent' | 'outcomes' | 'countries'
const TABS: { id: Tab; label: string }[] = [
  { id: 'email', label: 'Email drafts' }, { id: 'linkedin', label: 'LinkedIn drafts' }, { id: 'sent', label: 'Sent' },
  { id: 'outcomes', label: 'Outcomes' }, { id: 'countries', label: 'Countries' },
]

export default function Wrapper() {
  return <Suspense fallback={<div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>}><PartnersPage /></Suspense>
}

function PartnersPage() {
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') as Tab : 'email')
  const [counts, setCounts] = useState<Record<Tab, number | null>>({ email: null, linkedin: null, sent: null, outcomes: null, countries: null })

  const loadCounts = useCallback(() => {
    api<SentPayload>('/api/admin/sales/sent?pipeline=partner')
      .then((d) => setCounts((c) => ({ ...c, email: d.counts.email_drafts, linkedin: d.counts.linkedin_drafts, sent: d.email.length + d.linkedin.length })))
      .catch(() => {})
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])

  function go(t: Tab) {
    setTab(t)
    const u = new URL(window.location.href)
    u.searchParams.set('tab', t)
    window.history.replaceState(null, '', u)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-gray-900">
      <h1 className="text-2xl font-bold text-gray-900">Partnerships</h1>
      <p className="text-sm text-gray-500 mt-1">
        Partners we are reaching out to, by email and on LinkedIn. Customers are in <Link href="/admin/sales" className="underline">Sales</Link>.
      </p>

      <nav className="mt-5 flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)}
                  className={`shrink-0 px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-[#0D2B45] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}{counts[t.id] !== null && <span className="text-gray-400 font-normal"> ({counts[t.id]!.toLocaleString()})</span>}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === 'email' && <DraftsTab pipeline="partner" onCount={(n) => { setCounts((c) => ({ ...c, email: n })); loadCounts() }} />}
        {tab === 'linkedin' && <LinkedInTab pipeline="partner" onCount={(n) => { setCounts((c) => ({ ...c, linkedin: n })); loadCounts() }} />}
        {tab === 'sent' && <SentTab pipeline="partner" />}
        {tab === 'outcomes' && <OutcomesTab pipeline="partner" />}
        {tab === 'countries' && <CountriesTab pipeline="partner" />}
      </div>
    </div>
  )
}
