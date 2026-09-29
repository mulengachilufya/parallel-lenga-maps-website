'use client'

/**
 * Pick which of your teams is open. People can be on many teams; the team
 * page, workspace and downloads all follow the open one. Renders nothing
 * for someone on a single team.
 */
import { useState } from 'react'

export interface TeamOption { org_id: string; name: string }

export default function TeamSwitcher({ teams, current, className = '', style }: {
  teams: TeamOption[]; current: string; className?: string; style?: React.CSSProperties
}) {
  const [busy, setBusy] = useState(false)
  if (teams.length < 2) return null

  async function open(orgId: string) {
    if (orgId === current) return
    setBusy(true)
    const res = await fetch('/api/team/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: orgId }),
    }).catch(() => null)
    if (res?.ok) window.location.reload()
    else setBusy(false)
  }

  return (
    <label className={className} style={style}>
      <span className="sr-only">Open another team</span>
      <select value={current} disabled={busy} onChange={(e) => void open(e.target.value)} aria-label="Open another team">
        {teams.map((t) => <option key={t.org_id} value={t.org_id}>{t.name}</option>)}
      </select>
    </label>
  )
}
