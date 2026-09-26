'use client'

/**
 * /workspace — the team's projects, like a shared drawer of map files.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import TitleBar from '@/components/workspace/TitleBar'
import { api, stamp, timeAgo } from '@/components/workspace/util'
import type { WsProjectSummary } from '@/lib/workspace/types'

interface ListResponse {
  projects: WsProjectSummary[]
  org:      { id: string; name: string }
  me:       { user_id: string; name: string; role: 'owner' | 'member' }
}

export default function WorkspaceIndex() {
  const router = useRouter()
  const [data, setData] = useState<ListResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'no_team' | 'error'>('loading')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/workspace/projects').then(async (res) => {
      if (res.status === 401) { router.replace('/login?next=/workspace'); return }
      if (res.status === 403) { setState('no_team'); return }
      if (!res.ok) { setState('error'); return }
      setData(await res.json()); setState('ready')
    }).catch(() => setState('error'))
  }, [router])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setErr('')
    try {
      const d = await api<{ id: string }>('/api/workspace/projects', { method: 'POST', json: { name: name.trim(), description: description.trim() } })
      router.push(`/workspace/${d.id}`)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create the project'); setBusy(false) }
  }

  return (
    <div className="ws ws-page">
      <TitleBar crumbs={[{ label: data?.org.name ?? 'Workspace' }]} />
      <div className="ws-page-body">
        {state === 'no_team' && (
          <>
            <h1>The workspace is for team accounts</h1>
            <p className="ws-lede">
              Teams get shared projects: one live map with every Lenga dataset on it, a discussion
              pinned to places on that map, and a full history of who changed what. It comes with the
              4-seat and 12-seat team plans. <Link href="/projects">See team plans</Link>, or ask your
              team owner to invite you from the <Link href="/team">Team</Link> page.
            </p>
          </>
        )}
        {state === 'error' && <p className="ws-err">The projects could not be loaded. Please reload the page.</p>}
        {state === 'loading' && <p className="muted">Loading projects…</p>}

        {state === 'ready' && data && (
          <>
            <h1>Projects</h1>
            <p className="ws-lede">
              Shared maps for {data.org.name}. Everyone on the team sees the same layers, the same
              saved views and the same discussion, and every change is kept in the project&apos;s history.
            </p>
            <div className="ws-cols">
              <div>
                {data.projects.length === 0 ? (
                  <div className="ws-note">
                    <b>No projects yet.</b> Start one on the right, for a client job, a catchment study or a
                    licence area. You can add data and invite discussion straight away.
                  </div>
                ) : (
                  <table className="ws-table">
                    <thead>
                      <tr><th>Project</th><th style={{ width: 60 }}>Layers</th><th style={{ width: 230 }}>Last change</th></tr>
                    </thead>
                    <tbody>
                      {data.projects.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <Link href={`/workspace/${p.id}`} className="pname">{p.name}</Link>
                            {p.description && <div className="muted small" style={{ marginTop: 2, maxWidth: 480 }}>{p.description.length > 160 ? `${p.description.slice(0, 160)}…` : p.description}</div>}
                          </td>
                          <td className="mono">{p.layer_count}</td>
                          <td>
                            {p.last_rev ? (
                              <>
                                <div><b>{p.last_rev.author_name}</b> <span className="muted">{p.last_rev.summary.charAt(0).toLowerCase() + p.last_rev.summary.slice(1)}</span></div>
                                <div className="small muted" title={stamp(p.last_rev.created_at)}>r{p.last_rev.seq} · {timeAgo(p.last_rev.created_at)}</div>
                              </>
                            ) : <span className="muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <form className="ws-box" onSubmit={create}>
                <h2 style={{ fontSize: 16, marginBottom: 8 }}>Start a project</h2>
                <div className="ws-field">
                  <label className="ws-label" htmlFor="np-name">Name</label>
                  <input id="np-name" className="ws-input" style={{ width: '100%' }} value={name} maxLength={120}
                         placeholder="e.g. Kafue Flats water study" onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="ws-field">
                  <label className="ws-label" htmlFor="np-desc">Brief <span className="muted">(optional)</span></label>
                  <textarea id="np-desc" className="ws-textarea" rows={4} value={description} maxLength={2000}
                            placeholder="Client, area of interest, deadline" onChange={(e) => setDescription(e.target.value)} />
                </div>
                <button className="ws-btn ws-btn-default" disabled={!name.trim() || busy}>{busy ? 'Creating…' : 'Create project'}</button>
                {err && <p className="ws-err small" style={{ marginTop: 6 }}>{err}</p>}
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
