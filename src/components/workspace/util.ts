// src/components/workspace/util.ts
import type { WsSnapshot } from '@/lib/workspace/types'

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return m === 1 ? '1 minute ago' : `${m} minutes ago`
  const h = Math.round(m / 60)
  if (h < 24) return h === 1 ? 'about an hour ago' : `about ${h} hours ago`
  const d = Math.round(h / 24)
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// Muted, print-like colours for member tiles.
const TILE = ['#7a4b2a', '#3b5f3a', '#34597e', '#6c3f68', '#8a6a1f', '#4c5a61', '#8b3a36', '#2f6b6b']
export function tileColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return TILE[h % TILE.length]
}

export interface DiffLine { kind: 'add' | 'del' | 'mod' | 'none'; text: string }

/** What changed between two project snapshots, as git-style lines. */
export function diffSnapshots(prev: WsSnapshot | null, next: WsSnapshot): DiffLine[] {
  const out: DiffLine[] = []
  if (!prev) {
    out.push({ kind: 'add', text: `+ project "${next.name}"` })
    for (const l of next.layers) out.push({ kind: 'add', text: `+ layer  ${l.label}` })
    for (const b of next.bookmarks) out.push({ kind: 'add', text: `+ view   ${b.name}` })
    return out
  }
  if (prev.name !== next.name) out.push({ kind: 'mod', text: `~ name   "${prev.name}" → "${next.name}"` })
  if (prev.description !== next.description) out.push({ kind: 'mod', text: '~ description edited' })
  const pv = prev.map_state, nv = next.map_state
  if (pv && nv && (pv.zoom !== nv.zoom || pv.center[0] !== nv.center[0] || pv.center[1] !== nv.center[1] || pv.basemap !== nv.basemap)) {
    out.push({ kind: 'mod', text: `~ view   ${nv.center[1].toFixed(3)}, ${nv.center[0].toFixed(3)} @ z${nv.zoom.toFixed(1)} (${nv.basemap})` })
  }

  const before = new Map(prev.layers.map((l) => [l.id, l]))
  const after = new Map(next.layers.map((l) => [l.id, l]))
  for (const l of next.layers) if (!before.has(l.id)) out.push({ kind: 'add', text: `+ layer  ${l.label}` })
  for (const l of prev.layers) if (!after.has(l.id)) out.push({ kind: 'del', text: `- layer  ${l.label}` })
  for (const l of next.layers) {
    const p = before.get(l.id)
    if (!p) continue
    if (p.label !== l.label) out.push({ kind: 'mod', text: `~ layer  "${p.label}" → "${l.label}"` })
    const ps = JSON.stringify(p.style), ns = JSON.stringify(l.style)
    if (ps !== ns) out.push({ kind: 'mod', text: `~ style  ${l.label}` })
  }
  const orderBefore = prev.layers.filter((l) => after.has(l.id)).map((l) => l.id).join()
  const orderAfter = next.layers.filter((l) => before.has(l.id)).map((l) => l.id).join()
  if (orderBefore !== orderAfter) out.push({ kind: 'mod', text: '~ order  layers re-stacked' })

  const bBefore = new Set(prev.bookmarks.map((b) => b.id))
  const bAfter = new Set(next.bookmarks.map((b) => b.id))
  for (const b of next.bookmarks) if (!bBefore.has(b.id)) out.push({ kind: 'add', text: `+ view   ${b.name}` })
  for (const b of prev.bookmarks) if (!bAfter.has(b.id)) out.push({ kind: 'del', text: `- view   ${b.name}` })

  if (!out.length) out.push({ kind: 'none', text: '  no changes to shared state' })
  return out
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}
