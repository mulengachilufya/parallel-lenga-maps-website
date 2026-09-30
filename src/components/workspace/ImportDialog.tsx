'use client'

/**
 * Import from desktop GIS: drop a QGIS project (.qgz/.qgs with its data, or
 * the whole project folder zipped), or loose GIS files. Everything is read
 * in the browser first, so the list shows exactly what will land on the map
 * before anything is uploaded. Files go straight from the browser to the
 * team's private folder in R2, on links the API signs for each file's size.
 */

import { useEffect, useState } from 'react'
import { primeCache } from '@/lib/workspace/loaders'
import { prepareImport, type PreparedImport } from '@/lib/workspace/transfer'
import { MAX_UPLOAD_BYTES, PROJECT_QUOTA_BYTES, WHOLE_FILE_MAX, formatBytes } from '@/lib/workspace/upload-limits'

/** PUT a file to a presigned URL, reporting progress (fetch cannot). */
function put(url: string, body: Blob, onProgress: (sent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload refused (${xhr.status})`)))
    xhr.onerror = () => reject(new Error('the connection dropped'))
    xhr.send(body)
  })
}

interface Props {
  projectId: string
  onClose:   () => void
  onImported: (uploads: { path: string; label: string; file_format: string; style: object }[], hiddenLabels: string[]) => Promise<void>
}

interface Usage { used: number; limit: number }

const ACCEPT = '.qgz,.qgs,.zip,.shp,.shx,.dbf,.prj,.cpg,.gpkg,.geojson,.json,.kml,.kmz,.gpx,.tif,.tiff'

export default function ImportDialog({ projectId, onClose, onImported }: Props) {
  const [prep, setPrep] = useState<PreparedImport | null>(null)
  const [keep, setKeep] = useState<Set<number>>(new Set())
  const [reading, setReading] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [err, setErr] = useState('')
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    fetch(`/api/workspace/projects/${projectId}/uploads`).then((r) => (r.ok ? r.json() : null))
      .then((d: Usage | null) => d && setUsage({ used: d.used, limit: d.limit })).catch(() => {})
  }, [projectId])

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
      const total = chosen.reduce((n, u) => n + u.bytes.byteLength, 0)
      const res = await fetch(`/api/workspace/projects/${projectId}/uploads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: chosen.map((u) => ({ name: u.filename, size: u.bytes.byteLength })) }),
      })
      const signed = await res.json().catch(() => ({})) as { uploads?: { key: string; url: string }[]; used?: number; limit?: number; error?: string }
      if (!res.ok || !signed.uploads) {
        if (signed.error === 'project_full') {
          throw new Error(`This project has ${formatBytes(Math.max(0, (signed.limit ?? PROJECT_QUOTA_BYTES) - (signed.used ?? 0)))} of its ${formatBytes(signed.limit ?? PROJECT_QUOTA_BYTES)} left; these files need ${formatBytes(total)}. Remove a layer you uploaded, or upload fewer files.`)
        }
        if (signed.error === 'file_too_large') throw new Error(`Each file can be up to ${formatBytes(MAX_UPLOAD_BYTES)}.`)
        if (res.status === 403) throw new Error('Viewers cannot add files to this project.')
        throw new Error('Could not start the upload. Try again.')
      }

      const registered: { path: string; label: string; file_format: string; style: object }[] = []
      let done = 0
      for (let i = 0; i < chosen.length; i++) {
        const u = chosen[i], { key, url } = signed.uploads[i]
        const label = `Uploading ${i + 1} of ${chosen.length}: ${u.filename}`
        setStatus(label)
        try {
          await put(url, new Blob([u.bytes.buffer.slice(u.bytes.byteOffset, u.bytes.byteOffset + u.bytes.byteLength) as ArrayBuffer]), (sent) =>
            setStatus(`${label} · ${Math.min(100, Math.round(((done + sent) / total) * 100))}%`))
        } catch (e) {
          throw new Error(`${u.filename}: ${e instanceof Error ? e.message : 'upload failed'}`)
        }
        done += u.bytes.byteLength
        // Files the browser opens whole are cached now, so they show at once.
        if (u.bytes.byteLength <= WHOLE_FILE_MAX) {
          void primeCache(key, u.bytes.buffer.slice(u.bytes.byteOffset, u.bytes.byteOffset + u.bytes.byteLength) as ArrayBuffer)
        }
        registered.push({ path: key, label: u.label, file_format: u.file_format, style: u.style })
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
              Also GeoJSON, GPX and KMZ. Up to {formatBytes(MAX_UPLOAD_BYTES)} per file and {formatBytes(PROJECT_QUOTA_BYTES)} per project;
              rasters over {formatBytes(WHOLE_FILE_MAX)} must be Cloud Optimized GeoTIFFs in EPSG:4326 so the map can stream them.
            </span><br />
            <span className="small" style={{ color: 'var(--brass)' }}>Your files stay private to your team, tagged Yours, and never mix with the Lenga database.</span>
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
        {usage && (
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            Project storage: {formatBytes(usage.used)} of {formatBytes(usage.limit)} used
            {prep && keep.size > 0 && <> · this import {formatBytes(prep.uploads.filter((_, i) => keep.has(i)).reduce((n, u) => n + u.bytes.byteLength, 0))}</>}
          </p>
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
