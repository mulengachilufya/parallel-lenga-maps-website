'use client'

/**
 * Attribute table for one vector layer, docked under the map.
 *
 * Rows are the layer's features (addressed by index in its
 * FeatureCollection, the same ids the map uses). Sort by clicking a
 * header, filter with the search box, hide columns, select with click /
 * Ctrl-click / Shift-click. Selection and map stay in step both ways:
 * selected rows are highlighted on the map, and clicking a feature on the
 * map selects and scrolls to its row. Only the visible rows are rendered,
 * so layers with tens of thousands of features stay responsive.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, FeatureCollection } from 'geojson'

const ROW_H = 22
const OVERSCAN = 12

interface Props {
  label:       string
  fc:          FeatureCollection
  selected:    number[]
  focus:       number | null                 // row to scroll into view (from a map click)
  canExport:   boolean
  onSelect:    (ids: number[]) => void
  onZoom:      (ids: number[]) => void
  onFilter:    (ids: number[] | null) => void // map shows only these (null = all)
  onClose:     () => void
}

type Sort = { col: string; dir: 1 | -1 } | null

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)))
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const safe = (s: string) => s.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'layer'

export default function AttributeTable(p: Props) {
  const feats = p.fc.features
  const columns = useMemo(() => {
    const seen = new Set<string>()
    for (let i = 0; i < feats.length && i < 500; i++) for (const k of Object.keys(feats[i].properties ?? {})) seen.add(k)
    return [...seen]
  }, [feats])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>(null)
  const [onlySel, setOnlySel] = useState(false)
  const [mapFollows, setMapFollows] = useState(false)
  const [colMenu, setColMenu] = useState(false)
  const [scroll, setScroll] = useState(0)
  const [height, setHeight] = useState(200)
  const anchor = useRef<number | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const sel = useMemo(() => new Set(p.selected), [p.selected])

  // Filter + sort → the ordered list of feature indices shown.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let ids = feats.map((_, i) => i)
    if (onlySel) ids = ids.filter((i) => sel.has(i))
    if (needle) {
      ids = ids.filter((i) => {
        const pr = feats[i].properties ?? {}
        for (const c of columns) if (cell(pr[c]).toLowerCase().includes(needle)) return true
        return String(i + 1) === needle
      })
    }
    if (sort) {
      const { col, dir } = sort
      const val = (i: number) => (col === '#' ? i : (feats[i].properties ?? {})[col])
      ids.sort((a, b) => {
        const x = val(a), y = val(b)
        if (x === y) return a - b
        if (x === null || x === undefined || x === '') return 1
        if (y === null || y === undefined || y === '') return -1
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
        return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir
      })
    }
    return ids
  }, [feats, columns, q, sort, onlySel, sel])

  const filtered = q.trim() !== '' || onlySel
  useEffect(() => {
    p.onFilter(mapFollows && filtered ? rows : null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFollows, filtered, rows])
  useEffect(() => () => p.onFilter(null), [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Map click → scroll the row into view.
  useEffect(() => {
    if (p.focus === null || !body.current) return
    const at = rows.indexOf(p.focus)
    if (at < 0) return
    const top = at * ROW_H, el = body.current
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - ROW_H * 2) el.scrollTop = Math.max(0, top - el.clientHeight / 2)
  }, [p.focus, rows])

  useEffect(() => {
    const el = body.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function clickRow(e: React.MouseEvent, id: number) {
    if (e.shiftKey && anchor.current !== null) {
      const a = rows.indexOf(anchor.current), b = rows.indexOf(id)
      if (a >= 0 && b >= 0) {
        const range = rows.slice(Math.min(a, b), Math.max(a, b) + 1)
        p.onSelect(e.ctrlKey || e.metaKey ? [...new Set([...p.selected, ...range])] : range)
        return
      }
    }
    anchor.current = id
    if (e.ctrlKey || e.metaKey) p.onSelect(sel.has(id) ? p.selected.filter((x) => x !== id) : [...p.selected, id])
    else p.onSelect(sel.size === 1 && sel.has(id) ? [] : [id])
  }

  function exportRows(kind: 'geojson' | 'csv') {
    const ids = p.selected.length ? p.selected : rows
    const chosen: Feature[] = ids.map((i) => feats[i])
    const base = `${safe(p.label)}${p.selected.length ? '_selection' : filtered ? '_filtered' : ''}`
    if (kind === 'geojson') {
      download(`${base}.geojson`, 'application/geo+json', JSON.stringify({ type: 'FeatureCollection', features: chosen }))
    } else {
      const cols = columns.filter((c) => !hidden.has(c))
      const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
      const lines = [cols.map(esc).join(','), ...chosen.map((f) => cols.map((c) => esc(cell((f.properties ?? {})[c]))).join(','))]
      download(`${base}.csv`, 'text/csv', lines.join('\r\n'))
    }
  }

  const shownCols = columns.filter((c) => !hidden.has(c))
  const first = Math.max(0, Math.floor(scroll / ROW_H) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((scroll + height) / ROW_H) + OVERSCAN)
  const header = (c: string, label = c) => (
    <th key={c} onClick={() => setSort((s) => (s?.col === c ? (s.dir === 1 ? { col: c, dir: -1 } : null) : { col: c, dir: 1 }))} title={`Sort by ${label}`}>
      {label}{sort?.col === c ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div className="ws-attr" onKeyDown={(e) => {
      if (e.key === 'Escape') p.onSelect([])
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && (e.target as HTMLElement).tagName !== 'INPUT') { e.preventDefault(); p.onSelect(rows) }
    }} tabIndex={-1}>
      <div className="ws-attr-bar">
        <b className="ttl" title={p.label}>{p.label}</b>
        <span className="mono muted">{p.selected.length ? `${p.selected.length.toLocaleString()} selected · ` : ''}{rows.length.toLocaleString()}{filtered ? ` of ${feats.length.toLocaleString()}` : ''} features</span>
        <input className="ws-input" placeholder="Filter rows…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 170 }} />
        <label className="ws-check small"><input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} /> Selected only</label>
        <label className="ws-check small" title="Show only the rows in this table on the map"><input type="checkbox" checked={mapFollows} onChange={(e) => setMapFollows(e.target.checked)} /> Filter the map too</label>
        <span className="grow" />
        <button className="ws-btn" disabled={!p.selected.length} onClick={() => p.onZoom(p.selected)}>Zoom to selection</button>
        <button className="ws-btn" disabled={!p.selected.length} onClick={() => p.onSelect([])}>Clear</button>
        <span style={{ position: 'relative' }}>
          <button className="ws-btn" onClick={() => setColMenu((v) => !v)}>Columns ▾</button>
          {colMenu && (
            <div className="ws-attr-cols" onMouseLeave={() => setColMenu(false)}>
              {columns.map((c) => (
                <label key={c} className="ws-check"><input type="checkbox" checked={!hidden.has(c)}
                  onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n })} /> {c}</label>
              ))}
            </div>
          )}
        </span>
        {p.canExport && (
          <>
            <button className="ws-btn" onClick={() => exportRows('geojson')} title={p.selected.length ? 'Export the selected features' : 'Export the rows shown'}>GeoJSON</button>
            <button className="ws-btn" onClick={() => exportRows('csv')} title="Attributes only, visible columns">CSV</button>
          </>
        )}
        <button className="ws-icon-btn" onClick={p.onClose} aria-label="Close attribute table">×</button>
      </div>
      <div className="ws-attr-body" ref={body} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
        {columns.length === 0 && feats.length > 0 && <div className="ws-empty">These features have no attributes.</div>}
        <table style={{ height: (rows.length + 1) * ROW_H }}>
          <thead><tr>{header('#')}{shownCols.map((c) => header(c))}</tr></thead>
          <tbody>
            {first > 0 && <tr style={{ height: first * ROW_H }} aria-hidden><td colSpan={shownCols.length + 1} /></tr>}
            {rows.slice(first, last).map((i) => {
              const pr = feats[i].properties ?? {}
              return (
                <tr key={i} className={sel.has(i) ? 'sel' : ''} onClick={(e) => clickRow(e, i)} onDoubleClick={() => p.onZoom([i])}>
                  <td className="mono muted">{i + 1}</td>
                  {shownCols.map((c) => <td key={c} title={cell(pr[c])}>{cell(pr[c])}</td>)}
                </tr>
              )
            })}
            {last < rows.length && <tr style={{ height: (rows.length - last) * ROW_H }} aria-hidden><td colSpan={shownCols.length + 1} /></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
