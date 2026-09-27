'use client'

import { useEffect, useState } from 'react'
import { ROLE_HELP, ROLE_LABEL, type ProjectRole, type WsMember, type WsProject } from '@/lib/workspace/types'
import { initials, stamp, tileColor } from './util'

type Patch = { name?: string; description?: string; visibility?: 'team' | 'private'; default_role?: 'viewer' | 'editor' }

interface Props {
  project:   WsProject
  members:   WsMember[]
  online:    Set<string>
  me:        { user_id: string; role: 'owner' | 'member'; project_role: ProjectRole }
  onSave:    (patch: Patch) => Promise<void>
  onSetRole: (userId: string, role: ProjectRole | null) => Promise<void>
  onDuplicate?: () => void
  onArchive: () => void
  locked?:   boolean   // phone view: read only
}

const HEAD: React.CSSProperties = { fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.07em', fontSize: 10 }

export default function DetailsPanel({ project, members, online, me, onSave, onSetRole, onDuplicate, onArchive, locked }: Props) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [accessMsg, setAccessMsg] = useState('')
  useEffect(() => { setName(project.name); setDescription(project.description) }, [project.name, project.description])
  const manager = me.project_role === 'manager' && !locked
  const dirty = name.trim() !== project.name || description.trim() !== project.description
  const visibility = project.visibility ?? 'team'
  const defaultRole = project.default_role ?? 'editor'

  async function access(fn: () => Promise<void>) {
    setAccessMsg('')
    try { await fn(); setAccessMsg('Saved.') } catch (e) { setAccessMsg(e instanceof Error ? e.message : 'Could not save') }
  }

  return (
    <div className="ws-panel-body" style={{ padding: '10px 10px 16px' }}>
      <form onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim() || !manager) return
        setBusy(true); setMsg('')
        try { await onSave({ name: name.trim(), description: description.trim() }); setMsg('Saved.') }
        catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save') }
        finally { setBusy(false) }
      }}>
        <div className="ws-field">
          <label className="ws-label" htmlFor="pd-name">Project name</label>
          <input id="pd-name" className="ws-input" style={{ width: '100%' }} value={name} maxLength={120} disabled={!manager} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="ws-field">
          <label className="ws-label" htmlFor="pd-desc">Brief</label>
          <textarea id="pd-desc" className="ws-textarea" rows={5} value={description} maxLength={2000} disabled={!manager}
                    placeholder="What is this project for? Client, area of interest, deadlines…"
                    onChange={(e) => setDescription(e.target.value)} />
        </div>
        {manager && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="ws-btn ws-btn-default" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save details'}</button>
            <span className="small muted">{msg}</span>
          </div>
        )}
      </form>

      <hr style={{ margin: '14px 0 8px' }} />
      <div className="ws-label" style={HEAD}>Members and access</div>
      <p className="small muted" style={{ margin: '3px 0 8px', lineHeight: 1.55 }}>
        You are a <b style={{ color: 'var(--ink)' }}>{ROLE_LABEL[me.project_role].toLowerCase()}</b> here. {ROLE_HELP[me.project_role]}
      </p>
      {manager && (
        <div className="ws-box" style={{ marginBottom: 8, padding: '7px 9px' }}>
          <label className="ws-check" style={{ display: 'flex', marginBottom: 4 }}>
            <input type="radio" name="vis" checked={visibility === 'team'} onChange={() => void access(() => onSave({ visibility: 'team' }))} />
            <span>Whole team: everyone on the team can open it as a{' '}
              <select className="ws-select" value={defaultRole} disabled={visibility !== 'team'}
                      onChange={(e) => void access(() => onSave({ default_role: e.target.value as 'viewer' | 'editor' }))}>
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
            </span>
          </label>
          <label className="ws-check" style={{ display: 'flex' }}>
            <input type="radio" name="vis" checked={visibility === 'private'} onChange={() => void access(() => onSave({ visibility: 'private' }))} />
            <span>Private: only the people given a role below can see it exists</span>
          </label>
          {accessMsg && <div className="small muted" style={{ marginTop: 4 }}>{accessMsg}</div>}
        </div>
      )}
      <ul className="ws-list" style={{ border: '1px solid var(--rule)', background: 'var(--white)' }}>
        {members.map((m) => {
          const fixed = m.role === 'owner' || project.created_by === m.user_id
          const value = m.explicit ? (m.project_role ?? '') : ''
          return (
            <li key={m.user_id}>
              <span className={`ws-avatar${online.has(m.user_id) ? '' : ' away'}`} style={{ background: tileColor(m.user_id) }}>{initials(m.name)}</span>
              <span className="grow">
                {m.name}{m.user_id === me.user_id && <span className="muted"> (you)</span>}
                {online.has(m.user_id) && <span className="muted small"> · here now</span>}
              </span>
              {manager && !fixed ? (
                <select className="ws-select" value={value} title="Role on this project"
                        onChange={(e) => void access(() => onSetRole(m.user_id, (e.target.value || null) as ProjectRole | null))}>
                  <option value="">{visibility === 'team' ? `Team default (${defaultRole})` : 'No access'}</option>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="manager">Manager</option>
                </select>
              ) : (
                <span className="small muted" title={fixed ? (m.role === 'owner' ? 'Team owners manage every project' : 'Created this project') : undefined}>
                  {m.project_role ? ROLE_LABEL[m.project_role] : 'No access'}{fixed ? (m.role === 'owner' ? ' · team owner' : ' · creator') : ''}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="small muted" style={{ margin: '6px 0 0', lineHeight: 1.55 }}>
        Viewers can comment and leave voice notes but can&apos;t change or export anything. Their
        browser still receives the map data it draws, so treat viewer access as &ldquo;can see&rdquo;, not as a
        copy-protection guarantee.
      </p>

      <hr style={{ margin: '14px 0 8px' }} />
      <p className="small muted" style={{ margin: '0 0 8px', lineHeight: 1.6 }}>
        Created {stamp(project.created_at)}. Last changed {stamp(project.updated_at)}.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        {onDuplicate && <button className="ws-btn" onClick={onDuplicate} title="Same layers, styles and saved views in a new project; no discussion or history">Duplicate project…</button>}
        {manager && <button className="ws-btn ws-btn-danger" onClick={onArchive}>Archive project…</button>}
      </div>
    </div>
  )
}
