'use client'

/**
 * Site-wide switches from the ops console, plus error reporting:
 *   - the announcement banner (Ops → Fix → Announcement banner),
 *   - maintenance mode: a "back soon" page for visitors; owners, /ops,
 *     /admin and sign-in pages are never blocked,
 *   - browser errors are sent to the ops problem log (rate-limited).
 */

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

interface Status { banner: string | null; maintenance: { on: boolean; message?: string | null } }
const OPEN_PATHS = ['/ops', '/admin', '/login', '/auth', '/reset-password', '/forgot-password']

export default function SiteNotice() {
  const pathname = usePathname() ?? '/'
  const [status, setStatus] = useState<Status | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ops/status').then((r) => (r.ok ? r.json() : null)).then((s: Status | null) => {
      if (cancelled || !s) return
      setStatus(s)
      if (s.maintenance.on) fetch('/api/admin/me').then((r) => r.json()).then((d) => { if (!cancelled) setIsAdmin(!!d.isAdmin) }).catch(() => {})
    }).catch(() => {})
    return () => { cancelled = true }
  }, [pathname])

  useEffect(() => {
    let sent = 0
    const report = (message: string) => {
      if (sent++ >= 5 || !message) return
      void fetch('/api/ops/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ message: message.slice(0, 300), path: location.pathname }),
      }).catch(() => {})
    }
    const onError = (e: ErrorEvent) => report(e.message || String(e.error ?? ''))
    const onReject = (e: PromiseRejectionEvent) => report(e.reason instanceof Error ? e.reason.message : String(e.reason ?? ''))
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onReject)
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onReject) }
  }, [])

  if (!status) return null
  const open = OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (status.maintenance.on && !open && !isAdmin) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#0d2b45', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ maxWidth: 480 }}>
          <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>Lenga Maps will be back shortly</div>
          <div style={{ fontSize: 16, lineHeight: 1.6, color: '#cfe0f0' }}>{status.maintenance.message || 'We are making improvements. Please try again in a little while.'}</div>
          <div style={{ fontSize: 13, marginTop: 18, color: '#9fb4c8' }}>Questions: support@lengamaps.com</div>
        </div>
      </div>
    )
  }

  const bar = status.maintenance.on && isAdmin
    ? 'Maintenance mode is on: visitors see a "back soon" page. Only admins can see the site. Turn it off in /ops.'
    : status.banner
  if (!bar || pathname.startsWith('/ops')) return null
  return (
    <div role="status" style={{ position: 'relative', zIndex: 60, background: '#f5b800', color: '#1b1606', padding: '7px 14px', fontSize: 14, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
      {bar}
    </div>
  )
}
