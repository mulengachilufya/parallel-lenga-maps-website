'use client'

/**
 * Countries: how many prospects each country has, and how many of them we
 * have contacted (email or LinkedIn request sent) and not contacted yet.
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, country } from '@/lib/sales/client'

interface Row { iso3: string | null; prospects: number; contacted: number; not_contacted: number }

export default function CountriesTab({ pipeline = 'sales' }: { pipeline?: 'sales' | 'partner' }) {
  const [data, setData] = useState<{ countries: Row[]; total: Omit<Row, 'iso3'> } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    api<{ countries: Row[]; total: Omit<Row, 'iso3'> }>(`/api/admin/sales/countries?pipeline=${pipeline}`).then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load'))
  }, [pipeline])

  if (err && !data) return <p className="text-sm text-red-600 py-6">{err}</p>
  if (!data) return <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  const n = (v: number) => v.toLocaleString()

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="text-left font-semibold px-4 py-2">Country</th>
            <th className="text-right font-semibold px-3 py-2">Prospects</th>
            <th className="text-right font-semibold px-3 py-2">Contacted</th>
            <th className="text-right font-semibold px-4 py-2">Not yet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr className="font-bold text-gray-900">
            <td className="px-4 py-2">All countries</td>
            <td className="px-3 py-2 text-right tabular-nums">{n(data.total.prospects)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-green-700">{n(data.total.contacted)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{n(data.total.not_contacted)}</td>
          </tr>
          {data.countries.map((r) => (
            <tr key={r.iso3 ?? 'none'} className="text-gray-800">
              <td className="px-4 py-2">{r.iso3 ? country(r.iso3) : 'No country set'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n(r.prospects)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-green-700">{n(r.contacted)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{n(r.not_contacted)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
