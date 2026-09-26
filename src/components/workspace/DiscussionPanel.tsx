'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { WsMember, WsMessage } from '@/lib/workspace/types'
import { stamp, timeAgo } from './util'

interface Props {
  messages:     WsMessage[]
  members:      WsMember[]
  me:           { user_id: string; role: 'owner' | 'member' }
  pinNumbers:   Map<string, number>
  focusId:      string | null
  draftPin:     { lng: number; lat: number } | null
  picking:      boolean
  onStartPin:   () => void
  onClearPin:   () => void
  onShowPin:    (m: WsMessage) => void
  onSend:       (body: string, mentions: string[], parentId: string | null) => Promise<void>
  onEdit:       (id: string, body: string) => Promise<void>
  onDelete:     (id: string) => Promise<void>
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function Body({ text, members, deleted }: { text: string; members: WsMember[]; deleted: boolean }) {
  if (deleted) return <div className="body deleted">This message was deleted.</div>
  const names = members.map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!names.length) return <div className="body">{text}</div>
  const re = new RegExp(`@(${names.map(escapeRe).join('|')})`, 'g')
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(text.slice(last, m.index))
    parts.push(<span key={m.index} className="mention">{m[0]}</span>)
    last = m.index! + m[0].length
  }
  parts.push(text.slice(last))
  return <div className="body">{parts}</div>
}

export default function DiscussionPanel(p: Props) {
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<WsMessage | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [mentionQ, setMentionQ] = useState<string | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)

  const { roots, replies } = useMemo(() => {
    const roots: WsMessage[] = []
    const replies = new Map<string, WsMessage[]>()
    for (const m of p.messages) {
      if (m.parent_id) replies.set(m.parent_id, [...(replies.get(m.parent_id) ?? []), m])
      else roots.push(m)
    }
    return { roots, replies }
  }, [p.messages])

  // Keep the thread pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight
  }, [p.messages.length])

  useEffect(() => {
    if (!p.focusId) return
    document.getElementById(`msg-${p.focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [p.focusId])

  const candidates = useMemo(() => {
    if (mentionQ === null) return []
    const q = mentionQ.toLowerCase()
    return p.members.filter((m) => m.user_id !== p.me.user_id && m.name.toLowerCase().includes(q)).slice(0, 6)
  }, [mentionQ, p.members, p.me.user_id])

  function onType(v: string) {
    setText(v)
    const caret = box.current?.selectionStart ?? v.length
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(v.slice(0, caret))
    setMentionQ(m ? m[2] : null)
    setMentionIdx(0)
  }

  function insertMention(member: WsMember) {
    const el = box.current
    const caret = el?.selectionStart ?? text.length
    const before = text.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${member.name} `)
    const next = before + text.slice(caret)
    setText(next)
    setMentionQ(null)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length) })
  }

  async function send() {
    const body = text.trim()
    if (!body || busy) return
    const mentions = p.members.filter((m) => body.includes(`@${m.name}`)).map((m) => m.user_id)
    setBusy(true); setErr('')
    try {
      await p.onSend(body, mentions, replyTo?.id ?? null)
      setText(''); setReplyTo(null); nearBottom.current = true
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send') }
    finally { setBusy(false) }
  }

  function renderMsg(m: WsMessage) {
    const mine = m.author_id === p.me.user_id
    const deleted = !!m.deleted_at
    const pin = p.pinNumbers.get(m.id)
    return (
      <div key={m.id} id={`msg-${m.id}`} className={`ws-msg${p.focusId === m.id ? ' flash' : ''}`}>
        <div className="hdr">
          <span className="who">{m.author_name}</span>
          <span className="when" title={stamp(m.created_at)}>{timeAgo(m.created_at)}{m.edited_at ? ' · edited' : ''}</span>
          {pin !== undefined && !deleted && (
            <span className="ws-pin-tag" title="Show on the map" onClick={() => p.onShowPin(m)}>pin {pin}</span>
          )}
        </div>
        {editing?.id === m.id ? (
          <div style={{ marginTop: 4 }}>
            <textarea className="ws-textarea" rows={3} value={editing.text} onChange={(e) => setEditing({ id: m.id, text: e.target.value })} />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button className="ws-btn ws-btn-default" onClick={async () => {
                if (!editing.text.trim()) return
                try { await p.onEdit(m.id, editing.text.trim()); setEditing(null) } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') }
              }}>Save</button>
              <button className="ws-btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        ) : <Body text={m.body} members={p.members} deleted={deleted} />}
        {!deleted && editing?.id !== m.id && (
          <div className="foot">
            {!m.parent_id && <button onClick={() => { setReplyTo(m); box.current?.focus() }}>Reply</button>}
            {mine && <button onClick={() => setEditing({ id: m.id, text: m.body })}>Edit</button>}
            {(mine || p.me.role === 'owner') && (
              <button onClick={() => { if (confirm('Delete this message?')) void p.onDelete(m.id) }}>Delete</button>
            )}
          </div>
        )}
        {!m.parent_id && replies.get(m.id)?.length ? (
          <div className="replies">{replies.get(m.id)!.map(renderMsg)}</div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className="ws-panel-body" ref={scroller}
           onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60 }}>
        {roots.length === 0 ? (
          <div className="ws-empty">
            <b>No messages yet.</b><br />
            Talk about the project here. Pin a comment to a place on the map, or type <b>@</b> to
            mention a teammate; they get an email.
          </div>
        ) : <div className="ws-thread">{roots.map((m) => <Fragment key={m.id}>{renderMsg(m)}</Fragment>)}</div>}
      </div>

      <div className="ws-composer">
        {candidates.length > 0 && (
          <div className="ws-mention-pop">
            {candidates.map((c, i) => (
              <button key={c.user_id} className={i === mentionIdx ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); insertMention(c) }}>
                {c.name} <span className="muted small">{c.email}</span>
              </button>
            ))}
          </div>
        )}
        {replyTo && (
          <div className="small" style={{ marginBottom: 4 }}>
            Replying to <b>{replyTo.author_name}</b> · <a href="#" onClick={(e) => { e.preventDefault(); setReplyTo(null) }}>cancel</a>
          </div>
        )}
        <textarea
          ref={box} className="ws-textarea" rows={3} value={text} maxLength={4000}
          placeholder={replyTo ? 'Write a reply…' : 'Write a message. @ to mention, Ctrl+Enter to send.'}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (candidates.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % candidates.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + candidates.length) % candidates.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(candidates[mentionIdx]); return }
              if (e.key === 'Escape') { setMentionQ(null); return }
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() }
          }}
        />
        <div className="row">
          {!replyTo && (p.draftPin ? (
            <span className="small">
              <span className="ws-pin-tag">pinned</span>{' '}
              <span className="mono muted">{p.draftPin.lat.toFixed(4)}, {p.draftPin.lng.toFixed(4)}</span>{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); p.onClearPin() }}>remove</a>
            </span>
          ) : (
            <button className={`ws-btn${p.picking ? ' is-on' : ''}`} onClick={p.onStartPin}
                    title="Click a place on the map to attach this message to it">
              {p.picking ? 'Click the map…' : 'Pin to map'}
            </button>
          ))}
          <span className="grow ws-err small">{err}</span>
          <button className="ws-btn ws-btn-default" disabled={!text.trim() || busy} onClick={() => void send()}>
            {busy ? 'Sending…' : replyTo ? 'Reply' : 'Post'}
          </button>
        </div>
      </div>
    </>
  )
}
