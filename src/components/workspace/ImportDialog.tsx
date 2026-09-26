'use client'

/**
 * Import from desktop GIS: drop a QGIS project (.qgz/.qgs with its data, or
 * the whole project folder zipped), or loose GIS files. Everything is read
 * in the browser first, so the list shows exactly what will land on the map
 * before anything is uploaded.
 */

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { primeCache } from '@/lib/workspace/loaders'
import { prepareImport, type PreparedImport } from '@/lib/workspace/transfer'

interface Props {
  orgId:     string
  projectId: string
  onClose:   () => void
  onImported: (uploads: { path: string; label: string; file_format: string; style: object }[], hiddenLabels: string[]) => Promise<void>
}

const ACCEPT = '.qgz,.qgs,.zip,.shp,.shx,.dbf,.prj,.cpg,.gpkg,.geojson,.json,.kml,.kmz,.gpx,.tif,.tiff'

export default function ImportDialog({ orgId, projectId, onClose, onImported }: Props) {
  const [prep, setPrep] = useState<PreparedImport | null>(null)
  const [keep, setKeep] = useState<Set<number>>(new Set())
  const [reading, setReading] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [err, setErr] = useState('')

  async function read(list: FileList | File[]) {
    const files = [...list]
    if (!files.length) return
    setReading(true); setErr(''); setPrep(null)
    try {
      const p = await prepareImport(files)
      setPrep(p)
      setKeep(new Set(p.uploads.map((_, i) => i)))
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read those files') }
    finally { setReading(false) }
  }

  async function run() {
    if (!prep) return
    const chosen = prep.uploads.filter((_, i) => keep.has(i))
    if (!chosen.length) return
    setBusy(true); setErr('')
    try {
      const registered: { path: string; label: string; file_format: string; style: object }[] = []
      for (let i = 0; i < chosen.length; i++) {
        const u = chosen[i]
        setStatus(`Uploading ${i + 1} of ${chosen.length}: ${u.filename}`)
        const path = `${orgId}/${projectId}/${crypto.randomUUID().slice(0, 8)}-${u.filename}`
        const { error } = await supabase.storage.from('workspace-uploads').upload(path, new Blob([u.bytes.buffer as ArrayBuffer]), {
          contentType: 'application/octet-stream', upsert: false,
        })
        if (error) throw new Error(`${u.filename}: ${error.message}`)
        void primeCache(`upload:${path}`, u.bytes.buffer.slice(u.bytes.byteOffset, u.bytes.byteOffset + u.bytes.byteLength) as ArrayBuffer)
        registered.push({ path, label: u.label, file_format: u.file_format, style: u.style })
      }
      setStatus('Adding layers to the project…')
      await onImported(registered, chosen.filter((u) => !u.visible).map((u) => u.label))
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed')
      setStatus('')
    } finally { setBusy(false) }
  }

  return (
    <div className="ws-float" role="dialog" aria-label="Import from QGIS or ArcGIS">
      <div className="ws-panel-head">Import from QGIS / ArcGIS<span className="spacer" />
        <button className="ws-icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="content">
        <label
          className={`ws-drop${over ? ' over' : ''}`} style={{ display: 'block', cursor: 'pointer' }}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files) }}
        >
          <input type="file" multiple accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => e.target.files && void read(e.target.files)} />
          {reading ? 'Reading files…' : <>
            <b>Drop files here</b> or click to choose.<br />
            <span className="muted small">
              QGIS: the <span className="mono">.qgz</span> plus its data, or the project folder zipped.
              ArcGIS Pro: export layers as shapefile, GeoPackage, KML or GeoTIFF.
              Also GeoJSON, GPX and KMZ. Up to 50 MB per file.
            </span>
          </>}
        </label>

        {prep && (
          <>
            {prep.projectTitle && <p style={{ margin: '8px 0 0' }}>QGIS project <b>{prep.projectTitle}</b>: layers keep their names, order, visibility and colours.</p>}
            {prep.uploads.length > 0 && (
              <ul className="ws-import-list">
                {prep.uploads.map((u, i) => (
                  <li key={i}>
                    <input type="checkbox" checked={keep.has(i)} onChange={() => setKeep((k) => { const n = new Set(k); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
                    <span className="grow" title={u.filename}>{u.label}{!u.visible && <span className="muted small"> (hidden in QGIS)</span>}</span>
                    <span className="small muted">{u.file_format} · {u.summary}</span>
                    <span className="mono small muted">{(u.bytes.byteLength / 1048576).toFixed(1)} MB</span>
                  </li>
                ))}
              </ul>
            )}
            {prep.skipped.length > 0 && (
              <div className="ws-note small" style={{ marginTop: 8 }}>
                <b>Not imported</b>
                <ul style={{ margin: '3px 0 0 16px', padding: 0 }}>
                  {prep.skipped.map((s, i) => <li key={i}>{s.name}: {s.reason}</li>)}
                </ul>
                {prep.projectTitle && <div style={{ marginTop: 4 }}>
                  Tip: in QGIS, <i>Processing › Package layers</i> writes every layer into one GeoPackage. Upload it with the <span className="mono">.qgz</span>.
                </div>}
              </div>
            )}
          </>
        )}
        {status && <p className="small" style={{ margin: '8px 0 0' }}>{status}</p>}
      </div>
      <div className="buttons">
        {err && <span className="ws-err small" style={{ marginRight: 'auto' }}>{err}</span>}
        <button className="ws-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="ws-btn ws-btn-default" disabled={!prep || !keep.size || busy} onClick={() => void run()}>
          {busy ? 'Importing…' : `Import ${keep.size || ''} layer${keep.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
