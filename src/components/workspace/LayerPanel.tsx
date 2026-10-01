'use client'

import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpToLine, Crosshair, MoreHorizontal, Settings2, Table2, X } from 'lucide-react'
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
  onReorder:   (order: string[]) => void   // all layer ids, top → bottom
  onZoom:      (id: string) => void
  onTable:     (id: string) => void
  phone?:      boolean   // phone view: look only (show/hide, zoom), no changes
  readOnly?:   boolean   // viewers: can look and open the table, cannot change layers
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


interface MenuAt { id: string; x: number; y: number }

/** Right-click menu for a layer, like QGIS's layer context menu. */
function LayerMenu({ at, layer, status, first, last, phone, onClose, p }: {
  at: MenuAt; layer: WsLayer; status?: LayerStatus; first: boolean; last: boolean; phone?: boolean; onClose: () => void; p: Props
}) {
  const edit = !phone && !p.readOnly
  return <LayerMenuBody {...{ at, layer, status, first, last, phone, onClose, p, edit }} />
}

function LayerMenuBody({ at, layer, status, first, last, phone, onClose, p, edit }: {
  at: MenuAt; layer: WsLayer; status?: LayerStatus; first: boolean; last: boolean; phone?: boolean; onClose: () => void; p: Props; edit: boolean
}) {
  useEffect(() => {
    const close = () => onClose()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', close); window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close); window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close); window.removeEventListener('keydown', key)
    }
  }, [onClose])
  const vector = status?.loaded?.kind === 'vector'
  const go = (fn: () => void) => () => { fn(); onClose() }
  const order = p.layers.map((l) => l.id).filter((x) => x !== layer.id)
  // Keep the menu on screen near the bottom and right edges.
  const style = { left: Math.min(at.x, window.innerWidth - 230), top: Math.min(at.y, window.innerHeight - 260) }
  return (
    <div className="ws-menu" role="menu" style={style} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="ws-menu-title" title={layer.label}>{layer.label}</div>
      <button role="menuitem" onClick={go(() => p.onZoom(layer.id))}><Crosshair size={13} /> Zoom to layer</button>
      {!phone && (
        <button role="menuitem" disabled={!vector} onClick={go(() => p.onTable(layer.id))}
                title={vector ? '' : status?.loaded?.kind === 'raster' ? 'Rasters have no attribute table' : 'Available once the layer has loaded'}>
          <Table2 size={13} /> Open attribute table
        </button>
      )}
      {edit && <>
        <button role="menuitem" onClick={go(() => p.onEdit(layer.id))}><Settings2 size={13} /> Style &amp; properties…</button>
        <hr />
        <button role="menuitem" disabled={first} onClick={go(() => p.onReorder([layer.id, ...order]))}><ArrowUpToLine size={13} /> Move to top</button>
        <button role="menuitem" disabled={last} onClick={go(() => p.onReorder([...order, layer.id]))}><ArrowDownToLine size={13} /> Move to bottom</button>
        <hr />
        <button role="menuitem" className="danger" onClick={go(() => p.onRemove(layer.id))}><X size={13} /> Remove from project</button>
      </>}
    </div>
  )
}

export default function LayerPanel(p: Props) {
  const [viewName, setViewName] = useState('')
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)

  function drop(moving: string, targetId: string, after: boolean) {
    if (!moving || moving === targetId || !p.layers.some((l) => l.id === moving)) return
    const order = p.layers.map((l) => l.id).filter((x) => x !== moving)
    const at = order.indexOf(targetId) + (after ? 1 : 0)
    order.splice(at, 0, moving)
    if (order.join() !== p.layers.map((l) => l.id).join()) p.onReorder(order)
  }
  const needle = q.trim().toLowerCase()
  const shown = needle ? p.layers.filter((l) => `${l.label} ${l.country} ${l.file_format}`.toLowerCase().includes(needle)) : p.layers

  return (
    <>
      <div className="ws-panel-head">
        Layers <span className="muted" style={{ fontWeight: 'normal', letterSpacing: 0, textTransform: 'none' }}>({p.layers.length})</span>
        <span className="spacer" />
        {!p.phone && <button className="ws-btn" onClick={p.onAdd} title="Put Lenga datasets on this map">+ Add Lenga data</button>}
      </div>
      <div className="ws-panel-body ws-section" style={{ flex: '1 1 60%' }}>
        {p.layers.length === 0 ? (
          <div className="ws-empty">
            <b>No layers yet.</b><br />
            Use <i>+ Add Lenga data</i> to put a country&apos;s rivers, boundaries, rainfall or any other
            Lenga dataset on the map. Everyone on the team sees the same layers.
          </div>
        ) : (
          <>
          {p.layers.length > 6 && (
            <div className="ws-toc-search">
              <input className="ws-input" placeholder={`Search ${p.layers.length} layers…`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          {needle && shown.length === 0 && <div className="ws-empty">No layer matches &ldquo;{q}&rdquo;.</div>}
          <ul className="ws-toc">
            {shown.map((l) => {
              const st = p.statuses[l.id]
              const line = statusLine(l, st)
              return (
                <li key={l.id}
                    className={[p.selected === l.id && 'sel', drag === l.id && 'dragging', over?.id === l.id && (over.after ? 'drop-after' : 'drop-before')].filter(Boolean).join(' ')}
                    title={p.phone ? undefined : p.readOnly ? 'Right-click for the attribute table' : 'Drag to reorder · right-click for the attribute table, style and more'}
                    draggable={!p.phone && !p.readOnly && !needle}
                    onDragStart={(e) => { setDrag(l.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id) }}
                    onDragOver={(e) => {
                      if (p.phone || p.readOnly) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      const r = e.currentTarget.getBoundingClientRect()
                      const after = e.clientY > r.top + r.height / 2
                      if (over?.id !== l.id || over.after !== after) setOver({ id: l.id, after })
                    }}
                    onDragLeave={() => setOver((o) => (o?.id === l.id ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault()
                      const r = e.currentTarget.getBoundingClientRect()
                      drop(drag ?? e.dataTransfer.getData('text/plain'), l.id, e.clientY > r.top + r.height / 2)
                      setDrag(null); setOver(null)
                    }}
                    onDragEnd={() => { setDrag(null); setOver(null) }}
                    onClick={() => p.onSelect(l.id)}
                    onContextMenu={(e) => { e.preventDefault(); p.onSelect(l.id); setMenu({ id: l.id, x: e.clientX, y: e.clientY }) }}
                    onDoubleClick={() => { if (!p.phone && !p.readOnly) p.onEdit(l.id) }}>
                  <input type="checkbox" checked={!p.hidden.has(l.id)} title="Show / hide (only for you)"
                         onClick={(e) => e.stopPropagation()} onChange={() => p.onToggle(l.id)} />
                  <Swatch layer={l} status={st} />
                  <span className="name" title={l.label}>{l.label}</span>
                  {l.dataset_slug === 'upload'
                    ? <span className="ws-src yours" title="Uploaded by your team. Kept in your team's private folder, never mixed with the Lenga database.">Yours</span>
                    : <span className="ws-src lenga" title="From the Lenga Maps GIS database">Lenga</span>}
                  <span className="acts" onClick={(e) => e.stopPropagation()}>
                    <button className="ws-icon-btn" title="Zoom to layer" onClick={() => p.onZoom(l.id)}><Crosshair size={12} /></button>
                    <button className="ws-icon-btn" title="Attribute table, style and more" aria-haspopup="menu"
                            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); p.onSelect(l.id); setMenu({ id: l.id, x: r.left, y: r.bottom + 2 }) }}>
                      <MoreHorizontal size={13} />
                    </button>
                  </span>
                  <span className={`meta${line.err ? ' err' : ''}`}>{line.text}</span>
                </li>
              )
            })}
          </ul>
          {menu && (() => {
            const l = p.layers.find((x) => x.id === menu.id)
            if (!l) return null
            const i = p.layers.indexOf(l)
            return <LayerMenu at={menu} layer={l} status={p.statuses[l.id]} first={i === 0} last={i === p.layers.length - 1}
                              phone={p.phone} onClose={() => setMenu(null)} p={p} />
          })()}
          </>
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
                {!p.phone && <button className="ws-icon-btn" title="Delete view" onClick={() => p.onDropView(b)}><X size={11} /></button>}
              </li>
            ))}
          </ul>
        )}
        {!p.phone && <form style={{ display: 'flex', gap: 4, padding: '7px 8px' }}
              onSubmit={(e) => { e.preventDefault(); if (viewName.trim()) { p.onSaveView(viewName.trim()); setViewName('') } }}>
          <input className="ws-input" style={{ flex: 1, minWidth: 0 }} placeholder="Name this view" value={viewName}
                 onChange={(e) => setViewName(e.target.value)} maxLength={120} />
          <button className="ws-btn" type="submit" disabled={!viewName.trim()}>Save</button>
        </form>}
      </div>
    </>
  )
}
