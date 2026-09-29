'use client'

/**
 * /workspace — "Your teams". The top of the shared workspace:
 *   Workspace → a team (people) → its projects (one map per job).
 * Lists every team you are on, lets you open one or start a new one, and
 * shows pending invites. Opening a team goes to /workspace/team.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Handshake, Map as MapIcon, UserPlus, Users, Loader2 } from 'lucide-react'
import TitleBar from '@/components/workspace/TitleBar'
import Mosaic from '@/components/workspace/Mosaic'
import PendingInvites from '@/components/PendingInvites'

interface Team {
  org_id: string; name: string; plan: 'free' | 'paid'; role: 'owner' | 'member'
  seat_count: number; active: boolean; member_count: number; project_count: number
}

const FLOW = [
  { icon: Users,     title: 'A team',           text: 'You and the people you work with. You can be on several teams.' },
  { icon: UserPlus,  title: 'Invite colleagues', text: 'Send a link. They join with one click, free for 2 people.' },
  { icon: MapIcon,   title: 'Projects',          text: 'Inside a team, start one project per job. Each is one shared map.' },
  { icon: Handshake, title: 'Work together',     text: 'Everyone sees the same layers, comments, voice notes and history.' },
]

export default function WorkspaceTeams() {
  const router = useRouter()
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/workspace/teams').then(async (res) => {
      if (res.status === 401) { router.replace('/login?next=/workspace'); return }
      if (!res.ok) { setErr('Your teams could not be loaded. Please reload the page.'); return }
      const j = await res.json()
      setTeams(j.teams ?? []); setOpen(j.open)
    }).catch(() => setErr('Network error. Please reload the page.'))
  }, [router])

  async function enter(orgId: string) {
    setBusy(orgId); setErr('')
    if (orgId !== open) {
      const res = await fetch('/api/team/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: orgId }),
      }).catch(() => null)
      if (!res?.ok) { setBusy(null); setErr('Could not open that team. Try again.'); return }
    }
    router.push('/workspace/team')
  }

  async function createTeam(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) return
    setCreating(true); setErr('')
    try {
      const res = await fetch('/api/team/create-free', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.message ?? 'Could not create the team.'); setCreating(false); return }
      router.push('/workspace/team')
    } catch { setErr('Network error. Try again.'); setCreating(false) }
  }

  return (
    <div className="ws ws-page has-mosaic">
      <Mosaic kind="team" />
      <TitleBar crumbs={[{ label: 'Workspace' }]} />
      <div className="ws-page-body ws-hub">
        <div className="ws-hub-head">
          <div className="ws-kicker">Shared GIS workspace</div>
          <h1>Your teams</h1>
          <p className="ws-team-explain">A <b>team</b> is a group of people. Inside each team you start <b>projects</b>: one shared map per job.</p>
        </div>

        <ol className="ws-flow" aria-label="How the workspace works">
          {FLOW.map((f, i) => (
            <li key={f.title}>
              <span className="ws-flow-icon"><f.icon size={20} /></span>
              <b><i>{i + 1}</i>{f.title}</b>
              <span>{f.text}</span>
            </li>
          ))}
        </ol>

        <PendingInvites />
        {err && <p className="ws-err" style={{ textAlign: 'center' }}>{err}</p>}
        {!teams && !err && <p className="muted" style={{ textAlign: 'center' }}>Loading your teams…</p>}

        {teams && (
          <div className="ws-team-grid">
            {teams.map((t) => (
              <button key={t.org_id} className={`ws-team-card${t.org_id === open ? ' is-open' : ''}`} onClick={() => void enter(t.org_id)} disabled={!!busy}>
                <span className="ws-team-card-top">
                  <span className={`ws-plan-chip ${t.plan}`}>{t.plan === 'free' ? 'Free team' : 'Paid team'}</span>
                  {t.org_id === open && <span className="ws-open-chip">Open now</span>}
                </span>
                <span className="ws-team-name">{t.name}</span>
                <span className="ws-team-facts">
                  {t.member_count} {t.member_count === 1 ? 'person' : 'people'} · {t.project_count} project{t.project_count === 1 ? '' : 's'} · you are {t.role === 'owner' ? 'the owner' : 'a member'}
                </span>
                {!t.active && <span className="ws-team-facts" style={{ color: '#f0b429' }}>Plan not active</span>}
                <span className="ws-team-go">{busy === t.org_id ? <Loader2 size={14} className="animate-spin" /> : 'Open team →'}</span>
              </button>
            ))}

            <form className="ws-team-card ws-team-new" onSubmit={createTeam}>
              <span className="ws-team-card-top"><span className="ws-plan-chip free">Free for 2 people</span></span>
              <span className="ws-team-name">{teams.length ? 'Start another team' : 'Start your first team'}</span>
              <span className="ws-team-facts">For a client, a department or a partner firm. You can invite people next.</span>
              <input className="ws-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)}
                     placeholder="Team name, e.g. Kafue Consultants" aria-label="Team name" />
              <button className="ws-btn ws-btn-default" disabled={name.trim().length < 2 || creating}>
                {creating ? 'Creating…' : 'Create team'}
              </button>
            </form>
          </div>
        )}

        <p className="ws-hub-foot">
          Need more seats or every dataset? <Link href="/projects">See team plans</Link>. Manage people and invites on the <Link href="/team">Team page</Link>.
        </p>
      </div>
    </div>
  )
}
