'use client'

/**
 * /workspace/messages — one-to-one messages between teammates.
 *
 * Left: everyone on the team, most recent conversation first, with unread
 * counts. Right: the conversation, a composer and a voice-note recorder.
 * New messages arrive over Realtime; each one is also emailed to the
 * recipient (see /api/workspace/dms/:userId for the throttle).
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { clock } from '@/lib/workspace/dms'
import type { WsConversation, WsDirectMessage } from '@/lib/workspace/types'
import TitleBar from '@/components/workspace/TitleBar'
import VoiceRecorder, { type VoiceClip } from '@/components/workspace/VoiceRecorder'
import { api, initials, stamp, tileColor, timeAgo } from '@/components/workspace/util'

interface Inbox {
  me:            { user_id: string; name: string }
  org:           { id: string; name: string }
  conversations: WsConversation[]
  unread_total:  number
}

const ERRORS: Record<string, string> = {
  voice_too_large: 'That recording is too large to send (4 MB limit).',
  voice_too_long:  'Voice notes can be up to 5 minutes.',
  voice_too_short: 'That recording was too short.',
  voice_format:    'This browser recorded in a format we cannot store.',
}

function MessagesInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'no_team' | 'error'>('loading')
  const [thread, setThread] = useState<WsDirectMessage[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const withId = params.get('with')

  const loadInbox = useCallback(async () => {
    const res = await fetch('/api/workspace/dms', { cache: 'no-store' })
    if (res.status === 401) { router.replace('/login?next=/workspace/messages'); return null }
    if (res.status === 403) { setState('no_team'); return null }
    if (!res.ok) { setState('error'); return null }
    const d = await res.json() as Inbox
    setInbox(d); setState('ready')
    return d
  }, [router])

  useEffect(() => { void loadInbox() }, [loadInbox])

  const active = useMemo(
    () => inbox?.conversations.find((c) => c.member.user_id === withId) ?? null,
    [inbox, withId],
  )

  // Wide screens open the most recent conversation straight away.
  useEffect(() => {
    if (!inbox || withId || !inbox.conversations.length) return
    if (window.matchMedia('(min-width: 901px)').matches) {
      router.replace(`/workspace/messages?with=${inbox.conversations[0].member.user_id}`)
    }
  }, [inbox, withId, router])

  const loadThread = useCallback(async (id: string) => {
    try {
      const d = await api<{ messages: WsDirectMessage[] }>(`/api/workspace/dms/${id}`, { cache: 'no-store' })
      setThread(d.messages)
      setInbox((i) => i && ({
        ...i,
        conversations: i.conversations.map((c) => c.member.user_id === id ? { ...c, unread: 0 } : c),
      }))
    } catch { setThread([]) }
  }, [])

  useEffect(() => {
    setThread([]); setErr('')
    if (withId) void loadThread(withId)
  }, [withId, loadThread])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.length, withId])

  // Live: new messages to me (and my own, from other tabs).
  const activeRef = useRef<string | null>(null)
  activeRef.current = withId
  useEffect(() => {
    const me = inbox?.me.user_id
    if (!me) return
    const onInsert = (m: WsDirectMessage) => {
      const other = m.sender_id === me ? m.recipient_id : m.sender_id
      if (other === activeRef.current) {
        setThread((t) => (t.some((x) => x.id === m.id) ? t : [...t, m]))
        if (m.recipient_id === me) void loadThread(other)   // marks it read
      }
      void loadInbox()
    }
    const ch = supabase.channel(`ws-dm-${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_direct_messages', filter: `recipient_id=eq.${me}` },
        (p) => onInsert(p.new as WsDirectMessage))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_direct_messages', filter: `sender_id=eq.${me}` },
        (p) => onInsert(p.new as WsDirectMessage))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspace_direct_messages', filter: `sender_id=eq.${me}` },
        (p) => { const m = p.new as WsDirectMessage; setThread((t) => t.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x))) })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [inbox?.me.user_id, loadInbox, loadThread])

  function append(m: WsDirectMessage) {
    setThread((t) => (t.some((x) => x.id === m.id) ? t : [...t, m]))
    void loadInbox()
  }

  async function sendText() {
    const body = text.trim()
    if (!body || !withId || busy) return
    setBusy(true); setErr('')
    try {
      const d = await api<{ message: WsDirectMessage }>(`/api/workspace/dms/${withId}`, { method: 'POST', json: { body } })
      setText(''); append(d.message)
    } catch (e) { setErr(e instanceof Error ? (ERRORS[e.message] ?? e.message) : 'Could not send') }
    finally { setBusy(false) }
  }

  async function sendVoice(clip: VoiceClip) {
    if (!withId) return
    const form = new FormData()
    const ext = clip.blob.type.includes('mp4') ? 'm4a' : clip.blob.type.includes('ogg') ? 'ogg' : 'webm'
    form.append('audio', clip.blob, `voice.${ext}`)
    form.append('seconds', String(clip.seconds))
    const res = await fetch(`/api/workspace/dms/${withId}`, { method: 'POST', body: form })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(ERRORS[d.error] ?? d.error ?? 'Could not send')
    append(d.message)
  }

  const me = inbox?.me.user_id
  const lastMine = [...thread].reverse().find((m) => m.sender_id === me)

  return (
    <div className="ws ws-page ws-dm-page">
      <TitleBar crumbs={[{ label: inbox?.org.name ?? 'Workspace', href: '/workspace' }, { label: 'Messages' }]} />

      {state === 'no_team' && (
        <div className="ws-page-body">
          <h1>Messages are for team accounts</h1>
          <p className="ws-lede">Team members can message each other here, with voice notes, and every message also reaches their email. <Link href="/projects">See team plans</Link>.</p>
        </div>
      )}
      {state === 'error' && <div className="ws-page-body"><p className="ws-err">Could not load your messages. Refresh to try again.</p></div>}
      {state === 'loading' && <div className="ws-page-body"><p className="muted">Loading…</p></div>}

      {state === 'ready' && inbox && (
        <div className={`ws-dm${withId ? ' has-active' : ''}`}>
          <aside className="ws-dm-list">
            <div className="ws-panel-head">Team · {inbox.conversations.length + 1}</div>
            {inbox.conversations.length === 0 ? (
              <div className="ws-empty">
                <b>Nobody else on the team yet.</b><br />
                Invite teammates from the <Link href="/team">Team</Link> page and you can message them here.
              </div>
            ) : (
              <ul>
                {inbox.conversations.map((c) => (
                  <li key={c.member.user_id}>
                    <Link href={`/workspace/messages?with=${c.member.user_id}`} className={c.member.user_id === withId ? 'on' : ''}>
                      <span className="ws-avatar" style={{ background: tileColor(c.member.user_id) }}>{initials(c.member.name)}</span>
                      <span className="who">
                        <span className="name">{c.member.name}</span>
                        <span className="pv">{c.last ? `${c.last.from_me ? 'You: ' : ''}${c.last.preview}` : c.member.email}</span>
                      </span>
                      <span className="side">
                        {c.last && <span className="when">{timeAgo(c.last.at)}</span>}
                        {c.unread > 0 && <span className="badge">{c.unread}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="ws-dm-thread">
            {!active ? (
              <div className="ws-empty">
                <b>Pick a teammate.</b><br />
                Messages appear on their screen straight away and in their email inbox, so they see them
                even when they are not signed in. Hold a longer thought? Send a voice note.
              </div>
            ) : (
              <>
                <div className="ws-panel-head">
                  <Link href="/workspace/messages" className="ws-dm-back">‹ Team</Link>
                  <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11.5, color: 'var(--ink)' }}>{active.member.name}</span>
                  <span className="spacer" />
                  <span className="mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{active.member.email}</span>
                </div>
                <div className="ws-dm-log" ref={scroller}>
                  {thread.length === 0 && (
                    <div className="ws-empty">No messages with {active.member.name} yet. Say hello; they will get an email too.</div>
                  )}
                  {thread.map((m, i) => {
                    const mine = m.sender_id === me
                    const prev = thread[i - 1]
                    const grouped = prev && prev.sender_id === m.sender_id &&
                      new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000
                    return (
                      <div key={m.id} className={`ws-dm-msg${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`}>
                        {!grouped && (
                          <div className="hdr">
                            <span className="who">{mine ? 'You' : m.sender_name}</span>
                            <span className="when" title={stamp(m.created_at)}>{timeAgo(m.created_at)}</span>
                          </div>
                        )}
                        {m.voice_path && (
                          <div className="voice">
                            <audio controls preload="none" src={`/api/workspace/dms/voice/${m.id}`} />
                            <span className="mono muted">{clock(m.voice_seconds ?? 0)}</span>
                          </div>
                        )}
                        {m.body && <div className="body">{m.body}</div>}
                        {mine && lastMine?.id === m.id && (
                          <div className="seen">{m.read_at ? `Seen ${timeAgo(m.read_at)}` : 'Sent'}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="ws-composer">
                  <textarea
                    className="ws-textarea" rows={2} value={text} maxLength={4000}
                    placeholder={`Message ${active.member.name}. Enter to send, Shift+Enter for a new line.`}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendText() }
                    }}
                  />
                  <div className="row">
                    <VoiceRecorder disabled={busy} onSend={sendVoice} />
                    <span className="grow ws-err small">{err}</span>
                    <button className="ws-btn ws-btn-default" disabled={!text.trim() || busy} onClick={() => void sendText()}>
                      {busy ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default function MessagesPage() {
  return <Suspense fallback={null}><MessagesInner /></Suspense>
}
