'use client'

import Link from 'next/link'
import { useInbox } from './useInbox'

export default function TitleBar({ crumbs, right }: { crumbs: { label: string; href?: string }[]; right?: React.ReactNode }) {
  const { unread } = useInbox()
  return (
    <div className="ws-titlebar">
      <Link href="/" className="ws-wordmark">Lenga <b>Maps</b></Link>
      <div className="ws-crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <span className="sep">/</span>
            {c.href && i < crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span className="here">{c.label}</span>}
          </span>
        ))}
      </div>
      <span className="spacer" />
      {right}
      <Link href="/workspace/messages" className="small ws-inbox-link" style={{ marginLeft: 10 }} title={unread ? `${unread} unread` : 'Messages'}>
        Messages{unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </Link>
      <Link href="/dashboard" className="small">Dashboard</Link>
      <Link href="/team" className="small">Team</Link>
    </div>
  )
}
