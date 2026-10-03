'use client'

/**
 * /admin/downloads — how many files leave Lenga, which ones, and who takes
 * them. Reads /api/admin/downloads (download_events: website, dashboard
 * bundle, API). Period picker, totals against the previous period, a daily
 * chart, top lists, recent downloads and a CSV export.
 */
import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

interface Count { label: string; count: number }
interface Data {
  period: { days: number | null }
  totals: { downloads: number; previous: number | null; people: number; teams: number; bytes: number; paid: number; free: number }
  perDay: { date: string; count: number }[]
  datasets: Count[]; countries: Count[]; sources: Count[]; teams: Count[]
  people: { name: string; email: string; count: number; paid: boolean }[]
  recent: { at: string; name: string | null; email: string | null; dataset: string; country: string | null; source: string; paid: boolean }[]
}

const PERIODS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '12 months'], ['all', 'All time']] as const
const SOURCE: Record<string, string> = { website: 'Website, one country', bundle: 'Dashboard, all of Africa', api: 'API, one country', api_bundle: 'API, whole dataset' }
const NAVY = '#0D2B45'

const fmtBytes = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`
const fmtDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtWhen = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-navy">{value}</p>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </div>
  )
}

/** Ranked list with an inline bar; one hue, the count in text ink. */
function TopList({ title, rows, empty }: { title: string; rows: Count[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold text-navy">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-gray-400">{empty}</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="text-sm">
              <div className="flex justify-between gap-3"><span className="truncate text-gray-800">{SOURCE[r.label] ?? r.label}</span><span className="font-semibold tabular-nums text-gray-900">{r.count}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: NAVY }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DailyChart({ series }: { series: Data['perDay'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...series.map((d) => d.count))
  const h = hover !== null ? series[hover] : null
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-navy">Downloads per day</h2>
        <p className="text-xs text-gray-500 tabular-nums">{h ? `${fmtDay(h.date)}: ${h.count} download${h.count === 1 ? '' : 's'}` : `Peak ${max} in a day`}</p>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-gray-200" />
        <div className="flex h-40 items-end gap-[2px] border-b border-gray-200" onMouseLeave={() => setHover(null)}>
          {series.map((d, i) => (
            <div key={d.date} className="flex h-full flex-1 cursor-default items-end" onMouseEnter={() => setHover(i)}
                 role="img" aria-label={`${fmtDay(d.date)}: ${d.count}`}>
              <div className="w-full rounded-t-[4px]" style={{ height: d.count ? `${Math.max(3, (d.count / max) * 100)}%` : 0, background: NAVY, opacity: hover === null || hover === i ? 1 : 0.45 }} />
            </div>
          ))}
        </div>
      </div>
      {series.length > 0 && (
        <div className="mt-1.5 flex justify-between text-[11px] text-gray-400">
          <span>{fmtDay(series[0].date)}</span><span>{fmtDay(series[series.length - 1].date)}</span>
        </div>
      )}
    </div>
  )
}

export default function AdminDownloadsPage() {
  const [days, setDays] = useState('30')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setData(null); setError('')
    fetch(`/api/admin/downloads?days=${days}`)
      .then(async (r) => {
        if (r.status === 403) throw new Error('Not authorised. Sign in with an admin account.')
        if (!r.ok) throw new Error(`Could not load downloads (HTTP ${r.status}).`)
        return r.json()
      })
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [days])

  const t = data?.totals
  const change = t && t.previous !== null
    ? (t.previous === 0 ? (t.downloads ? 'none in the period before' : undefined) : `${t.downloads >= t.previous ? '+' : ''}${Math.round(((t.downloads - t.previous) / t.previous) * 100)}% on the period before (${t.previous})`)
    : undefined

  return (
    <div className="bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-navy">Downloads</h1>
            <p className="mt-1 text-sm text-gray-500">Every file taken from Lenga: website, dashboard bundles and the API.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              {PERIODS.map(([v, label]) => (
                <button key={v} type="button" onClick={() => setDays(v)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold ${days === v ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {label}
                </button>
              ))}
            </div>
            <a href={`/api/admin/downloads?days=${days}&format=csv`}
               className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-navy hover:border-gray-300">
              <Download size={14} /> CSV
            </a>
          </div>
        </div>

        {error && <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {!data && !error && <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-navy" /></div>}

        {data && t && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Tile label="Downloads" value={String(t.downloads)} note={change} />
              <Tile label="People" value={String(t.people)} note={`${t.teams} team${t.teams === 1 ? '' : 's'}`} />
              <Tile label="Paying accounts" value={String(t.paid)} note={`${t.free} by free accounts`} />
              <Tile label="Data handed out" value={t.bytes ? fmtBytes(t.bytes) : 'n/a'} note="Bundles and API only; website sizes are not recorded" />
            </div>

            <DailyChart series={data.perDay} />

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              <TopList title="Datasets" rows={data.datasets} empty="No downloads yet." />
              <TopList title="Countries" rows={data.countries} empty="No downloads yet." />
              <TopList title="Teams" rows={data.teams} empty="No team downloads." />
              <TopList title="Where from" rows={data.sources} empty="No downloads yet." />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <h2 className="px-5 pt-5 text-sm font-bold text-navy">Most active people</h2>
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-2 font-semibold">Person</th><th className="px-3 py-2 font-semibold">Account</th><th className="px-5 py-2 text-right font-semibold">Downloads</th>
                  </tr></thead>
                  <tbody>
                    {data.people.map((p) => (
                      <tr key={p.email + p.name} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-2"><p className="font-medium text-gray-900">{p.name}</p><p className="text-xs text-gray-500">{p.email}</p></td>
                        <td className="px-3 py-2 text-xs text-gray-600">{p.paid ? 'Paying' : 'Free'}</td>
                        <td className="px-5 py-2 text-right font-semibold tabular-nums">{p.count}</td>
                      </tr>
                    ))}
                    {data.people.length === 0 && <tr><td className="px-5 py-4 text-gray-400" colSpan={3}>No downloads in this period.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <h2 className="px-5 pt-5 text-sm font-bold text-navy">Latest downloads</h2>
                <div className="mt-3 max-h-[440px] overflow-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {data.recent.map((r, i) => (
                        <tr key={r.at + i} className="border-b border-gray-50 last:border-0 align-top">
                          <td className="whitespace-nowrap px-5 py-2 text-xs text-gray-500">{fmtWhen(r.at)}</td>
                          <td className="px-3 py-2">
                            <p className="text-gray-900">{r.dataset}{r.country ? <span className="text-gray-500"> · {r.country}</span> : null}</p>
                            <p className="text-xs text-gray-500">{r.name ?? 'Unknown'} · {SOURCE[r.source] ?? r.source}{r.paid ? '' : ' · free'}</p>
                          </td>
                        </tr>
                      ))}
                      {data.recent.length === 0 && <tr><td className="px-5 py-4 text-gray-400">No downloads in this period.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400">
              Counts every download from 17 June 2026 for the website, and from 3 October 2026 for dashboard bundles and the API.
              Paying means the account is on a paid plan today. Times are shown in your time zone; days are UTC.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
