'use client'

/**
 * /workspace — the team's projects, like a shared drawer of map files.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import TitleBar from '@/components/workspace/TitleBar'
import { usePhone } from '@/components/workspace/usePhone'
import { api, stamp, timeAgo } from '@/components/workspace/util'
import { ROLE_LABEL, type WsProjectSummary } from '@/lib/workspace/types'
import { AFRICAN_COUNTRIES, TEMPLATES } from '@/lib/workspace/templates'
import { freeDatasetName } from '@/components/FreeDatasetPicker'
import TeamSwitcher, { type TeamOption } from '@/components/TeamSwitcher'

interface ListResponse {
  projects: WsProjectSummary[]
  org:      { id: string; name: string; plan?: 'paid' | 'free'; free_datasets?: string[] }
  teams?:   TeamOption[]
  me:       { user_id: string; name: string; role: 'owner' | 'member' }
}

export default function WorkspaceIndex() {
  const router = useRouter()
  const [data, setData] = useState<ListResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'no_team' | 'error'>('loading')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('')
  const phone = usePhone()
  const [country, setCountry] = useState('ZMB')
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
      const d = await api<{ id: string; added?: number; skipped?: string[] }>('/api/workspace/projects', {
        method: 'POST',
        json: { name: name.trim(), description: description.trim(), ...(template ? { template, country_iso3: country } : {}) },
      })
      const q = template ? `?fit=1${d.skipped?.length ? `&skipped=${encodeURIComponent(d.skipped.join(', '))}` : ''}` : ''
      router.push(`/workspace/${d.id}${q}`)
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
              4-seat and 12-seat team plans, and there is a free team for 2 people with 3 datasets.{' '}
              <Link href="/team?start=free">Start a free team</Link>, <Link href="/projects">see team plans</Link>, or ask your
              team owner to invite you from the <Link href="/team">Team</Link> page.
            </p>
          </>
        )}
        {state === 'error' && <p className="ws-err">The projects could not be loaded. Please reload the page.</p>}
        {state === 'loading' && <p className="muted">Loading projects…</p>}

        {state === 'ready' && data && (
          <>
            <div className="ws-launch-head">
              <h1>Projects</h1>
              <TeamSwitcher teams={data.teams ?? []} current={data.org.id} className="ws-team-switch" />
            </div>

            {/* The one thing to do here: start a project. The four steps sit
                beside the form as a short vertical guide. */}
            {phone ? (
              <p className="ws-note small ws-launch-narrow">
                <b>Phone view.</b> Open a project to view the map, comment and leave voice notes. Start or change projects on a computer.
              </p>
            ) : (
              <section className="ws-launch" aria-label="Start a project">
                <ol className="ws-launch-steps">
                  <li><i>1</i><b>Start a project</b></li>
                  <li><i>2</i><b>Put data on the map</b></li>
                  <li><i>3</i><b>Work on it together</b></li>
                  <li><i>4</i><b>Export to QGIS / ArcGIS</b></li>
                </ol>
                <div className="ws-launch-main">
                  <h2>Start a project</h2>
                <form className="ws-launch-form" onSubmit={create}>
                  <div className="ws-field">
                    <label className="ws-label" htmlFor="np-name">Name</label>
                    <input id="np-name" className="ws-input" style={{ width: '100%' }} value={name} maxLength={120}
                           placeholder="e.g. Kafue Flats water study" onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="ws-field">
                    <label className="ws-label" htmlFor="np-desc">Brief <span className="muted">(optional)</span></label>
                    <textarea id="np-desc" className="ws-textarea" rows={2} value={description} maxLength={2000}
                              placeholder="Client, area of interest, deadline" onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <div className="ws-field">
                    <label className="ws-label" htmlFor="np-tpl">Start from</label>
                    <select id="np-tpl" className="ws-select" style={{ width: '100%' }} value={template} onChange={(e) => setTemplate(e.target.value)}>
                      <option value="">An empty map</option>
                      {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {template && <div className="small muted" style={{ marginTop: 3, lineHeight: 1.5 }}>{TEMPLATES.find((t) => t.id === template)?.blurb}</div>}
                  </div>
                  {template && (
                    <div className="ws-field">
                      <label className="ws-label" htmlFor="np-country">Country</label>
                      <select id="np-country" className="ws-select" style={{ width: '100%' }} value={country} onChange={(e) => setCountry(e.target.value)}>
                        {AFRICAN_COUNTRIES.map((c) => <option key={c.iso3} value={c.iso3}>{c.name}</option>)}
                      </select>
                      <div className="small muted" style={{ marginTop: 3 }}>
                        {TEMPLATES.find((t) => t.id === template)?.layers.length} Lenga datasets go straight onto the map, styled and in order.
                      </div>
                    </div>
                  )}
                  <button className="ws-btn ws-btn-default" disabled={!name.trim() || busy}>{busy ? (template ? 'Building the project…' : 'Creating…') : 'Create project'}</button>
                  {err && <p className="ws-err small" style={{ marginTop: 6 }}>{err}</p>}
                </form>
                </div>
              </section>
            )}

            {data.projects.length > 0 && (
              <section className="ws-launch-narrow">
                <h2 className="ws-launch-sub">Your projects</h2>
                <table className="ws-table">
                  <thead>
                    <tr><th>Project</th><th style={{ width: 60 }}>Layers</th><th style={{ width: 230 }}>Last change</th></tr>
                  </thead>
                  <tbody>
                    {data.projects.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/workspace/${p.id}`} className="pname">{p.name}</Link>
                          {p.my_role && (
                            <>{' '}<span className={`ws-role-chip ${p.my_role}`} style={{ height: 16, fontSize: 9.5, marginLeft: 4 }}>
                              {ROLE_LABEL[p.my_role]}{p.visibility === 'private' ? ' · private' : ''}
                            </span></>
                          )}
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
              </section>
            )}

            {data.org.plan === 'free' && (
              <p className="ws-launch-narrow ws-launch-foot">
                Free team · projects can use {data.org.free_datasets?.length
                  ? data.org.free_datasets.map(freeDatasetName).join(', ')
                  : 'the datasets each member chooses'} · <Link href="/dashboard">Choose yours</Link> · <Link href="/projects">Upgrade</Link>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
