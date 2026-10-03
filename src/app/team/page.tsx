'use client'

/**
 * /team — the shared workspace for "For Project Teams and Businesses".
 *
 * A separate "door" from the personal /dashboard: members of a provisioned
 * organization land here to see each other, the team's download history
 * (dataset, country, CRS, format, who, when), duplicate-pull warnings, seat
 * usage, and (owners) seat management + org settings.
 *
 * All data comes from GET /api/team in one call; mutations hit the
 * /api/team/* routes. Non-members are routed to /projects (the sales page).
 *
 * GIS notes surfaced deliberately (QA-reviewed): CRS shown per record, the
 * LULC Homolosine-reprojection note rides the epsg string, and the standing
 * tip about reprojecting EPSG:4326 before area/distance measurement.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import WorkspaceBox from '@/components/WorkspaceBox'
import {
  Users, History, Settings2, LayoutDashboard, Loader2, Globe2,
  Download, AlertTriangle, CheckCircle2, Trash2, Mail, Crown,
  KeyRound, Info, MapPin, X,
} from 'lucide-react'
import { FREE_DATASET_LIMIT, FREE_TEAM_SEATS } from '@/lib/pricing'
import FreeDatasetPicker, { freeDatasetName } from '@/components/FreeDatasetPicker'
import TeamSwitcher, { type TeamOption } from '@/components/TeamSwitcher'

const GOLD = '#F5B800'
const GOLD_ICON = '#d9a200'
const GOLD_INK = '#9a7400'   // gold for text on the light paper
// Warm white paper with faint gold contour lines (the brand's yellow and white).
const PAPER = { backgroundColor: '#fbf8f0', backgroundImage: "url('/textures/contours-gold.svg')", backgroundSize: '640px 640px' }

interface Member {
  user_id: string; role: 'owner' | 'member'
  member_name: string | null; member_email: string | null
  invited_at: string; joined_at: string | null
  free_datasets?: string[]
}
interface Invite { id: string; email: string; created_at: string; link?: string | null }
interface Ev {
  id: number; user_id: string | null; user_name: string | null; user_email: string | null
  dataset_slug: string; dataset_name: string | null; country: string | null
  epsg: string | null; file_format: string | null; created_at: string
}
interface TeamPayload {
  me: { user_id: string; role: 'owner' | 'member' }
  org: {
    id: string; name: string; sector: string | null; region: string | null
    operating_countries: string[]; seat_count: number; status: string
    contact_email: string | null; promo_emails: boolean
    plan?: 'paid' | 'free'; free_datasets?: string[] | null
  }
  members: Member[]; invites: Invite[]; events: Ev[]
  seats: { total: number; used: number; pending: number }
  team_datasets?: string[]
  teams?: TeamOption[]
  my_picks?: { picks: string[]; left: number }
}

// ── Free team datasets ─────────────────────────────────────────────────────
// A free team doesn't choose datasets of its own: its projects use every
// dataset its members chose on their own dashboards, and inside the
// projects everyone can load and export all of them. Outside the projects
// each person downloads only their own picks.

function TeamDatasets({ data, onSaved }: { data: TeamPayload; onSaved: () => void }) {
  const combined = data.team_datasets ?? []
  const mine = data.my_picks
  return (
    <div className="rounded-2xl border border-[#e8dfc6] bg-white p-5 sm:p-6 shadow-[0_14px_34px_-22px_rgba(13,43,69,0.45)]">
      <h2 className="text-lg sm:text-xl font-extrabold text-[#0D2B45]">Your team&apos;s datasets</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[#2c4a63] max-w-3xl">
        Each person on the team chooses {FREE_DATASET_LIMIT} datasets on their own dashboard. Your projects can use all of
        them together, and inside a project everyone can load and export every one. Outside the projects, each person downloads only their own.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {data.members.map((m) => (
          <div key={m.user_id} className="rounded-xl border border-[#ece4cf] bg-[#fbf8f0] p-3.5">
            <p className="text-sm font-bold text-[#0D2B45]">
              {m.member_name || m.member_email || 'Team member'}{m.user_id === data.me.user_id && <span className="font-normal text-[#5a7086]"> (you)</span>}
            </p>
            <p className="mt-1.5 text-sm text-[#2c4a63]">
              {m.free_datasets?.length
                ? m.free_datasets.map(freeDatasetName).join(' · ')
                : <span className="text-[#7d8c99]">Hasn&apos;t chosen yet</span>}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-[#0D2B45]">
        <strong>Available in your projects:</strong>{' '}
        {combined.length ? combined.map(freeDatasetName).join(', ') : <span className="text-[#7d8c99]">none yet</span>}
      </p>

      {mine && mine.left > 0 && (
        <div className="mt-5 border-t border-[#ece4cf] pt-5">
          <FreeDatasetPicker large bare picks={mine.picks} endpoint="/api/account/free-datasets" onSaved={onSaved} />
        </div>
      )}
    </div>
  )
}

type Tab = 'overview' | 'downloads' | 'members' | 'settings'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtWhen = (iso: string) => {
  const d = new Date(iso); const mins = (Date.now() - d.getTime()) / 60_000
  if (mins < 60) return `${Math.max(1, Math.floor(mins))}m ago`
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`
  return fmtDate(iso)
}
const who = (e: Ev) => e.user_name || e.user_email || 'Former member'

export default function TeamPage() {
  const [data, setData] = useState<TeamPayload | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'no_team' | 'signed_out'>('loading')
  const [tab, setTab] = useState<Tab>('overview')
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/team', { cache: 'no-store' })
      if (res.status === 401) { setState('signed_out'); return }
      if (res.status === 404) { setState('no_team'); return }
      if (!res.ok) throw new Error('fetch failed')
      setData(await res.json())
      setState('ready')
    } catch {
      setState('no_team')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  // No auto-redirect on signed_out. /team is publicly routable; if /api/team
  // returns 401, the cookies may not have propagated yet (cookie-race on
  // sign-in) — auto-redirecting to /login here would race with /login's
  // own auto-redirect-when-signed-in and cause a /login ⇄ /team loop,
  // same shape as the dashboard bug reported 2026-06-18.

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={PAPER}>
        <Loader2 size={32} className="animate-spin" style={{ color: GOLD_ICON }} />
      </div>
    )
  }

  if (state === 'signed_out') {
    return (
      <div className="min-h-screen" style={PAPER}>
        <div className="h-24 bg-dark" />
        <div className="max-w-xl mx-auto px-4 text-center text-[#0D2B45]">
          <Users size={40} className="mx-auto" style={{ color: GOLD_ICON }} />
          <h1 className="mt-5 text-2xl font-extrabold">Sign in to open your team</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#2c4a63]">
            Sign in to open your team workspace. New here? Create a free account first: a free team for {FREE_TEAM_SEATS} people costs nothing.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/login?next=%2Fteam"
              className="inline-block rounded-xl px-7 py-3 text-sm font-bold"
              style={{ background: GOLD, color: '#1a1200' }}
            >
              Sign in
            </Link>
            <Link href="/signup" className="inline-block rounded-xl px-7 py-3 text-sm font-bold border border-[#dccfa8] bg-white text-[#0D2B45]">
              Create a free account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'no_team' || !data) {
    return (
      <div className="min-h-screen" style={PAPER}>
        <div className="h-24 bg-dark" />
        <div className="max-w-xl mx-auto px-4 text-center text-[#0D2B45]">
          <Users size={40} className="mx-auto" style={{ color: GOLD_ICON }} />
          <h1 className="mt-5 text-2xl font-extrabold">You&apos;re not on a team yet</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#2c4a63]">
            Start a free team now: a shared project workspace for {FREE_TEAM_SEATS} people, using the {FREE_DATASET_LIMIT} datasets
            each of you chooses. You can be on as many teams as you like, so you can also accept invites to others.
          </p>
          <CreateFreeTeam onCreated={refresh} />
          <p className="mt-6 text-xs text-[#5a7086]">
            Need more seats or every dataset?{' '}
            <Link href="/projects" className="underline" style={{ color: GOLD_INK }}>See team plans</Link>
          </p>
        </div>
      </div>
    )
  }

  const isOwner = data.me.role === 'owner'
  const suspended = data.org.status !== 'active'

  const NAV: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'overview',  label: 'Overview',  icon: LayoutDashboard },
    { id: 'downloads', label: 'Downloads', icon: History },
    { id: 'members',   label: 'Members',   icon: Users },
    { id: 'settings',  label: 'Settings',  icon: Settings2 },
  ]

  return (
    <div className="min-h-screen text-[#0D2B45]" style={PAPER}>
      <div className="h-20 bg-dark" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-6 border-b border-[#e3d7b5]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: GOLD_INK }}>Team workspace</p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold">{data.org.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TeamSwitcher teams={data.teams ?? []} current={data.org.id}
                            className="[&_select]:rounded-lg [&_select]:border [&_select]:border-[#dccfa8] [&_select]:bg-white [&_select]:px-3 [&_select]:py-1.5 [&_select]:text-sm [&_select]:font-semibold [&_select]:text-[#0D2B45]" />
              <button type="button" onClick={() => setCreating((v) => !v)}
                      className="rounded-lg border border-[#dccfa8] bg-white px-3 py-1.5 text-sm font-semibold text-[#0D2B45] hover:border-[#F5B800]">
                {creating ? 'Cancel' : '+ New team'}
              </button>
            </div>
            {creating && (
              <div className="mt-3 max-w-md rounded-xl border border-[#e8dfc6] bg-white p-4">
                <p className="text-sm font-bold">Start another free team</p>
                <p className="mt-1 text-xs text-[#5a7086]">{FREE_TEAM_SEATS} seats, free for good. You can be on as many teams as you like.</p>
                <CreateFreeTeam onCreated={async () => { setCreating(false); window.location.reload() }} />
              </div>
            )}
            <div className="mt-4"><WorkspaceBox hasTeam href="/workspace/team" /></div>
            {data.org.operating_countries.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-[#5a7086]">
                <MapPin size={13} /> Operating in {data.org.operating_countries.join(', ')}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-[#5a7086]">Seats</p>
            <p className="text-lg font-bold">
              {data.seats.used}<span className="text-[#5a7086] font-normal"> of {data.seats.total} used</span>
            </p>
            {data.seats.pending > 0 && (
              <p className="text-[11px] text-[#7d8c99]">{data.seats.pending} invite{data.seats.pending > 1 ? 's' : ''} pending</p>
            )}
          </div>
        </div>

        {data.org.plan === 'free' && (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F5B800]/40 bg-[#fff6d9] p-4 text-sm text-[#2c4a63]">
              <p>
                <strong className="text-[#0D2B45]">Free team.</strong> {FREE_TEAM_SEATS} seats, with no end date. Upgrading keeps your projects and adds seats and every dataset.
              </p>
              <Link href="/projects" className="shrink-0 rounded-lg px-4 py-2 text-xs font-bold" style={{ background: GOLD, color: '#1a1200' }}>Upgrade</Link>
            </div>
            <TeamDatasets data={data} onSaved={refresh} />
          </div>
        )}

        {suspended && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>This team&apos;s plan is currently <strong>{data.org.status}</strong>. Downloads and API access are paused. Contact lengamaps@gmail.com to restore it.</p>
          </div>
        )}

        {/* Tabs */}
        <nav className="mt-6 flex gap-1.5 overflow-x-auto pb-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id} onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === id ? 'text-[#1a1200] shadow-[0_6px_16px_-8px_rgba(201,162,39,0.8)]' : 'text-[#2c4a63] border border-[#e8dfc6] hover:border-[#F5B800]/60 hover:text-[#0D2B45]'
              }`}
              style={tab === id ? { background: GOLD } : { background: '#ffffff' }}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>

        <div className="mt-7">
          {tab === 'overview'  && <Overview  data={data} goto={setTab} />}
          {tab === 'downloads' && <Downloads data={data} />}
          {tab === 'members'   && <MembersTab data={data} isOwner={isOwner} refresh={refresh} />}
          {tab === 'settings'  && <SettingsTab data={data} isOwner={isOwner} refresh={refresh} />}
        </div>
      </div>
    </div>
  )
}

// ── Overview ───────────────────────────────────────────────────────────────

function Overview({ data, goto }: { data: TeamPayload; goto: (t: Tab) => void }) {
  const last7 = data.events.filter((e) => Date.now() - new Date(e.created_at).getTime() < 7 * 864e5)
  const activeMembers = new Set(last7.map((e) => e.user_id)).size

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      {/* Stat cards */}
      <div className="lg:col-span-3 grid sm:grid-cols-3 gap-4">
        {[
          { label: 'Downloads, last 7 days', value: String(last7.length), icon: Download },
          { label: 'Active members this week', value: `${activeMembers} of ${data.members.length}`, icon: Users },
          { label: 'Countries touched', value: String(new Set(data.events.map((e) => e.country).filter(Boolean)).size), icon: Globe2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-[#e8dfc6] bg-white shadow-[0_14px_34px_-22px_rgba(13,43,69,0.45)] p-5">
            <Icon size={18} style={{ color: GOLD_ICON }} />
            <p className="mt-3 text-2xl font-extrabold">{value}</p>
            <p className="text-xs text-[#5a7086] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div className="lg:col-span-2 rounded-2xl border border-[#e8dfc6] bg-white shadow-[0_14px_34px_-22px_rgba(13,43,69,0.45)] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Team activity</h2>
          <button onClick={() => goto('downloads')} className="text-xs font-semibold text-[#5a7086] hover:text-[#0D2B45]">
            Full history →
          </button>
        </div>
        {data.events.length === 0 ? (
          <p className="mt-5 text-sm text-[#5a7086]">
            No downloads yet. The first layer anyone on the team pulls will show up
            here, with its country, CRS and format.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[#ece4cf]">
            {data.events.slice(0, 10).map((e) => (
              <li key={e.id} className="py-3 flex items-start gap-3">
                <Download size={15} className="mt-1 shrink-0" style={{ color: GOLD_ICON }} />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{who(e)}</span>
                    <span className="text-[#2c4a63]"> downloaded </span>
                    <span className="font-semibold">{e.dataset_name ?? e.dataset_slug}</span>
                    {e.country && <span className="text-[#2c4a63]"> · {e.country}</span>}
                  </p>
                  <p className="text-[11px] text-[#7d8c99] mt-0.5">
                    {fmtWhen(e.created_at)}{e.epsg ? ` · ${e.epsg}` : ''}{e.file_format ? ` · ${e.file_format}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* GIS field notes (QA-curated) */}
      <div className="rounded-2xl border border-[#F5B800]/45 bg-[#fff6d9] shadow-[0_14px_34px_-22px_rgba(201,162,39,0.6)] p-6">
        <div className="flex items-center gap-2">
          <Info size={16} style={{ color: GOLD_ICON }} />
          <h2 className="text-base font-bold">GIS field notes</h2>
        </div>
        <ul className="mt-4 space-y-4 text-[13px] leading-relaxed text-[#2c4a63]">
          <li>
            <strong className="text-[#0D2B45]">Measure in a projected CRS.</strong> Every Lenga
            layer ships in EPSG:4326. Reproject to your zone&apos;s UTM (or an equal-area
            CRS) before computing areas or distances — degrees are not metres.
          </li>
          <li>
            <strong className="text-[#0D2B45]">Check the record before you pull.</strong> The
            Downloads tab flags layers a teammate already has, same dataset and country,
            so nobody burns time re-downloading.
          </li>
          <li>
            <strong className="text-[#0D2B45]">LULC note.</strong> Land cover is delivered in
            EPSG:4326 reprojected from Goode Homolosine; use nearest-neighbour if you
            resample it again — it&apos;s categorical data.
          </li>
          {data.org.plan !== 'free' && <li>
            <strong className="text-[#0D2B45]">API access.</strong> Your plan includes the REST
            API. Mint keys from <Link href="/dashboard/api-keys" className="underline decoration-dotted hover:text-[#0D2B45]">API keys</Link>
            <KeyRound size={12} className="inline ml-1 -mt-0.5" style={{ color: GOLD_ICON }} />.
          </li>}
        </ul>
      </div>
    </div>
  )
}

// ── Downloads ──────────────────────────────────────────────────────────────

function Downloads({ data }: { data: TeamPayload }) {
  const [aoiOnly, setAoiOnly] = useState(data.org.operating_countries.length > 0)
  const [q, setQ] = useState('')

  // Duplicate map: dataset+country pulled by 2+ distinct people.
  const dupKey = (e: Ev) => `${e.dataset_slug}__${e.country ?? ''}`
  const dupes = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of data.events) {
      if (!e.user_id) continue
      const k = dupKey(e)
      if (!m.has(k)) m.set(k, new Set())
      m.get(k)!.add(e.user_id)
    }
    return new Set([...m.entries()].filter(([, users]) => users.size > 1).map(([k]) => k))
  }, [data.events])

  const aoi = data.org.operating_countries.map((c) => c.toLowerCase())
  const filtered = data.events.filter((e) => {
    if (aoiOnly && aoi.length > 0 && e.country && !aoi.includes(e.country.toLowerCase())) return false
    if (q) {
      const hay = `${e.dataset_name ?? ''} ${e.dataset_slug} ${e.country ?? ''} ${who(e)}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by dataset, country, or person…"
          className="flex-1 min-w-[220px] rounded-xl border border-[#dccfa8] bg-white px-4 py-2.5 text-sm placeholder:text-[#9aa7b2] focus:outline-none focus:border-[#F5B800]/70"
        />
        {data.org.operating_countries.length > 0 && (
          <button
            onClick={() => setAoiOnly((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold border transition-colors"
            style={aoiOnly
              ? { background: GOLD, color: '#1a1200', borderColor: GOLD }
              : { background: '#102f4e', color: '#bfdbfe', borderColor: 'rgba(30,95,142,0.55)' }}
          >
            <MapPin size={13} /> Project countries only
            {aoiOnly && <X size={12} />}
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-[#7d8c99]">
        {filtered.length} of {data.events.length} recorded downloads
        {aoiOnly && data.org.operating_countries.length > 0 && ` · scoped to ${data.org.operating_countries.join(', ')}`}
      </p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e8dfc6] shadow-[0_14px_34px_-22px_rgba(13,43,69,0.45)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#fbf3dc] text-[11px] uppercase tracking-wider text-[#7a5d00]">
            <tr>
              <th className="px-4 py-3 font-semibold">Dataset</th>
              <th className="px-4 py-3 font-semibold">Country</th>
              <th className="px-4 py-3 font-semibold">CRS</th>
              <th className="px-4 py-3 font-semibold">Format</th>
              <th className="px-4 py-3 font-semibold">Downloaded by</th>
              <th className="px-4 py-3 font-semibold">When</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-[#ece4cf]">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[#5a7086]">No downloads match.</td></tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3">
                  <span className="font-semibold">{e.dataset_name ?? e.dataset_slug}</span>
                  {dupes.has(dupKey(e)) && (
                    <span
                      className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: 'rgba(245,184,0,0.18)', color: GOLD_INK }}
                      title="Two or more teammates downloaded this same dataset and country. Check with each other before pulling again."
                    >
                      <Users size={10} /> team has this
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#0D2B45]">{e.country ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="rounded-md bg-[#f6efdc] px-2 py-1 text-[11px] font-mono text-[#5a4a1a]" title={e.epsg ?? undefined}>
                    {e.epsg ? e.epsg.split(' ')[0] : '—'}
                  </span>
                  {e.epsg?.includes('Homolosine') && (
                    <span className="ml-1.5 text-[10px] text-[#7d8c99]" title={e.epsg}>ⓘ</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#0D2B45] text-[12px]">{e.file_format ?? '—'}</td>
                <td className="px-4 py-3 text-[#0D2B45]">{who(e)}</td>
                <td className="px-4 py-3 text-[#5a7086] text-[12px] whitespace-nowrap">{fmtWhen(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-[#7d8c99]">
        <Info size={13} className="shrink-0 mt-0.5" />
        History records downloads made after your team was provisioned. CRS is shown as
        delivered; reproject before measuring. Files themselves are fetched from the
        dataset pages as usual — this ledger keeps everyone honest about what the team
        already has.
      </p>
    </div>
  )
}

// ── Members ────────────────────────────────────────────────────────────────

function CopyLink({ path }: { path: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={async () => {
        await navigator.clipboard?.writeText(`${window.location.origin}${path}`).catch(() => {})
        setDone(true); setTimeout(() => setDone(false), 2000)
      }}
      className="text-[11px] font-semibold hover:underline"
      style={{ color: GOLD }}
      title="Copy the join link to send on WhatsApp, chat or email"
    >
      {done ? 'Copied' : 'Copy link'}
    </button>
  )
}

function MembersTab({ data, isOwner, refresh }: { data: TeamPayload; isOwner: boolean; refresh: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const seatsLeft = data.seats.total - data.seats.used - data.seats.pending

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null); setBusy(true)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: j.message ?? 'Invite failed.' }); return }
      const link = j.link ? `${window.location.origin}${j.link}` : ''
      if (link) await navigator.clipboard?.writeText(link).catch(() => {})
      setMsg({ ok: true, text: j.email_sent
        ? `Invite sent to ${email}. The join link is also copied, so you can paste it into WhatsApp or chat.`
        : `The email to ${email} did not go through, but the invite is ready: the join link is copied. Paste it to them in WhatsApp, chat or email.` })
      setEmail('')
      await refresh()
    } catch { setMsg({ ok: false, text: 'Network error.' }) } finally { setBusy(false) }
  }

  async function revoke(id: string) {
    await fetch('/api/team/invite', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await refresh()
  }

  async function remove(user_id: string, name: string) {
    if (!confirm(`Remove ${name} from the team? They lose dataset access immediately and the seat is freed.`)) return
    const res = await fetch('/api/team/members', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) setMsg({ ok: false, text: j.message ?? 'Remove failed.' })
    await refresh()
  }

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 rounded-2xl border border-[#e8dfc6] bg-white shadow-[0_14px_34px_-22px_rgba(13,43,69,0.45)] p-6">
        <h2 className="text-base font-bold">Members</h2>
        <ul className="mt-4 divide-y divide-[#ece4cf]">
          {data.members.map((m) => (
            <li key={m.user_id} className="py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                   style={{ background: m.role === 'owner' ? GOLD : '#1E5F8E', color: m.role === 'owner' ? '#1a1200' : '#fff' }}>
                {(m.member_name || m.member_email || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">
                  {m.member_name || m.member_email}
                  {m.role === 'owner' && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: GOLD_INK }}>
                      <Crown size={11} /> owner
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-[#7d8c99] truncate">
                  {m.member_email} · joined {m.joined_at ? fmtDate(m.joined_at) : 'pending'}
                </p>
              </div>
              {isOwner && m.role !== 'owner' && (
                <button
                  onClick={() => remove(m.user_id, m.member_name || m.member_email || 'this member')}
                  className="shrink-0 rounded-lg p-2 text-[#5a7086] hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Remove member (frees the seat)"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {data.invites.length > 0 && (
          <>
            <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-[#5a7086]">Pending invites</h3>
            <ul className="mt-2 divide-y divide-[#ece4cf]">
              {data.invites.map((i) => (
                <li key={i.id} className="py-3 flex items-center gap-3">
                  <Mail size={15} className="text-[#5a7086] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{i.email}</p>
                    <p className="text-[11px] text-[#7d8c99]">invited {fmtDate(i.created_at)} · reserves a seat</p>
                  </div>
                  {isOwner && i.link && <CopyLink path={i.link} />}
                  {isOwner && (
                    <button onClick={() => revoke(i.id)} className="text-[11px] font-semibold text-[#5a7086] hover:text-red-600">
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-[#F5B800]/45 bg-[#fff6d9] shadow-[0_14px_34px_-22px_rgba(201,162,39,0.6)] p-6 h-fit">
        <h2 className="text-base font-bold">Seats</h2>
        <p className="mt-2 text-3xl font-extrabold">
          {data.seats.used}<span className="text-[#5a7086] text-lg font-normal"> / {data.seats.total}</span>
        </p>
        <p className="text-xs text-[#5a7086] mt-1">
          {data.seats.pending > 0 && `${data.seats.pending} reserved by invites · `}
          {Math.max(0, seatsLeft)} free
        </p>

        {isOwner ? (
          <form onSubmit={invite} className="mt-6">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#5a7086] mb-1.5">
              Invite a teammate
            </label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@organisation.org"
              className="w-full rounded-xl border border-[#dccfa8] bg-white px-4 py-2.5 text-sm placeholder:text-[#9aa7b2] focus:outline-none focus:border-[#F5B800]/70"
            />
            <button
              type="submit" disabled={busy || seatsLeft <= 0}
              className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
              style={{ background: GOLD, color: '#1a1200' }}
            >
              {busy ? 'Sending…' : seatsLeft <= 0 ? 'No free seats' : 'Send invite'}
            </button>
            {seatsLeft <= 0 && (
              <p className="mt-2 text-[11px] text-[#7d8c99]">
                Need more seats? Email <a className="underline" href="mailto:lengamaps@gmail.com">lengamaps@gmail.com</a> — we&apos;ll add seats to your plan.
              </p>
            )}
            {msg && (
              <p className={`mt-3 text-xs leading-relaxed ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {msg.ok ? <CheckCircle2 size={12} className="inline mr-1 -mt-0.5" /> : <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
                {msg.text}
              </p>
            )}
          </form>
        ) : (
          <p className="mt-5 text-xs leading-relaxed text-[#5a7086]">
            Your team owner manages seats and invites. Need someone added? Ask them.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Settings ───────────────────────────────────────────────────────────────

function SettingsTab({ data, isOwner, refresh }: { data: TeamPayload; isOwner: boolean; refresh: () => Promise<void> }) {
  const [name, setName] = useState(data.org.name)
  const [countries, setCountries] = useState(data.org.operating_countries.join(', '))
  const [contact, setContact] = useState(data.org.contact_email ?? '')
  const [promo, setPromo] = useState(data.org.promo_emails)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!isOwner) {
    return (
      <div className="rounded-2xl border border-[#e8dfc6] bg-white shadow-[0_14px_34px_-22px_rgba(13,43,69,0.45)] p-6 max-w-xl">
        <h2 className="text-base font-bold">Team settings</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div><dt className="text-[#5a7086] text-xs">Organisation</dt><dd className="font-semibold">{data.org.name}</dd></div>
          <div><dt className="text-[#5a7086] text-xs">Operating countries</dt><dd>{data.org.operating_countries.join(', ') || 'Not set'}</dd></div>
          <div><dt className="text-[#5a7086] text-xs">Contact</dt><dd>{data.org.contact_email ?? '—'}</dd></div>
        </dl>
        <p className="mt-5 text-xs text-[#7d8c99]">Only the team owner can edit settings.</p>
      </div>
    )
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/team', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contact_email: contact,
          promo_emails: promo,
          operating_countries: countries.split(',').map((c) => c.trim()).filter(Boolean),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: j.message ?? 'Save failed.' }); return }
      setMsg({ ok: true, text: 'Saved.' })
      await refresh()
    } catch { setMsg({ ok: false, text: 'Network error.' }) } finally { setBusy(false) }
  }

  const field = 'w-full rounded-xl border border-[#dccfa8] bg-white px-4 py-2.5 text-sm placeholder:text-[#9aa7b2] focus:outline-none focus:border-[#F5B800]/70'
  const label = 'block text-xs font-semibold uppercase tracking-wide text-[#5a7086] mb-1.5'

  return (
    <form onSubmit={save} className="rounded-2xl border border-[#e8dfc6] bg-white shadow-[0_14px_34px_-22px_rgba(13,43,69,0.45)] p-6 max-w-xl space-y-5">
      <h2 className="text-base font-bold">Team settings</h2>
      <div>
        <label className={label} htmlFor="org-name">Organisation / project name</label>
        <input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={field} />
      </div>
      <div>
        <label className={label} htmlFor="org-countries">Operating countries (comma-separated)</label>
        <input id="org-countries" value={countries} onChange={(e) => setCountries(e.target.value)} className={field} placeholder="e.g. Zambia, Malawi, Mozambique" />
        <p className="mt-1.5 text-[11px] text-[#7d8c99]">
          Sets the default &quot;project countries&quot; filter on the team download history, so the whole team works in the same spatial context.
        </p>
      </div>
      <div>
        <label className={label} htmlFor="org-contact">Billing / contact email</label>
        <input id="org-contact" type="email" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} className={field} />
      </div>
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input type="checkbox" checked={promo} onChange={(e) => setPromo(e.target.checked)} className="mt-1" />
        <span className="text-[#0D2B45]">
          Send us occasional team-relevant updates
          <span className="block text-[11px] text-[#7d8c99] mt-0.5">New datasets, coverage expansions and features for project teams. Never spam.</span>
        </span>
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className="rounded-xl px-6 py-2.5 text-sm font-bold disabled:opacity-60" style={{ background: GOLD, color: '#1a1200' }}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}
      </div>
      <p className="text-[11px] leading-relaxed text-[#7d8c99] border-t border-[#ece4cf] pt-4">
        Seat count and plan status are managed by Lenga Maps. Email
        <a className="underline ml-1" href="mailto:lengamaps@gmail.com">lengamaps@gmail.com</a> to change seats or billing.
      </p>
    </form>
  )
}

// ── Start a free team ──────────────────────────────────────────────────────

function CreateFreeTeam({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/team/create-free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const j = await res.json().catch(() => ({}))
      if (res.status === 401) { window.location.href = '/login?next=%2Fteam'; return }
      if (!res.ok) throw new Error(j.message || 'Could not create the team')
      await onCreated()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not create the team') }
    finally { setBusy(false) }
  }
  return (
    <div className="mt-7 text-left">
    <form onSubmit={create} className="flex flex-col sm:flex-row gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team or organisation name" maxLength={120}
             className="flex-1 rounded-xl border border-[#dccfa8] bg-white px-4 py-3 text-sm text-[#0D2B45] placeholder:text-[#9aa7b2]" />
      <button disabled={busy || name.trim().length < 2} className="rounded-xl px-6 py-3 text-sm font-bold disabled:opacity-50" style={{ background: GOLD, color: '#1a1200' }}>
        {busy ? 'Creating…' : 'Start a free team'}
      </button>
    </form>
    {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  )
}
