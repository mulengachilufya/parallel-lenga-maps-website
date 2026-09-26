'use client'

import { useEffect, useState } from 'react'
import { shortRev, type WsRevision, type WsSnapshot } from '@/lib/workspace/types'
import { api, diffSnapshots, stamp, timeAgo, type DiffLine } from './util'

interface Props {
  projectId:  string
  revisions:  WsRevision[] | null
  previewSeq: number | null
  onPreview:  (seq: number, snapshot: WsSnapshot) => void
  onRestore:  (rev: WsRevision) => void
}

export default function HistoryPanel({ projectId, revisions, previewSeq, onPreview, onRestore }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<{ seq: number; snapshot: WsSnapshot; diff: DiffLine[] } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (selected === null) { setDetail(null); return }
    let cancelled = false
    setErr('')
    api<{ snapshot: WsSnapshot; previous: WsSnapshot | null }>(`/api/workspace/projects/${projectId}/revisions/${selected}`)
      .then((d) => { if (!cancelled) setDetail({ seq: selected, snapshot: d.snapshot, diff: diffSnapshots(d.previous, d.snapshot) }) })
      .catch((e) => { if (!cancelled) setErr(e.message) })
    return () => { cancelled = true }
  }, [projectId, selected])

  if (!revisions) return <div className="ws-panel-body"><div className="ws-empty">Loading history…</div></div>
  const head = revisions[0]?.seq ?? 0

  return (
    <div className="ws-panel-body">
      <div className="ws-empty" style={{ padding: '8px 10px 4px' }}>
        Every change to the shared map is kept as a numbered revision. Select one to see what changed,
        preview it on the map, or restore it. Restoring adds a new revision; nothing is ever lost.
      </div>
      <ul className="ws-log">
        {revisions.map((r) => (
          <li key={r.id}
              className={[r.seq === head ? 'head' : '', r.action === 'restore' ? 'restore' : '', selected === r.seq ? 'sel' : ''].join(' ')}
              onClick={() => setSelected(selected === r.seq ? null : r.seq)}>
            <div className="line1">
              <span className="seq">r{r.seq}</span>
              <span className="hash">{shortRev(r.id)}</span>
              <span title={stamp(r.created_at)}>{timeAgo(r.created_at)}</span>
              {r.seq === head && <span style={{ color: 'var(--ink)' }}>(latest)</span>}
              {previewSeq === r.seq && <span style={{ color: 'var(--link)' }}>(previewing)</span>}
            </div>
            <div className="line2"><span className="who">{r.author_name}</span> {r.summary.charAt(0).toLowerCase() + r.summary.slice(1)}</div>
            {selected === r.seq && (
              <div onClick={(e) => e.stopPropagation()}>
                {err && <div className="ws-err small">{err}</div>}
                {!detail || detail.seq !== r.seq ? <div className="muted small" style={{ marginTop: 4 }}>Loading diff…</div> : (
                  <>
                    <div className="ws-diff">
                      {detail.diff.map((d, i) => <div key={i} className={d.kind}>{d.text}</div>)}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                      <button className="ws-btn" onClick={() => onPreview(r.seq, detail.snapshot)}>Preview on map</button>
                      {r.seq !== head && (
                        <button className="ws-btn" onClick={() => onRestore(r)}>Restore r{r.seq}…</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
