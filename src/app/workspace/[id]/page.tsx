'use client'

/**
 * /workspace/:id — the team workstation
 *
 *   ┌ title bar: org / project, who is here ───────────────────────────────┐
 *   ├ toolbar: data, basemap, views, panels ───────────────────────────────┤
 *   │ layers +   │                 map                  │ discussion /     │
 *   │ saved views│                                      │ history / details│
 *   └ status bar: coordinates, zoom, scale, CRS, last revision ────────────┘
 *
 * Shared state (layers, styles, order, saved views, project view) lives in
 * the database and every change is a revision. Layer visibility and the
 * basemap are personal and stay in this browser.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import MapView, { type LayerStatus, type MapViewHandle, type ViewInfo } from '@/components/workspace/MapView'
import LayerPanel from '@/components/workspace/LayerPanel'
import DiscussionPanel from '@/components/workspace/DiscussionPanel'
import HistoryPanel from '@/components/workspace/HistoryPanel'
import DetailsPanel from '@/components/workspace/DetailsPanel'
import { ConfirmDialog, LayerPropertiesDialog } from '@/components/workspace/Dialogs'
import AddData from '@/components/workspace/AddData'
import ImportDialog from '@/components/workspace/ImportDialog'
import { PREVIEW_PREFIX } from '@/lib/workspace/loaders'
import { api, initials, tileColor } from '@/components/workspace/util'
import TitleBar from '@/components/workspace/TitleBar'
import { rampCss, categoryColor } from '@/lib/workspace/raster'
import {
  defaultStyle, shortRev, type Basemap, type CatalogFile, type WsPlace, type LayerStyle, type WsBookmark, type WsLayer,
  type WsMessage, type WsProjectBundle, type WsRevision, type WsSnapshot,
} from '@/lib/workspace/types'

type Tab = 'discussion' | 'history' | 'details'
type Dialog =
  | { kind: 'edit'; layerId: string }
  | { kind: 'remove'; layer: WsLayer }
  | { kind: 'restore'; rev: WsRevision }
  | { kind: 'archive' }
  | null

const BASEMAPS: { id: Basemap; label: string }[] = [
  { id: 'light', label: 'Light (OpenFreeMap)' },
  { id: 'topo', label: 'Topographic (OpenTopoMap)' },
  { id: 'imagery', label: 'Imagery (Sentinel-2 2016)' },
  { id: 'none', label: 'None (paper)' },
]

function Workstation() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const mapRef = useRef<MapViewHandle>(null)

  const [bundle, setBundle] = useState<WsProjectBundle | null>(null)
  const [fatal, setFatal] = useState<'no_team' | 'not_found' | 'error' | null>(null)
  const [messages, setMessages] = useState<WsMessage[]>([])
  const [revisions, setRevisions] = useState<WsRevision[] | null>(null)
  const [statuses, setStatuses] = useState<Record<string, LayerStatus>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [basemap, setBasemap] = useState<Basemap>('light')
  const [view, setView] = useState<ViewInfo | null>(null)
  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null)
  const [tab, setTab] = useState<Tab>((search.get('tab') as Tab) || 'discussion')
  const [showLeft, setShowLeft] = useState(true)
  const [showRight, setShowRight] = useState(true)
  const [pickMode, setPickMode] = useState<'pin' | 'place' | null>(null)
  const picking = pickMode !== null
  const [floating, setFloating] = useState<'add' | 'import' | null>(null)
  const [places, setPlaces] = useState<WsPlace[]>([])
  const [previewFiles, setPreviewFiles] = useState<CatalogFile[]>([])
  const [exporting, setExporting] = useState('')
  const [draftPin, setDraftPin] = useState<{ lng: number; lat: number } | null>(null)
  const [focusMsg, setFocusMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ seq: number; snapshot: WsSnapshot } | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  // ── Loading ──────────────────────────────────────────────────────────────
  const loadBundle = useCallback(async () => {
    const res = await fetch(`/api/workspace/projects/${id}`)
    if (res.status === 401) { router.replace(`/login?next=${encodeURIComponent(`/workspace/${id}`)}`); return }
    if (res.status === 403) { setFatal('no_team'); return }
    if (res.status === 404) { setFatal('not_found'); return }
    if (!res.ok) { setFatal('error'); return }
    const b = await res.json() as WsProjectBundle
    setBundle((prev) => {
      if (!prev) setBasemap(b.project.map_state.basemap)
      return b
    })
  }, [id, router])

  const loadRevisions = useCallback(async () => {
    try { setRevisions((await api<{ revisions: WsRevision[] }>(`/api/workspace/projects/${id}/revisions`)).revisions) } catch { /* shown as loading */ }
  }, [id])

  const loadMessages = useCallback(async () => {
    try { setMessages((await api<{ messages: WsMessage[] }>(`/api/workspace/projects/${id}/messages`)).messages) } catch { /* empty */ }
  }, [id])

  useEffect(() => { void loadBundle(); void loadRevisions(); void loadMessages() }, [loadBundle, loadRevisions, loadMessages])

  // Small screens open with the map alone; the toolbar toggles the panels.
  useEffect(() => { if (window.innerWidth < 900) { setShowLeft(false); setShowRight(false) } }, [])

  // Debounced refresh after our own writes and after teammates' (Realtime).
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => { void loadBundle(); void loadRevisions() }, 250)
  }, [loadBundle, loadRevisions])

  // Personal layer visibility, remembered per project in this browser.
  useEffect(() => {
    try { setHidden(new Set(JSON.parse(localStorage.getItem(`ws-hidden-${id}`) ?? '[]'))) } catch { /* ignore */ }
  }, [id])
  const toggleHidden = (layerId: string) => setHidden((h) => {
    const next = new Set(h)
    if (next.has(layerId)) next.delete(layerId); else next.add(layerId)
    try { localStorage.setItem(`ws-hidden-${id}`, JSON.stringify([...next])) } catch { /* ignore */ }
    return next
  })

  // ── Realtime: revisions (state changes), messages, presence ──────────────
  const me = bundle?.me
  useEffect(() => {
    if (!me) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) supabase.realtime.setAuth(session.access_token)
      if (cancelled) return
      channel = supabase.channel(`ws-project-${id}`, { config: { presence: { key: me.user_id } } })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_revisions', filter: `project_id=eq.${id}` },
          () => refresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_messages', filter: `project_id=eq.${id}` },
          (payload) => {
            const m = payload.new as WsMessage
            if (!m?.id) return
            setMessages((list) => {
              const i = list.findIndex((x) => x.id === m.id)
              if (i === -1) return [...list, m]
              const next = list.slice(); next[i] = m; return next
            })
          })
        .on('presence', { event: 'sync' }, () => {
          if (channel) setOnline(new Set(Object.keys(channel.presenceState())))
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void channel?.track({ name: me.name, at: new Date().toISOString() })
        })
    })()
    return () => { cancelled = true; if (channel) void supabase.removeChannel(channel) }
  }, [id, me, refresh])

  // ── Derived ──────────────────────────────────────────────────────────────
  const liveLayers = useMemo(() => [...(bundle?.layers ?? [])].sort((a, b) => a.sort_order - b.sort_order), [bundle?.layers])
  const shownLayers: WsLayer[] = useMemo(() => {
    if (!preview) return liveLayers
    return preview.snapshot.layers.map((l) => ({ ...l, project_id: id }))
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [preview, liveLayers, id])
  const tocLayers = useMemo(() => [...shownLayers].reverse(), [shownLayers])
  const previewLayers: WsLayer[] = useMemo(() => previewFiles.map((f, i) => ({
    id: `${PREVIEW_PREFIX}${i}-${f.r2_key.replace(/[^A-Za-z0-9]/g, '').slice(-24)}`,
    project_id: id, dataset_slug: f.dataset_slug, country: f.country, r2_key: f.r2_key, file_format: f.file_format,
    label: `Preview: ${f.country}${f.variant ? ` · ${f.variant}` : ''}`,
    style: { ...defaultStyle(f.dataset_slug), opacity: 0.75 }, sort_order: 10_000 + i,
    added_by: null, added_by_name: null, created_at: '',
  })), [previewFiles, id])
  const mapLayers = useMemo(() => [...shownLayers, ...previewLayers], [shownLayers, previewLayers])
  const previewKeys = useMemo(() => new Set(previewFiles.map((f) => `${f.dataset_slug}|${f.r2_key}`)), [previewFiles])
  const bookmarks: WsBookmark[] = preview
    ? preview.snapshot.bookmarks.map((b) => ({ ...b, project_id: id }))
    : bundle?.bookmarks ?? []

  const pins = useMemo(() => messages.filter((m) => !m.parent_id && !m.deleted_at && m.lng !== null && m.lat !== null), [messages])
  const pinNumbers = useMemo(() => new Map(pins.map((m, i) => [m.id, i + 1])), [pins])
  const selectedLayer = shownLayers.find((l) => l.id === selected) ?? null
  const selectedStatus = selected ? statuses[selected] : undefined

  const onStatus = useCallback((layerId: string, st: LayerStatus) => setStatuses((s) => ({ ...s, [layerId]: st })), [])

  // Fly to a new preview once its data has loaded.
  const zoomedPreview = useRef('')
  useEffect(() => {
    const first = previewLayers.find((l) => statuses[l.id]?.state === 'ready')
    if (first && zoomedPreview.current !== first.id) { zoomedPreview.current = first.id; mapRef.current?.zoomToLayer(first.id) }
    if (!previewLayers.length) zoomedPreview.current = ''
  }, [previewLayers, statuses])
  const onPick = useCallback((lng: number, lat: number) => {
    if (pickMode === 'pin') { setDraftPin({ lng, lat }); setPickMode(null); return }
    // Place mode stays on so several places can be clicked in a row.
    api<{ place: WsPlace | null }>(`/api/workspace/geocode?lat=${lat}&lng=${lng}`)
      .then(({ place }) => {
        if (!place) { setNote('That point is outside the African countries Lenga covers.'); return }
        setPlaces((ps) => ps.some((x) => x.name === place.name && x.iso3 === place.iso3) ? ps : [...ps, place])
      })
      .catch(() => setNote('Could not look up that place. Try the search box instead.'))
  }, [pickMode])
  const onPinClick = useCallback((msgId: string) => {
    setShowRight(true); setTab('discussion'); setFocusMsg(null)
    requestAnimationFrame(() => setFocusMsg(msgId))
  }, [])

  // ── Mutations ────────────────────────────────────────────────────────────
  const readOnly = !!preview
  const say = (t: string) => { setNote(t); setTimeout(() => setNote((n) => (n === t ? '' : n)), 6000) }
  const revNote = (r?: { seq: number; summary: string } | null) => { if (r) say(`r${r.seq}: ${r.summary}`) }

  async function addLayers(files: CatalogFile[]) {
    const d = await api<{ layers: WsLayer[]; rev: WsRevision }>(`/api/workspace/projects/${id}/layers`,
      { method: 'POST', json: { items: files.map((f) => ({ dataset_slug: f.dataset_slug, r2_key: f.r2_key })) } })
    const added = new Set(files.map((f) => `${f.dataset_slug}|${f.r2_key}`))
    setPreviewFiles((pf) => pf.filter((f) => !added.has(`${f.dataset_slug}|${f.r2_key}`)))
    setSelected(d.layers[0]?.id ?? null); revNote(d.rev); refresh()
  }

  async function importUploads(uploads: { path: string; label: string; file_format: string; style: object }[], hiddenLabels: string[]) {
    const d = await api<{ layers: WsLayer[]; rev: WsRevision }>(`/api/workspace/projects/${id}/layers`,
      { method: 'POST', json: { uploads } })
    // Layers that were switched off in QGIS start switched off here too (for you).
    const off = d.layers.filter((l) => hiddenLabels.includes(l.label)).map((l) => l.id)
    if (off.length) setHidden((h) => {
      const next = new Set([...h, ...off])
      try { localStorage.setItem(`ws-hidden-${id}`, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
    revNote(d.rev); refresh()
    setTimeout(() => d.layers[0] && mapRef.current?.zoomToLayer(d.layers[d.layers.length - 1].id), 1500)
  }

  async function exportDesktop() {
    if (!bundle || exporting) return
    setExporting('Preparing…')
    try {
      const { buildDesktopPackage } = await import('@/lib/workspace/transfer')
      const loaded = Object.fromEntries(Object.entries(statuses).map(([k, v]) => [k, v.loaded]))
      const bounds = mapRef.current?.getBounds() ?? [-20, -36, 55, 38]
      const { blob, filename, skipped } = await buildDesktopPackage({
        projectId: id, title: bundle.project.name, layers: tocLayers, hidden, loaded, extent: bounds,
        onProgress: (n, t) => setExporting(`Packaging ${n} of ${t}…`),
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
      say(skipped.length ? `Exported ${filename}; ${skipped.length} layer(s) could not be packaged.` : `Exported ${filename}. Unzip and open the .qgs in QGIS.`)
    } catch (e) { say(e instanceof Error ? e.message : 'Export failed') }
    finally { setExporting('') }
  }

  async function moveLayer(layerId: string, dir: -1 | 1) {
    const order = tocLayers.map((l) => l.id)
    const i = order.indexOf(layerId), j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    setBundle((b) => b && ({ ...b, layers: b.layers.map((l) => ({ ...l, sort_order: order.length - 1 - order.indexOf(l.id) })) }))
    try { revNote((await api<{ rev: WsRevision }>(`/api/workspace/projects/${id}/layers`, { method: 'PUT', json: { order } })).rev) }
    catch (e) { say(e instanceof Error ? e.message : 'Could not reorder') }
    refresh()
  }

  async function saveLayer(layerId: string, patch: { label: string; style: LayerStyle }) {
    const d = await api<{ rev?: WsRevision }>(`/api/workspace/projects/${id}/layers/${layerId}`, { method: 'PATCH', json: patch })
    revNote(d.rev); refresh()
  }

  async function removeLayer(layer: WsLayer) {
    const d = await api<{ rev: WsRevision }>(`/api/workspace/projects/${id}/layers/${layer.id}`, { method: 'DELETE' })
    if (selected === layer.id) setSelected(null)
    revNote(d.rev); refresh()
  }

  async function saveView(name: string) {
    const v = mapRef.current?.getView()
    if (!v) return
    try {
      const d = await api<{ rev: WsRevision }>(`/api/workspace/projects/${id}/bookmarks`,
        { method: 'POST', json: { name, lng: v.lng, lat: v.lat, zoom: v.zoom } })
      revNote(d.rev); refresh()
    } catch (e) { say(e instanceof Error ? e.message : 'Could not save the view') }
  }

  async function dropView(b: WsBookmark) {
    if (!confirm(`Delete the saved view "${b.name}"?`)) return
    try { revNote((await api<{ rev: WsRevision }>(`/api/workspace/projects/${id}/bookmarks/${b.id}`, { method: 'DELETE' })).rev); refresh() }
    catch (e) { say(e instanceof Error ? e.message : 'Could not delete') }
  }

  async function setProjectView() {
    const v = mapRef.current?.getView()
    if (!v) return
    try {
      const d = await api<{ rev?: WsRevision }>(`/api/workspace/projects/${id}`,
        { method: 'PATCH', json: { map_state: { center: [v.lng, v.lat], zoom: v.zoom, basemap } } })
      revNote(d.rev); refresh()
    } catch (e) { say(e instanceof Error ? e.message : 'Could not save') }
  }

  async function saveDetails(patch: { name: string; description: string }) {
    const d = await api<{ rev?: WsRevision }>(`/api/workspace/projects/${id}`, { method: 'PATCH', json: patch })
    revNote(d.rev); refresh()
  }

  async function sendMessage(body: string, mentions: string[], parentId: string | null) {
    const pin = !parentId && draftPin ? draftPin : null
    const d = await api<{ message: WsMessage }>(`/api/workspace/projects/${id}/messages`,
      { method: 'POST', json: { body, mentions, parent_id: parentId, lng: pin?.lng, lat: pin?.lat } })
    setMessages((list) => list.some((m) => m.id === d.message.id) ? list : [...list, d.message])
    if (pin) setDraftPin(null)
  }

  async function editMessage(msgId: string, body: string) {
    const d = await api<{ message: WsMessage }>(`/api/workspace/projects/${id}/messages/${msgId}`, { method: 'PATCH', json: { body } })
    setMessages((list) => list.map((m) => (m.id === msgId ? d.message : m)))
  }

  async function deleteMessage(msgId: string) {
    await api(`/api/workspace/projects/${id}/messages/${msgId}`, { method: 'DELETE' })
    setMessages((list) => list.map((m) => (m.id === msgId ? { ...m, deleted_at: new Date().toISOString(), body: '(deleted)' } : m)))
  }

  async function restore(rev: WsRevision) {
    const d = await api<{ rev: WsRevision }>(`/api/workspace/projects/${id}/revisions/${rev.seq}`, { method: 'POST' })
    setPreview(null); revNote(d.rev); refresh()
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (fatal) {
    return (
      <div className="ws ws-page">
        <TitleBar crumbs={[{ label: 'Workspace', href: '/workspace' }]} />
        <div className="ws-page-body">
          <h1>{fatal === 'no_team' ? 'The workspace is for team accounts' : fatal === 'not_found' ? 'Project not found' : 'Something went wrong'}</h1>
          <p className="ws-lede">
            {fatal === 'no_team'
              ? <>Shared projects, the live map, discussion and history come with a team plan. <Link href="/projects">See team plans</Link>, or ask your team owner for an invite.</>
              : fatal === 'not_found'
                ? <>It may have been archived, or it belongs to another organisation. <Link href="/workspace">Back to your projects</Link>.</>
                : <>Please reload the page. If it keeps happening, email lengamaps@gmail.com.</>}
          </p>
        </div>
      </div>
    )
  }

  if (!bundle) {
    return (
      <div className="ws ws-page">
        <TitleBar crumbs={[{ label: 'Workspace', href: '/workspace' }, { label: 'Opening project…' }]} />
        <div className="ws-page-body"><p className="muted">Opening project…</p></div>
      </div>
    )
  }

  const head = revisions?.[0]
  const frame = [
    'ws-app',
    showLeft ? 'show-left' : 'no-left',
    showRight ? 'show-right' : 'no-right',
  ].join(' ')

  return (
    <div className={`ws ${frame}`}>
      <TitleBar
        crumbs={[{ label: bundle.org.name, href: '/workspace' }, { label: bundle.project.name }]}
        right={
          <div className="ws-presence" title="Who is looking at this project now">
            {bundle.members.filter((m) => online.has(m.user_id)).map((m) => (
              <span key={m.user_id} className="ws-avatar" style={{ background: tileColor(m.user_id) }} title={`${m.name} is here`}>{initials(m.name)}</span>
            ))}
            <span className="small" style={{ color: '#9fb0c2', marginLeft: 4 }}>{online.size || 1} here</span>
          </div>
        }
      />

      <div className="ws-toolbar">
        <div className="group">
          <button className={`ws-btn${showLeft ? ' is-on' : ''}`} onClick={() => setShowLeft((v) => !v)}>Layers</button>
          <button className={`ws-btn${floating === 'add' ? ' is-on' : ''}`} onClick={() => setFloating(floating === 'add' ? null : 'add')} disabled={readOnly}>Add data…</button>
        </div>
        <div className="group">
          <button className={`ws-btn${floating === 'import' ? ' is-on' : ''}`} disabled={readOnly} title="Bring in a QGIS project or files exported from ArcGIS"
                  onClick={() => setFloating(floating === 'import' ? null : 'import')}>Import…</button>
          <button className="ws-btn" disabled={!!exporting || tocLayers.length === 0} title="Download a QGIS project with all layers and data, ready for QGIS or ArcGIS Pro"
                  onClick={() => void exportDesktop()}>{exporting || 'Export to QGIS / ArcGIS'}</button>
        </div>
        <div className="group">
          <label className="small muted" htmlFor="bm">Basemap</label>
          <select id="bm" className="ws-select" value={basemap} onChange={(e) => setBasemap(e.target.value as Basemap)}>
            {BASEMAPS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
        <div className="group hide-sm">
          <button className="ws-btn" title="Fly to the project's saved view"
                  onClick={() => { const s = bundle.project.map_state; mapRef.current?.flyTo(s.center[0], s.center[1], s.zoom) }}>Project view</button>
          <button className="ws-btn" disabled={readOnly} title="Make the current extent and basemap the view everyone opens to"
                  onClick={setProjectView}>Set as project view</button>
          <button className="ws-btn" onClick={() => mapRef.current?.flyTo(20, 2, 2.6)}>Africa</button>
        </div>
        <span className="grow" />
        <div className="group">
          <button className={`ws-btn${showRight ? ' is-on' : ''}`} onClick={() => setShowRight((v) => !v)}>Panel</button>
        </div>
      </div>

      <aside className="ws-left">
        {showLeft && (
          <LayerPanel
            layers={tocLayers} statuses={statuses} hidden={hidden} selected={selected} bookmarks={bookmarks}
            onSelect={setSelected} onToggle={toggleHidden}
            onMove={(lid, dir) => { if (!readOnly) void moveLayer(lid, dir) }}
            onZoom={(lid) => mapRef.current?.zoomToLayer(lid)}
            onEdit={(lid) => { if (!readOnly) setDialog({ kind: 'edit', layerId: lid }) }}
            onRemove={(lid) => { const l = liveLayers.find((x) => x.id === lid); if (l && !readOnly) setDialog({ kind: 'remove', layer: l }) }}
            onAdd={() => { if (!readOnly) setFloating('add') }}
            onGoto={(b) => mapRef.current?.flyTo(b.lng, b.lat, b.zoom)}
            onSaveView={(n) => { if (!readOnly) void saveView(n) }}
            onDropView={(b) => { if (!readOnly) void dropView(b) }}
          />
        )}
      </aside>

      <div className={`ws-mapwrap${picking ? ' picking' : ''}`}>
        <MapView
          ref={mapRef}
          projectId={id}
          layers={mapLayers}
          hidden={hidden}
          basemap={basemap}
          initial={{ center: bundle.project.map_state.center, zoom: bundle.project.map_state.zoom }}
          pins={pins}
          draftPin={draftPin}
          picking={picking}
          onPick={onPick}
          onPinClick={onPinClick}
          onStatus={onStatus}
          onView={setView}
          onCursor={setCursor}
          onBasemapFailed={() => say('The basemap could not be loaded, so the map is showing plain paper. Your layers are unaffected.')}
        />
        {pickMode === 'pin' && <div className="ws-map-note">Click the place this message is about. <a href="#" onClick={(e) => { e.preventDefault(); setPickMode(null) }}>Cancel</a></div>}
        {pickMode === 'place' && <div className="ws-map-note">Click towns or areas to find their data ({places.length} picked). <a href="#" onClick={(e) => { e.preventDefault(); setPickMode(null) }}>Done</a></div>}
        {preview && (
          <div className="ws-map-note">
            Previewing <b>r{preview.seq}</b> (read-only).{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setPreview(null) }}>Back to latest</a>
            {head && preview.seq !== head.seq && <> · <a href="#" onClick={(e) => {
              e.preventDefault()
              const r = revisions?.find((x) => x.seq === preview.seq)
              if (r) setDialog({ kind: 'restore', rev: r })
            }}>Restore this version</a></>}
          </div>
        )}
        {selectedLayer && selectedStatus?.loaded?.kind === 'raster' && (
          <div className="ws-legend">
            <div className="t">{selectedLayer.label}</div>
            {selectedStatus.loaded.raster.categories && selectedLayer.style.ramp === 'categorical' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px' }}>
                {selectedStatus.loaded.raster.categories.slice(0, 16).map((c, i) => (
                  <span key={c} className="mono small"><span className="ws-swatch" style={{ background: categoryColor(i), verticalAlign: -1 }} /> {c}</span>
                ))}
                {selectedStatus.loaded.raster.categories.length > 16 && <span className="small muted">+{selectedStatus.loaded.raster.categories.length - 16} more</span>}
              </div>
            ) : (
              <>
                <div className="bar" style={{ background: rampCss(selectedLayer.style.ramp) }} />
                <div className="ends"><span>{selectedStatus.loaded.raster.min.toFixed(1)}</span><span>{selectedStatus.loaded.raster.max.toFixed(1)}</span></div>
              </>
            )}
          </div>
        )}
      </div>

      <aside className="ws-right">
        {showRight && (
          <>
            <div className="ws-tabs" role="tablist">
              {(['discussion', 'history', 'details'] as Tab[]).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={`ws-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                  {t === 'discussion' ? 'Discussion' : t === 'history' ? 'History' : 'Details'}
                  {t === 'discussion' && <span className="count">{messages.filter((m) => !m.deleted_at).length}</span>}
                  {t === 'history' && revisions && <span className="count">{revisions.length}</span>}
                </button>
              ))}
            </div>
            {tab === 'discussion' && (
              <DiscussionPanel
                messages={messages} members={bundle.members} me={bundle.me}
                pinNumbers={pinNumbers} focusId={focusMsg}
                draftPin={draftPin} picking={pickMode === 'pin'}
                onStartPin={() => setPickMode((m) => (m === 'pin' ? null : 'pin'))}
                onClearPin={() => setDraftPin(null)}
                onShowPin={(m) => { if (m.lng !== null && m.lat !== null) mapRef.current?.flyTo(m.lng, m.lat, Math.max(view?.zoom ?? 6, 8)) }}
                onSend={sendMessage} onEdit={editMessage} onDelete={deleteMessage}
              />
            )}
            {tab === 'history' && (
              <HistoryPanel
                projectId={id} revisions={revisions} previewSeq={preview?.seq ?? null}
                onPreview={(seq, snapshot) => setPreview(head && seq === head.seq ? null : { seq, snapshot })}
                onRestore={(rev) => setDialog({ kind: 'restore', rev })}
              />
            )}
            {tab === 'details' && (
              <DetailsPanel project={bundle.project} members={bundle.members} online={online} me={bundle.me}
                            onSave={saveDetails} onArchive={() => setDialog({ kind: 'archive' })} />
            )}
          </>
        )}
      </aside>

      <div className="ws-statusbar">
        <span className="hide-sm" style={{ minWidth: 190 }}>{cursor ? `Lat ${cursor.lat.toFixed(5)}  Lon ${cursor.lng.toFixed(5)}` : 'Lat —  Lon —'}</span>
        <span>Zoom {view ? view.zoom.toFixed(2) : '—'}</span>
        <span className="hide-sm">1:{view ? Math.round(view.scale).toLocaleString('en-GB') : '—'}</span>
        <span className="hide-sm">WGS 84 · EPSG:4326</span>
        <span className="grow">{note}</span>
        <span title={head ? `${head.author_name}: ${head.summary}` : ''}>{head ? `r${head.seq} ${shortRev(head.id)}` : 'r0'}</span>
      </div>

      {floating === 'add' && (
        <AddData
          places={places} picking={pickMode === 'place'} previewKeys={previewKeys}
          onClose={() => { setFloating(null); setPreviewFiles([]); if (pickMode === 'place') setPickMode(null) }}
          onAdd={addLayers}
          onPreview={(files) => setPreviewFiles(files)}
          onTogglePick={() => setPickMode((m) => (m === 'place' ? null : 'place'))}
          onAddPlace={(pl) => { setPlaces((ps) => [...ps, pl]); mapRef.current?.flyTo(pl.lng, pl.lat, 8) }}
          onRemovePlace={(pl) => setPlaces((ps) => ps.filter((x) => x !== pl))}
        />
      )}
      {floating === 'import' && (
        <ImportDialog orgId={bundle.org.id} projectId={id} onClose={() => setFloating(null)} onImported={importUploads} />
      )}
      {dialog?.kind === 'edit' && (() => {
        const layer = liveLayers.find((l) => l.id === dialog.layerId)
        if (!layer) return null
        return <LayerPropertiesDialog layer={layer} isRaster={statuses[layer.id]?.loaded?.kind === 'raster'}
                                      onClose={() => setDialog(null)} onSave={(patch) => saveLayer(layer.id, patch)} />
      })()}
      {dialog?.kind === 'remove' && (
        <ConfirmDialog title="Remove layer" confirmLabel="Remove" danger onClose={() => setDialog(null)}
          body={<>Remove <b>{dialog.layer.label}</b> from the project for everyone? It stays in the history, so you can restore it later.</>}
          onConfirm={() => removeLayer(dialog.layer)} />
      )}
      {dialog?.kind === 'restore' && (
        <ConfirmDialog title={`Restore r${dialog.rev.seq}`} confirmLabel={`Restore r${dialog.rev.seq}`} onClose={() => setDialog(null)}
          body={<>Make the shared map match <b>r{dialog.rev.seq}</b> for the whole team? That revision: <i>{dialog.rev.summary}</i> ({dialog.rev.author_name}).<br />
            This is recorded as a new revision; the current state stays in the history.</>}
          onConfirm={() => restore(dialog.rev)} />
      )}
      {dialog?.kind === 'archive' && (
        <ConfirmDialog title="Archive project" confirmLabel="Archive" danger onClose={() => setDialog(null)}
          body={<>Archive <b>{bundle.project.name}</b>? It disappears from the project list for the whole team. Email lengamaps@gmail.com if you need it back.</>}
          onConfirm={async () => { await api(`/api/workspace/projects/${id}`, { method: 'DELETE' }); router.push('/workspace') }} />
      )}
    </div>
  )
}

export default function WorkstationPage() {
  return (
    <Suspense fallback={null}>
      <Workstation />
    </Suspense>
  )
}
