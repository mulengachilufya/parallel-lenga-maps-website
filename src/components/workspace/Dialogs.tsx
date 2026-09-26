'use client'

import { useEffect, useMemo, useState } from 'react'
import { rampCss } from '@/lib/workspace/raster'
import type { CatalogDataset, CatalogFile, LayerStyle, RasterRamp, WsLayer } from '@/lib/workspace/types'
import { api } from './util'

function Dialog({ title, onClose, children, buttons }: {
  title: string; onClose: () => void; children: React.ReactNode; buttons: React.ReactNode
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="ws-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ws-dialog" role="dialog" aria-label={title}>
        <div className="ws-panel-head">{title}<span className="spacer" />
          <button className="ws-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="content">{children}</div>
        <div className="buttons">{buttons}</div>
      </div>
    </div>
  )
}

// ── Add data ────────────────────────────────────────────────────────────────

export function AddDataDialog({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (datasetSlug: string, file: CatalogFile) => Promise<void>
}) {
  const [datasets, setDatasets] = useState<CatalogDataset[] | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [files, setFiles] = useState<CatalogFile[] | null>(null)
  const [pick, setPick] = useState<CatalogFile | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api<{ datasets: CatalogDataset[] }>('/api/workspace/catalog')
      .then((d) => setDatasets(d.datasets)).catch((e) => setErr(e.message))
  }, [])

  useEffect(() => {
    if (!slug) return
    setFiles(null); setPick(null)
    api<{ files: CatalogFile[] }>(`/api/workspace/catalog?dataset=${encodeURIComponent(slug)}`)
      .then((d) => setFiles(d.files)).catch((e) => setErr(e.message))
  }, [slug])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (files ?? []).filter((f) => !needle || f.country.toLowerCase().includes(needle) || f.country_iso3.toLowerCase() === needle)
  }, [files, q])

  async function add(file: CatalogFile | null = pick) {
    if (!slug || !file || busy) return
    setBusy(true); setErr('')
    try { await onAdd(slug, file); onClose() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not add the layer') }
    finally { setBusy(false) }
  }

  return (
    <Dialog title="Add data" onClose={onClose} buttons={<>
      {err && <span className="ws-err small" style={{ marginRight: 'auto' }}>{err}</span>}
      <button className="ws-btn" onClick={onClose}>Cancel</button>
      <button className="ws-btn ws-btn-default" disabled={!pick || busy} onClick={() => void add()}>{busy ? 'Adding…' : 'Add to map'}</button>
    </>}>
      <p className="muted" style={{ margin: '0 0 8px' }}>
        Pick a dataset, then a country. The layer is added for the whole team and recorded in the project history.
      </p>
      <div className="ws-pick">
        <div>
          {!datasets ? <div className="ws-empty">Loading catalogue…</div> : datasets.map((d) => (
            <button key={d.id} className={slug === d.id ? 'on' : ''} onClick={() => setSlug(d.id)}>
              <span>{d.name}</span><span className="kind">{d.raster ? 'raster' : 'vector'}</span>
            </button>
          ))}
        </div>
        <div>
          {!slug ? <div className="ws-empty">← Choose a dataset</div> : (
            <>
              <div style={{ padding: 5, borderBottom: '1px solid var(--rule)', position: 'sticky', top: 0, background: 'var(--white)' }}>
                <input className="ws-input" style={{ width: '100%' }} placeholder="Filter by country or ISO code" value={q}
                       onChange={(e) => setQ(e.target.value)} autoFocus />
              </div>
              {!files ? <div className="ws-empty">Loading files…</div> : shown.length === 0 ? <div className="ws-empty">No match.</div> :
                shown.map((f) => (
                  <button key={f.r2_key} className={pick?.r2_key === f.r2_key ? 'on' : ''}
                          onClick={() => setPick(f)} onDoubleClick={() => { setPick(f); void add(f) }}>
                    <span>{f.country}{f.variant && <span className="muted"> · {f.variant}</span>}</span>
                    <span className="mono muted">{f.file_size_mb ? `${f.file_size_mb.toFixed(1)} MB` : ''}</span>
                  </button>
                ))}
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}

// ── Layer properties ────────────────────────────────────────────────────────

const SWATCHES = ['#4d4d4d', '#2f6fae', '#3f7fb8', '#2e7d4f', '#6d7f3a', '#9a5b2c', '#b03a2e', '#7a5c99', '#c9a227', '#111111']
const RAMP_NAMES: Record<RasterRamp, string> = {
  terrain: 'Terrain (hypsometric)', rainfall: 'Dry → wet', heat: 'Cool → hot', categorical: 'Classes (categorical)',
}

export function LayerPropertiesDialog({ layer, isRaster, onClose, onSave }: {
  layer: WsLayer; isRaster: boolean; onClose: () => void
  onSave: (patch: { label: string; style: LayerStyle }) => Promise<void>
}) {
  const [label, setLabel] = useState(layer.label)
  const [style, setStyle] = useState<LayerStyle>(layer.style)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof LayerStyle>(k: K, v: LayerStyle[K]) => setStyle((s) => ({ ...s, [k]: v }))

  async function save() {
    setBusy(true); setErr('')
    try { await onSave({ label: label.trim() || layer.label, style }); onClose() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy(false) }
  }

  return (
    <Dialog title="Layer properties" onClose={onClose} buttons={<>
      {err && <span className="ws-err small" style={{ marginRight: 'auto' }}>{err}</span>}
      <button className="ws-btn" onClick={onClose}>Cancel</button>
      <button className="ws-btn ws-btn-default" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Apply'}</button>
    </>}>
      <div className="ws-field">
        <label className="ws-label" htmlFor="lp-name">Name in the legend</label>
        <input id="lp-name" className="ws-input" style={{ width: '100%' }} value={label} maxLength={160} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {!isRaster && (
            <tr>
              <td className="ws-label" style={{ width: 110, paddingTop: 4, verticalAlign: 'top' }}>Colour</td>
              <td style={{ paddingBottom: 8 }}>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                  {SWATCHES.map((c) => (
                    <button key={c} title={c} onClick={() => set('color', c)}
                            style={{ width: 18, height: 18, background: c, cursor: 'pointer',
                              border: style.color === c ? '2px solid #111' : '1px solid rgba(0,0,0,.4)', outline: style.color === c ? '1px solid #fff' : 'none', outlineOffset: -3 }} />
                  ))}
                  <input type="color" value={style.color} onChange={(e) => set('color', e.target.value)} title="Other colour"
                         style={{ width: 26, height: 20, padding: 0, border: '1px solid var(--rule-strong)', background: 'none' }} />
                  <span className="mono muted">{style.color}</span>
                </div>
              </td>
            </tr>
          )}
          <tr>
            <td className="ws-label" style={{ paddingTop: 2 }}>Opacity</td>
            <td style={{ paddingBottom: 8 }}>
              <input type="range" min={0} max={100} value={Math.round(style.opacity * 100)}
                     onChange={(e) => set('opacity', Number(e.target.value) / 100)} style={{ width: 200, verticalAlign: 'middle' }} />
              <span className="mono" style={{ marginLeft: 6 }}>{Math.round(style.opacity * 100)}%</span>
            </td>
          </tr>
          {!isRaster && (
            <>
              <tr>
                <td className="ws-label" style={{ paddingTop: 2 }}>Line width</td>
                <td style={{ paddingBottom: 8 }}>
                  <input type="range" min={0.25} max={6} step={0.25} value={style.width}
                         onChange={(e) => set('width', Number(e.target.value))} style={{ width: 200, verticalAlign: 'middle' }} />
                  <span className="mono" style={{ marginLeft: 6 }}>{style.width.toFixed(2)} px</span>
                </td>
              </tr>
              <tr>
                <td className="ws-label">Polygons</td>
                <td style={{ paddingBottom: 4 }}>
                  <label className="ws-check"><input type="checkbox" checked={style.fill} onChange={(e) => set('fill', e.target.checked)} /> Fill as well as outline</label>
                </td>
              </tr>
            </>
          )}
          {isRaster && (
            <tr>
              <td className="ws-label" style={{ paddingTop: 4 }}>Colour ramp</td>
              <td>
                <select className="ws-select" value={style.ramp} onChange={(e) => set('ramp', e.target.value as RasterRamp)}>
                  {(Object.keys(RAMP_NAMES) as RasterRamp[]).map((r) => <option key={r} value={r}>{RAMP_NAMES[r]}</option>)}
                </select>
                <div style={{ marginTop: 5, height: 10, width: 200, border: '1px solid rgba(0,0,0,.4)', background: rampCss(style.ramp) }} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <hr />
      <p className="muted small" style={{ margin: 0 }}>
        Source: <span className="mono">{layer.r2_key.split('/').pop()}</span> · {layer.file_format || 'file'} · added by {layer.added_by_name ?? 'a teammate'}
      </p>
    </Dialog>
  )
}

// ── Confirm ─────────────────────────────────────────────────────────────────

export function ConfirmDialog({ title, body, confirmLabel, danger, onClose, onConfirm }: {
  title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean
  onClose: () => void; onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <Dialog title={title} onClose={onClose} buttons={<>
      {err && <span className="ws-err small" style={{ marginRight: 'auto' }}>{err}</span>}
      <button className="ws-btn" onClick={onClose}>Cancel</button>
      <button className={`ws-btn ws-btn-default${danger ? ' ws-btn-danger' : ''}`} disabled={busy}
              onClick={async () => {
                setBusy(true); setErr('')
                try { await onConfirm(); onClose() } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
              }}>{busy ? 'Working…' : confirmLabel}</button>
    </>}>
      <div style={{ lineHeight: 1.6 }}>{body}</div>
    </Dialog>
  )
}
