'use client'

/**
 * Add data: a floating window beside the map (not a modal), so previews and
 * place picking happen on the map while it stays open.
 *
 *   By dataset — search datasets, Ctrl/Shift-select one or many, then
 *                Ctrl/Shift-select the country files to add.
 *   By place   — type a place or click places on the map (Ndola, Nairobi…);
 *                every Lenga file for those countries is listed to pick.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogDataset, CatalogFile, WsPlace } from '@/lib/workspace/types'
import { api } from './util'

type Tab = 'dataset' | 'place'

interface Props {
  places:        WsPlace[]
  picking:       boolean
  previewKeys:   Set<string>
  onClose:       () => void
  onAdd:         (files: CatalogFile[]) => Promise<void>
  onPreview:     (files: CatalogFile[]) => void
  onTogglePick:  () => void
  onAddPlace:    (p: WsPlace) => void
  onRemovePlace: (p: WsPlace) => void
}

const fileKey = (f: CatalogFile) => `${f.dataset_slug}|${f.r2_key}`

/** Explorer-style selection: click, Ctrl/Cmd-click to toggle, Shift-click for a range. */
function useSelection<T>(items: T[], key: (t: T) => string) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const anchor = useRef<number | null>(null)
  // key is a pure accessor; recompute only when the items change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const keys = useMemo(() => items.map(key), [items])
  useEffect(() => {
    const live = new Set(keys)
    setSel((s) => ([...s].every((k) => live.has(k)) ? s : new Set([...s].filter((k) => live.has(k)))))
  }, [keys])

  function click(e: React.MouseEvent, index: number, additive = false) {
    const k = keys[index]
    if (e.shiftKey && anchor.current !== null) {
      const [a, b] = [anchor.current, index].sort((x, y) => x - y)
      const range = keys.slice(a, b + 1)
      setSel((s) => new Set([...(e.ctrlKey || e.metaKey ? s : []), ...range]))
      return
    }
    anchor.current = index
    if (e.ctrlKey || e.metaKey || additive) {
      setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
    } else {
      setSel(new Set([k]))
    }
  }
  return {
    sel, click,
    set: (ks: string[]) => setSel(new Set(ks)),
    clear: () => setSel(new Set()),
    selected: items.filter((t) => sel.has(key(t))),
  }
}

function FileRows({ files, selection, previewKeys, showDataset, datasetName, onActivate }: {
  files: CatalogFile[]
  selection: ReturnType<typeof useSelection<CatalogFile>>
  previewKeys: Set<string>
  showDataset: boolean
  datasetName: (slug: string) => string
  onActivate: (f: CatalogFile) => void
}) {
  let lastGroup = ''
  return (
    <>
      {files.map((f, i) => {
        const group = showDataset ? f.dataset_slug : ''
        const head = group !== lastGroup ? (lastGroup = group, group) : null
        const on = selection.sel.has(fileKey(f))
        return (
          <div key={fileKey(f)}>
            {head && <div className="ws-pick-group">{datasetName(head)}</div>}
            <button className={on ? 'on' : ''} onMouseDown={(e) => { if (e.shiftKey) e.preventDefault() }}
                    onClick={(e) => selection.click(e, i)} onDoubleClick={() => onActivate(f)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <input type="checkbox" checked={on} readOnly tabIndex={-1}
                       onClick={(e) => { e.stopPropagation(); selection.click(e, i, true) }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.country}{f.variant && <span className="muted"> · {f.variant}</span>}
                </span>
                {previewKeys.has(fileKey(f)) && <span className="ws-pin-tag" style={{ cursor: 'default' }}>preview</span>}
              </span>
              <span className="mono muted">{f.file_size_mb ? `${f.file_size_mb.toFixed(1)} MB` : ''}</span>
            </button>
          </div>
        )
      })}
    </>
  )
}

export default function AddData(p: Props) {
  const [tab, setTab] = useState<Tab>(p.places.length ? 'place' : 'dataset')
  const [datasets, setDatasets] = useState<CatalogDataset[] | null>(null)
  const [dq, setDq] = useState('')
  const [fq, setFq] = useState('')
  const [files, setFiles] = useState<CatalogFile[] | null>(null)
  const [placeFiles, setPlaceFiles] = useState<CatalogFile[] | null>(null)
  const [pq, setPq] = useState('')
  const [pResults, setPResults] = useState<WsPlace[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api<{ datasets: CatalogDataset[] }>('/api/workspace/catalog').then((d) => setDatasets(d.datasets)).catch((e) => setErr(e.message))
  }, [])
  useEffect(() => { if (p.places.length) setTab('place') }, [p.places.length])

  const nameOf = useMemo(() => {
    const m = new Map((datasets ?? []).map((d) => [d.id, d.name]))
    return (slug: string) => m.get(slug) ?? slug
  }, [datasets])

  // ── By dataset ───────────────────────────────────────────────────────────
  const shownDatasets = useMemo(() => {
    const n = dq.trim().toLowerCase()
    return (datasets ?? []).filter((d) => !n || d.name.toLowerCase().includes(n) || d.id.includes(n) || (n === 'raster' && d.raster) || (n === 'vector' && !d.raster))
  }, [datasets, dq])
  const dsel = useSelection(shownDatasets, (d: CatalogDataset) => d.id)
  const chosen = useMemo(() => [...dsel.sel].sort().join(','), [dsel.sel])

  useEffect(() => {
    if (!chosen) { setFiles(null); return }
    setFiles(null)
    api<{ files: CatalogFile[] }>(`/api/workspace/catalog?dataset=${encodeURIComponent(chosen)}`)
      .then((d) => setFiles(d.files)).catch((e) => setErr(e.message))
  }, [chosen])

  const shownFiles = useMemo(() => {
    const n = fq.trim().toLowerCase()
    return (files ?? [])
      .filter((f) => !n || f.country.toLowerCase().includes(n) || f.country_iso3.toLowerCase() === n || f.variant.toLowerCase().includes(n))
      .sort((a, b) => a.dataset_slug.localeCompare(b.dataset_slug) || a.country.localeCompare(b.country) || a.variant.localeCompare(b.variant))
  }, [files, fq])
  const fsel = useSelection(shownFiles, fileKey)

  // ── By place ─────────────────────────────────────────────────────────────
  const isoList = useMemo(() => [...new Set(p.places.map((pl) => pl.iso3))].sort().join(','), [p.places])
  useEffect(() => {
    if (!isoList) { setPlaceFiles(null); return }
    setPlaceFiles(null)
    api<{ files: CatalogFile[] }>(`/api/workspace/catalog?countries=${isoList}`)
      .then((d) => setPlaceFiles(d.files)).catch((e) => setErr(e.message))
  }, [isoList])
  const shownPlaceFiles = useMemo(() => [...(placeFiles ?? [])]
    .sort((a, b) => nameOf(a.dataset_slug).localeCompare(nameOf(b.dataset_slug)) || a.country.localeCompare(b.country) || a.variant.localeCompare(b.variant)),
  [placeFiles, nameOf])
  const psel = useSelection(shownPlaceFiles, fileKey)

  async function searchPlaces(e: React.FormEvent) {
    e.preventDefault()
    if (!pq.trim()) return
    setPResults(null); setErr('')
    try { setPResults((await api<{ places: WsPlace[] }>(`/api/workspace/geocode?q=${encodeURIComponent(pq.trim())}`)).places) }
    catch (er) { setErr(er instanceof Error ? er.message : 'Search failed'); setPResults([]) }
  }

  const current = tab === 'dataset' ? fsel.selected : psel.selected

  async function add(list: CatalogFile[] = current) {
    if (!list.length || busy) return
    setBusy(true); setErr('')
    try { await p.onAdd(list); (tab === 'dataset' ? fsel : psel).clear() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not add') }
    finally { setBusy(false) }
  }

  return (
    <div className={`ws-float${p.picking && tab === 'place' ? ' compact' : ''}`} role="dialog" aria-label="Add data">
      <div className="ws-panel-head">Add data<span className="spacer" />
        <button className="ws-icon-btn" onClick={p.onClose} aria-label="Close">×</button>
      </div>
      <div className="ws-tabs" style={{ background: 'none', borderBottom: '1px solid var(--rule-strong)' }}>
        <button className={`ws-tab${tab === 'dataset' ? ' on' : ''}`} onClick={() => setTab('dataset')}>By dataset</button>
        <button className={`ws-tab${tab === 'place' ? ' on' : ''}`} onClick={() => setTab('place')}>
          By place{p.places.length > 0 && <span className="count">{p.places.length}</span>}
        </button>
      </div>

      {tab === 'dataset' ? (
        <div className="content">
          <div className="ws-pick" style={{ gridTemplateColumns: '200px 1fr' }}>
            <div>
              <div className="ws-pick-search">
                <input className="ws-input" placeholder="Search datasets" value={dq} onChange={(e) => setDq(e.target.value)} autoFocus />
              </div>
              {!datasets ? <div className="ws-empty">Loading catalogue…</div> : shownDatasets.length === 0 ? <div className="ws-empty">No dataset matches.</div> :
                shownDatasets.map((d, i) => (
                  <button key={d.id} className={dsel.sel.has(d.id) ? 'on' : ''} onMouseDown={(e) => { if (e.shiftKey) e.preventDefault() }}
                          onClick={(e) => dsel.click(e, i)}>
                    <span>{d.name}</span><span className="kind">{d.raster ? 'raster' : 'vector'}</span>
                  </button>
                ))}
            </div>
            <div>
              {!chosen ? (
                <div className="ws-empty">← Choose a dataset. Hold <b>Ctrl</b> or <b>Shift</b> to choose several.</div>
              ) : (
                <>
                  <div className="ws-pick-search">
                    <input className="ws-input" placeholder="Filter by country, ISO code or level" value={fq} onChange={(e) => setFq(e.target.value)} />
                  </div>
                  {!files ? <div className="ws-empty">Loading files…</div> : shownFiles.length === 0 ? <div className="ws-empty">No match.</div> :
                    <FileRows files={shownFiles} selection={fsel} previewKeys={p.previewKeys}
                              showDataset={dsel.sel.size > 1} datasetName={nameOf} onActivate={(f) => void add([f])} />}
                </>
              )}
            </div>
          </div>
          <div className="small muted" style={{ marginTop: 5, display: 'flex', gap: 10 }}>
            <span>{fsel.selected.length} selected</span>
            {shownFiles.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); fsel.set(shownFiles.map(fileKey)) }}>Select all shown ({shownFiles.length})</a>}
            {fsel.selected.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); fsel.clear() }}>Clear</a>}
            <span style={{ marginLeft: 'auto' }}>Click · Ctrl+click · Shift+click · double-click adds one</span>
          </div>
        </div>
      ) : (
        <div className="content">
          <form onSubmit={searchPlaces} style={{ display: 'flex', gap: 4 }}>
            <input className="ws-input" style={{ flex: 1 }} placeholder="Find a place: Ndola, Nairobi, Kafue Flats…" value={pq} onChange={(e) => setPq(e.target.value)} />
            <button className="ws-btn" type="submit">Find</button>
            <button type="button" className={`ws-btn${p.picking ? ' is-on' : ''}`} onClick={p.onTogglePick}
                    title="Click places on the map to add them">{p.picking ? 'Picking… click the map' : 'Pick on map'}</button>
          </form>
          {pResults && (
            <div className="ws-results">
              {pResults.length === 0 ? <div className="ws-empty">No place in Africa by that name.</div> : pResults.map((r, i) => (
                <button key={i} onClick={() => { p.onAddPlace(r); setPResults(null); setPq('') }}>
                  <b>{r.name}</b> <span className="muted">{[r.region, r.country].filter(Boolean).join(', ')}</span>
                </button>
              ))}
            </div>
          )}
          <div className="ws-chips">
            {p.places.length === 0 ? (
              <span className="muted">No places yet. Search above, or press <i>Pick on map</i> and click the towns or areas you work in.</span>
            ) : p.places.map((pl, i) => (
              <span key={`${pl.iso3}-${pl.lng}-${pl.lat}-${i}`} className="ws-chip">
                <b>{pl.name}</b> <span className="muted">{pl.country}</span>
                <button onClick={() => p.onRemovePlace(pl)} aria-label={`Remove ${pl.name}`}>×</button>
              </span>
            ))}
          </div>
          <div className="ws-pick no-search hide-compact" style={{ gridTemplateColumns: '1fr', height: 250 }}>
            <div>
              {!isoList ? <div className="ws-empty">Data for the countries of the places you pick is listed here.</div>
                : !placeFiles ? <div className="ws-empty">Finding data for {[...new Set(p.places.map((x) => x.country))].join(', ')}…</div>
                : shownPlaceFiles.length === 0 ? <div className="ws-empty">No Lenga files for those countries yet.</div>
                : <FileRows files={shownPlaceFiles} selection={psel} previewKeys={p.previewKeys} showDataset datasetName={nameOf}
                            onActivate={(f) => void add([f])} />}
            </div>
          </div>
          <div className="small muted hide-compact" style={{ marginTop: 5, display: 'flex', gap: 10 }}>
            <span>{psel.selected.length} selected</span>
            {shownPlaceFiles.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); psel.set(shownPlaceFiles.map(fileKey)) }}>Select all ({shownPlaceFiles.length})</a>}
            {psel.selected.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); psel.clear() }}>Clear</a>}
          </div>
        </div>
      )}

      <div className="buttons hide-compact">
        {err && <span className="ws-err small" style={{ marginRight: 'auto' }}>{err}</span>}
        <button className="ws-btn" disabled={!current.length} title="Show the selected files on the map without adding them (up to 6)"
                onClick={() => p.onPreview(current.slice(0, 6))}>Preview{current.length ? ` (${Math.min(6, current.length)})` : ''}</button>
        {p.previewKeys.size > 0 && <button className="ws-btn" onClick={() => p.onPreview([])}>Clear preview</button>}
        <button className="ws-btn ws-btn-default" disabled={!current.length || busy} onClick={() => void add()}>
          {busy ? 'Adding…' : current.length > 1 ? `Add ${current.length} layers` : 'Add to map'}
        </button>
      </div>
    </div>
  )
}
