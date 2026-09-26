'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Crosshair, Settings2, X } from 'lucide-react'
import { rampCss } from '@/lib/workspace/raster'
import type { WsBookmark, WsLayer } from '@/lib/workspace/types'
import type { LayerStatus } from './MapView'

interface Props {
  layers:      WsLayer[]              // top → bottom, as listed
  statuses:    Record<string, LayerStatus>
  hidden:      Set<string>
  selected:    string | null
  bookmarks:   WsBookmark[]
  onSelect:    (id: string) => void
  onToggle:    (id: string) => void
  onMove:      (id: string, dir: -1 | 1) => void
  onZoom:      (id: string) => void
  onEdit:      (id: string) => void
  onRemove:    (id: string) => void
  onAdd:       () => void
  onGoto:      (b: WsBookmark) => void
  onSaveView:  (name: string) => void
  onDropView:  (b: WsBookmark) => void
}

function Swatch({ layer, status }: { layer: WsLayer; status?: LayerStatus }) {
  const d = status?.loaded
  if (d?.kind === 'raster') return <span className="ws-ramp" style={{ background: rampCss(layer.style.ramp) }} />
  const geom = d?.kind === 'vector' ? d.geom : null
  const c = layer.style.color
  if (geom?.has('Point') && geom.size === 1) return <span className="ws-swatch point" style={{ background: c }} />
  if (geom?.has('LineString') && !geom.has('Polygon')) return <span className="ws-swatch line" style={{ background: c }} />
  return <span className="ws-swatch" style={{ background: layer.style.fill ? c : 'transparent', borderColor: c, borderWidth: 1.5 }} />
}

function statusLine(layer: WsLayer, st?: LayerStatus): { text: string; err?: boolean } {
  if (!st || st.state === 'loading') return { text: 'Loading…' }
  if (st.state === 'error') return { text: st.error ?? 'Could not load', err: true }
  const d = st.loaded!
  if (d.kind === 'raster') return { text: `Raster ${d.raster.width} × ${d.raster.height} · ${layer.country}` }
  return { text: `${d.count.toLocaleString()} features · ${layer.country}` }
}

export default function LayerPanel(p: Props) {
  const [viewName, setViewName] = useState('')

  return (
    <>
      <div className="ws-panel-head">
        Layers <span className="muted" style={{ fontWeight: 'normal', letterSpacing: 0, textTransform: 'none' }}>({p.layers.length})</span>
        <span className="spacer" />
        <button className="ws-btn" onClick={p.onAdd} title="Add a dataset to this map">Add data…</button>
      </div>
      <div className="ws-panel-body ws-section" style={{ flex: '1 1 60%' }}>
        {p.layers.length === 0 ? (
          <div className="ws-empty">
            <b>No layers yet.</b><br />
            Use <i>Add data…</i> to put a country&apos;s rivers, boundaries, rainfall or any other
            Lenga dataset on the map. Everyone on the team sees the same layers.
          </div>
        ) : (
          <ul className="ws-toc">
            {p.layers.map((l, i) => {
              const st = p.statuses[l.id]
              const line = statusLine(l, st)
              return (
                <li key={l.id} className={p.selected === l.id ? 'sel' : ''} onClick={() => p.onSelect(l.id)}
                    onDoubleClick={() => p.onEdit(l.id)}>
                  <input type="checkbox" checked={!p.hidden.has(l.id)} title="Show / hide (only for you)"
                         onClick={(e) => e.stopPropagation()} onChange={() => p.onToggle(l.id)} />
                  <Swatch layer={l} status={st} />
                  <span className="name" title={l.label}>{l.label}</span>
                  <span className="acts" onClick={(e) => e.stopPropagation()}>
                    <button className="ws-icon-btn" title="Zoom to layer" onClick={() => p.onZoom(l.id)}><Crosshair size={11} /></button>
                    <button className="ws-icon-btn" title="Move up" disabled={i === 0} onClick={() => p.onMove(l.id, -1)}><ArrowUp size={11} /></button>
                    <button className="ws-icon-btn" title="Move down" disabled={i === p.layers.length - 1} onClick={() => p.onMove(l.id, 1)}><ArrowDown size={11} /></button>
                    <button className="ws-icon-btn" title="Properties…" onClick={() => p.onEdit(l.id)}><Settings2 size={11} /></button>
                    <button className="ws-icon-btn" title="Remove from project" onClick={() => p.onRemove(l.id)}><X size={11} /></button>
                  </span>
                  <span className={`meta${line.err ? ' err' : ''}`}>{line.text}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="ws-panel-head" style={{ borderTop: '1px solid var(--rule-strong)' }}>Saved views</div>
      <div className="ws-panel-body" style={{ flex: '1 1 40%' }}>
        {p.bookmarks.length === 0 ? (
          <div className="ws-empty">Save the current extent as a named view so the team can jump straight to a site, a basin or a district.</div>
        ) : (
          <ul className="ws-list">
            {p.bookmarks.map((b) => (
              <li key={b.id}>
                <a href="#" className="grow" onClick={(e) => { e.preventDefault(); p.onGoto(b) }} title={`Saved by ${b.created_by_name ?? 'a teammate'}`}>{b.name}</a>
                <span className="mono muted small">z{b.zoom.toFixed(1)}</span>
                <button className="ws-icon-btn" title="Delete view" onClick={() => p.onDropView(b)}><X size={11} /></button>
              </li>
            ))}
          </ul>
        )}
        <form style={{ display: 'flex', gap: 4, padding: '7px 8px' }}
              onSubmit={(e) => { e.preventDefault(); if (viewName.trim()) { p.onSaveView(viewName.trim()); setViewName('') } }}>
          <input className="ws-input" style={{ flex: 1, minWidth: 0 }} placeholder="Name this view" value={viewName}
                 onChange={(e) => setViewName(e.target.value)} maxLength={120} />
          <button className="ws-btn" type="submit" disabled={!viewName.trim()}>Save</button>
        </form>
      </div>
    </>
  )
}
