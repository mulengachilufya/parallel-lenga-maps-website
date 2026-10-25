'use client'

/**
 * Sent: everyone we have reached out to, by email or on LinkedIn. This is
 * where the pipeline ends; replies are handled by hand from here.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail } from 'lucide-react'
import { api, country } from '@/lib/sales/client'
import { LinkedInIcon } from './ui'

interface SentRow { id: string; account_id: string; org: string; country: string | null; person: string | null; detail: string | null; subject: string | null; at: string; by: string | null }
export interface SentPayload { email: SentRow[]; linkedin: SentRow[]; counts: { email_drafts: number; linkedin_drafts: number } }

export default function SentTab({ pipeline = 'sales' }: { pipeline?: 'sales' | 'partner' }) {
  const [rows, setRows] = useState<SentPayload | null>(null)
  const [err, setErr] = useState('')
  const [by, setBy] = useState<'email' | 'linkedin'>('email')
  useEffect(() => {
    api<SentPayload>(`/api/admin/sales/sent?pipeline=${pipeline}`).then(setRows).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load'))
  }, [pipeline])

  if (err && !rows) return <p className="text-sm text-red-600 py-6">{err}</p>
  if (!rows) return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  const list = rows[by]
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const base = pipeline === 'partner' ? '/admin/partners' : '/admin/sales'

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(['email', 'linkedin'] as const).map((k) => (
          <button key={k} onClick={() => setBy(k)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${by === k ? 'bg-[#0D2B45] text-white border-[#0D2B45]' : 'bg-white text-gray-600 border-gray-200'}`}>
            {k === 'email' ? <Mail size={12} /> : <LinkedInIcon size={12} />} Sent by {k === 'email' ? 'email' : 'LinkedIn'} · {rows[k].length}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Nobody yet.</p>}
      <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {list.map((r) => (
          <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`${base}/${r.account_id}`} className="text-sm font-semibold text-gray-900 hover:underline">{r.org}</Link>
              <p className="text-xs text-gray-500 truncate">
                {[r.person, country(r.country), r.subject].filter(Boolean).join(' · ')}
              </p>
              {r.detail && (by === 'linkedin'
                ? <a href={r.detail} target="_blank" rel="noreferrer" className="text-xs text-[#0A66C2] hover:underline">{r.detail.replace(/^https:\/\/www\./, '')}</a>
                : <p className="text-xs text-gray-400">{r.detail}</p>)}
            </div>
            <span className="shrink-0 text-xs text-gray-400 text-right">{day(r.at)}{r.by && <span className="block">by {r.by}</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
