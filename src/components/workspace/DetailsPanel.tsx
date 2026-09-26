'use client'

import { useEffect, useState } from 'react'
import type { WsMember, WsProject } from '@/lib/workspace/types'
import { initials, stamp, tileColor } from './util'

interface Props {
  project:   WsProject
  members:   WsMember[]
  online:    Set<string>
  me:        { user_id: string; role: 'owner' | 'member' }
  onSave:    (patch: { name: string; description: string }) => Promise<void>
  onArchive: () => void
}

export default function DetailsPanel({ project, members, online, me, onSave, onArchive }: Props) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { setName(project.name); setDescription(project.description) }, [project.name, project.description])
  const dirty = name.trim() !== project.name || description.trim() !== project.description

  return (
    <div className="ws-panel-body" style={{ padding: '10px 10px 16px' }}>
      <form onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        setBusy(true); setMsg('')
        try { await onSave({ name: name.trim(), description: description.trim() }); setMsg('Saved.') }
        catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save') }
        finally { setBusy(false) }
      }}>
        <div className="ws-field">
          <label className="ws-label" htmlFor="pd-name">Project name</label>
          <input id="pd-name" className="ws-input" style={{ width: '100%' }} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="ws-field">
          <label className="ws-label" htmlFor="pd-desc">Brief</label>
          <textarea id="pd-desc" className="ws-textarea" rows={5} value={description} maxLength={2000}
                    placeholder="What is this project for? Client, area of interest, deadlines…"
                    onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="ws-btn ws-btn-default" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save details'}</button>
          <span className="small muted">{msg}</span>
        </div>
      </form>

      <hr style={{ margin: '14px 0 8px' }} />
      <div className="ws-label" style={{ fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.07em', fontSize: 10 }}>Team</div>
      <ul className="ws-list" style={{ border: '1px solid var(--rule)', background: 'var(--white)', marginTop: 4 }}>
        {members.map((m) => (
          <li key={m.user_id}>
            <span className={`ws-avatar${online.has(m.user_id) ? '' : ' away'}`} style={{ background: tileColor(m.user_id) }}>{initials(m.name)}</span>
            <span className="grow">{m.name}{m.user_id === me.user_id && <span className="muted"> (you)</span>}</span>
            <span className="small muted">{online.has(m.user_id) ? 'here now' : m.role}</span>
          </li>
        ))}
      </ul>

      <hr style={{ margin: '14px 0 8px' }} />
      <p className="small muted" style={{ margin: '0 0 8px', lineHeight: 1.6 }}>
        Created {stamp(project.created_at)}. Last changed {stamp(project.updated_at)}.
      </p>
      {(me.role === 'owner' || project.created_by === me.user_id) && (
        <button className="ws-btn ws-btn-danger" onClick={onArchive}>Archive project…</button>
      )}
    </div>
  )
}
