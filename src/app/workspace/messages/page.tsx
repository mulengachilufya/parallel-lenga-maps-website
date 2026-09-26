'use client'

/**
 * /workspace/messages — end-to-end encrypted one-to-one messages between
 * teammates.
 *
 * Messages are encrypted in the sender's browser and decrypted in the
 * recipient's (lib/workspace/e2e.ts). The server, the database, the email
 * provider and Lenga staff only ever see ciphertext. Each person unlocks
 * their key once per device with a messages passphrase that never leaves
 * the browser; lose it and old messages can't be recovered by anyone.
 *
 * Text only: voice notes belong in project comments, where the team hears them.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  changePassphrase, conversationKey, createIdentity, open, seal, securityCode, unlockIdentity,
  type PublicKeyRecord, type WrappedKey,
} from '@/lib/workspace/e2e'
import { forgetDeviceKey, loadDeviceKey, saveDeviceKey } from '@/lib/workspace/e2e-store'
import type { WsConversation, WsDirectMessage, WsSealedRef } from '@/lib/workspace/types'
import TitleBar from '@/components/workspace/TitleBar'
import { api, initials, stamp, tileColor, timeAgo } from '@/components/workspace/util'

interface Inbox {
  me:            { user_id: string; name: string }
  org:           { id: string; name: string }
  conversations: WsConversation[]
  keys:          Record<string, { user_id: string; public_jwk: JsonWebKey }>
  unread_total:  number
}
type KeyState =
  | { s: 'loading' }
  | { s: 'setup'; reset: boolean }
  | { s: 'locked'; wrapped: WrappedKey }
  | { s: 'ready'; wrapped: WrappedKey; priv: CryptoKey }

const MIN_PASS = 10
const UNREADABLE = '🔒 Encrypted with an earlier key. It can no longer be read.'

function MessagesInner() {
  const router = useRouter()
  const params = useSearchParams()
  const withId = params.get('with')
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'no_team' | 'error'>('loading')
  const [ks, setKs] = useState<KeyState>({ s: 'loading' })
  const [thread, setThread] = useState<WsDirectMessage[]>([])
  const [threadKeys, setThreadKeys] = useState<Inbox['keys']>({})
  const [plain, setPlain] = useState<Record<string, string>>({})
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [nudged, setNudged] = useState<Record<string, boolean>>({})
  const scroller = useRef<HTMLDivElement>(null)
  const convKeys = useRef(new Map<string, CryptoKey>())

  // ── Load inbox + my key ────────────────────────────────────────────────
  const loadInbox = useCallback(async () => {
    const res = await fetch('/api/workspace/dms', { cache: 'no-store' })
    if (res.status === 401) { router.replace('/login?next=/workspace/messages'); return null }
    if (res.status === 403) { setState('no_team'); return null }
    if (!res.ok) { setState('error'); return null }
    const d = await res.json() as Inbox
    setInbox(d); setState('ready')
    return d
  }, [router])

  useEffect(() => {
    void (async () => {
      const d = await loadInbox()
      if (!d) return
      const { key } = await api<{ key: WrappedKey | null }>('/api/workspace/keys', { cache: 'no-store' })
      if (!key) { setKs({ s: 'setup', reset: false }); return }
      const dev = await loadDeviceKey(d.me.user_id)
      if (dev && dev.keyId === key.key_id) setKs({ s: 'ready', wrapped: key, priv: dev.key })
      else setKs({ s: 'locked', wrapped: key })
    })().catch(() => setState('error'))
  }, [loadInbox])

  // ── Decryption helpers ─────────────────────────────────────────────────
  const decrypt = useCallback(async (m: WsSealedRef & { sender_id?: string }, keys: Inbox['keys']): Promise<string> => {
    if (ks.s !== 'ready' || !inbox) return ''
    const meSender = keys[m.sender_key_id]?.user_id === inbox.me.user_id
    const mine = meSender ? m.sender_key_id : m.recipient_key_id
    const theirs = meSender ? m.recipient_key_id : m.sender_key_id
    if (mine !== ks.wrapped.key_id || !keys[theirs]) return UNREADABLE
    const cacheId = `${mine}|${theirs}`
    let k = convKeys.current.get(cacheId)
    if (!k) {
      k = await conversationKey(ks.priv, mine, { key_id: theirs, public_jwk: keys[theirs].public_jwk })
      convKeys.current.set(cacheId, k)
    }
    try { return await open(k, m, m.sender_key_id, m.recipient_key_id) }
    catch { return '⚠ This message failed its integrity check and was not shown.' }
  }, [ks, inbox])

  // Inbox previews.
  useEffect(() => {
    if (ks.s !== 'ready' || !inbox) return
    let cancelled = false
    void Promise.all(inbox.conversations.filter((c) => c.last).map(async (c) =>
      [c.member.user_id, await decrypt(c.last!.sealed, inbox.keys)] as const,
    )).then((pairs) => {
      if (cancelled) return
      setPreviews(Object.fromEntries(pairs.map(([id, t]) => [id, t.length > 90 ? `${t.slice(0, 90)}…` : t])))
    })
    return () => { cancelled = true }
  }, [inbox, ks, decrypt])

  const active = useMemo(() => inbox?.conversations.find((c) => c.member.user_id === withId) ?? null, [inbox, withId])

  useEffect(() => {
    if (!inbox || withId || !inbox.conversations.length || ks.s !== 'ready') return
    if (window.matchMedia('(min-width: 901px)').matches) {
      router.replace(`/workspace/messages?with=${inbox.conversations[0].member.user_id}`)
    }
  }, [inbox, withId, router, ks.s])

  const loadThread = useCallback(async (id: string) => {
    try {
      const d = await api<{ messages: WsDirectMessage[]; keys: Inbox['keys'] }>(`/api/workspace/dms/${id}`, { cache: 'no-store' })
      setThreadKeys(d.keys); setThread(d.messages)
      setInbox((i) => i && ({ ...i, conversations: i.conversations.map((c) => c.member.user_id === id ? { ...c, unread: 0 } : c) }))
    } catch { setThread([]) }
  }, [])

  useEffect(() => {
    setThread([]); setErr(''); setShowCode(false)
    if (withId && ks.s === 'ready') void loadThread(withId)
  }, [withId, loadThread, ks.s])

  // Decrypt whatever is in the thread and not yet decrypted.
  useEffect(() => {
    if (ks.s !== 'ready' || !inbox) return
    const todo = thread.filter((m) => plain[m.id] === undefined)
    if (!todo.length) return
    const keys = { ...inbox.keys, ...threadKeys }
    void Promise.all(todo.map(async (m) => [m.id, await decrypt(m, keys)] as const))
      .then((pairs) => setPlain((p) => ({ ...p, ...Object.fromEntries(pairs) })))
  }, [thread, threadKeys, inbox, ks, decrypt, plain])

  // Security code for this pair of keys.
  useEffect(() => {
    setCode(null)
    if (ks.s !== 'ready' || !active?.key) return
    void securityCode(
      { key_id: ks.wrapped.key_id, public_jwk: ks.wrapped.public_jwk },
      { key_id: active.key.key_id, public_jwk: active.key.public_jwk },
    ).then(setCode)
  }, [ks, active])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.length, withId, plain])

  // ── Realtime ───────────────────────────────────────────────────────────
  const activeRef = useRef<string | null>(null)
  activeRef.current = withId
  useEffect(() => {
    const me = inbox?.me.user_id
    if (!me) return
    const onInsert = (m: WsDirectMessage) => {
      const other = m.sender_id === me ? m.recipient_id : m.sender_id
      if (other === activeRef.current) {
        setThread((t) => (t.some((x) => x.id === m.id) ? t : [...t, m]))
        if (m.recipient_id === me) void loadThread(other)
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

  // ── Send ───────────────────────────────────────────────────────────────
  async function sendText(retried = false): Promise<void> {
    const body = text.trim()
    if (!body || !withId || busy || ks.s !== 'ready' || !active?.key) return
    setBusy(true); setErr('')
    try {
      const their: PublicKeyRecord = { key_id: active.key.key_id, public_jwk: active.key.public_jwk }
      const cacheId = `${ks.wrapped.key_id}|${their.key_id}`
      let k = convKeys.current.get(cacheId)
      if (!k) { k = await conversationKey(ks.priv, ks.wrapped.key_id, their); convKeys.current.set(cacheId, k) }
      const sealed = await seal(k, body, ks.wrapped.key_id, their.key_id)
      const res = await fetch(`/api/workspace/dms/${withId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sealed, sender_key_id: ks.wrapped.key_id, recipient_key_id: their.key_id }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.status === 409 && d.error === 'stale_key' && !retried) {
        await loadInbox(); setBusy(false)
        setErr(`${active.member.name} reset their secure messages. Press Send again to encrypt for their new key.`)
        return
      }
      if (!res.ok) throw new Error(d.error ?? 'Could not send')
      setPlain((p) => ({ ...p, [d.message.id]: body }))
      setThread((t) => (t.some((x) => x.id === d.message.id) ? t : [...t, d.message]))
      setText('')
      void loadInbox()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send') }
    finally { setBusy(false) }
  }

  async function nudge(userId: string) {
    setNudged((n) => ({ ...n, [userId]: true }))
    await fetch(`/api/workspace/dms/${userId}/nudge`, { method: 'POST' }).catch(() => {})
  }

  // ── Key screens ────────────────────────────────────────────────────────
  if (state === 'ready' && inbox && ks.s !== 'ready' && ks.s !== 'loading') {
    return (
      <div className="ws ws-page">
        <TitleBar crumbs={[{ label: inbox.org.name, href: '/workspace' }, { label: 'Messages' }]} />
        <div className="ws-page-body">
          {ks.s === 'setup'
            ? <SetupKey reset={ks.reset} userId={inbox.me.user_id}
                onDone={(wrapped, priv) => { convKeys.current.clear(); setPlain({}); setKs({ s: 'ready', wrapped, priv }) }} />
            : <UnlockKey wrapped={ks.wrapped} userId={inbox.me.user_id}
                onDone={(priv) => setKs({ s: 'ready', wrapped: ks.wrapped, priv })}
                onReset={() => setKs({ s: 'setup', reset: true })} />}
        </div>
      </div>
    )
  }

  const me = inbox?.me.user_id
  const lastMine = [...thread].reverse().find((m) => m.sender_id === me)

  return (
    <div className="ws ws-page ws-dm-page">
      <TitleBar crumbs={[{ label: inbox?.org.name ?? 'Workspace', href: '/workspace' }, { label: 'Messages' }]} />

      {state === 'no_team' && (
        <div className="ws-page-body">
          <h1>Messages are for team accounts</h1>
          <p className="ws-lede">Team members can message each other here, end-to-end encrypted. <Link href="/projects">See team plans</Link>.</p>
        </div>
      )}
      {state === 'error' && <div className="ws-page-body"><p className="ws-err">Could not load your messages. Refresh to try again.</p></div>}
      {(state === 'loading' || (state === 'ready' && ks.s === 'loading')) && <div className="ws-page-body"><p className="muted">Loading…</p></div>}

      {state === 'ready' && inbox && ks.s === 'ready' && (
        <div className={`ws-dm${withId ? ' has-active' : ''}`}>
          <aside className="ws-dm-list">
            <div className="ws-panel-head">Team · {inbox.conversations.length + 1}<span className="spacer" />
              <DeviceMenu wrapped={ks.wrapped} userId={inbox.me.user_id}
                onLocked={() => { convKeys.current.clear(); setPlain({}); setKs({ s: 'locked', wrapped: ks.wrapped }) }}
                onChanged={(w) => setKs({ s: 'ready', wrapped: w, priv: ks.priv })} />
            </div>
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
                        <span className="pv">
                          {!c.key ? 'Not set up for secure messages yet'
                            : c.last ? `${c.last.from_me ? 'You: ' : ''}${previews[c.member.user_id] ?? '…'}` : c.member.email}
                        </span>
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
            <div className="ws-e2e-foot">
              <span className="lock" aria-hidden>●</span> End-to-end encrypted. Only you and the person you are
              writing to can read these messages. Not Lenga, not your team owner, not the email provider.
            </div>
          </aside>

          <section className="ws-dm-thread">
            {!active ? (
              <div className="ws-empty">
                <b>Pick a teammate.</b><br />
                They see your message straight away, and get an email saying a message is waiting. The email
                never contains the message itself. For a voice note, leave it as a comment on the project.
              </div>
            ) : (
              <>
                <div className="ws-panel-head">
                  <Link href="/workspace/messages" className="ws-dm-back">‹ Team</Link>
                  <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11.5, color: 'var(--ink)' }}>{active.member.name}</span>
                  <span className="spacer" />
                  {active.key && (
                    <button className="ws-btn ws-btn-flat" style={{ textTransform: 'none', letterSpacing: 0 }} onClick={() => setShowCode((v) => !v)}>
                      {showCode ? 'Hide security code' : 'Verify security code'}
                    </button>
                  )}
                </div>
                {showCode && code && (
                  <div className="ws-note small" style={{ margin: 8 }}>
                    <b>Security code with {active.member.name}</b>
                    <div className="mono" style={{ fontSize: 13, letterSpacing: '.04em', margin: '5px 0' }}>{code}</div>
                    Compare this with the code on {active.member.name}&apos;s screen, in person or on a call. If they
                    match, nobody (Lenga included) can read or alter your messages. It changes only if one of you resets.
                  </div>
                )}
                <div className="ws-dm-log" ref={scroller}>
                  {thread.length === 0 && active.key && (
                    <div className="ws-empty">No messages with {active.member.name} yet. Say hello.</div>
                  )}
                  {thread.map((m, i) => {
                    const mine = m.sender_id === me
                    const prev = thread[i - 1]
                    const grouped = prev && prev.sender_id === m.sender_id &&
                      new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000
                    const t = plain[m.id]
                    return (
                      <div key={m.id} className={`ws-dm-msg${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`}>
                        {!grouped && (
                          <div className="hdr">
                            <span className="who">{mine ? 'You' : m.sender_name}</span>
                            <span className="when" title={stamp(m.created_at)}>{timeAgo(m.created_at)}</span>
                          </div>
                        )}
                        <div className={`body${t === UNREADABLE ? ' muted' : ''}`}>{t ?? '…'}</div>
                        {mine && lastMine?.id === m.id && (
                          <div className="seen">{m.read_at ? `Seen ${timeAgo(m.read_at)}` : 'Sent'}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {!active.key ? (
                  <div className="ws-composer">
                    <p className="small" style={{ margin: 0 }}>
                      {active.member.name}{' '}hasn&apos;t set up secure messages yet, so there is no key to encrypt for.
                      They&apos;ll be asked to the first time they open Messages.{' '}
                      {nudged[active.member.user_id]
                        ? <b>We&apos;ve emailed them.</b>
                        : <a href="#" onClick={(e) => { e.preventDefault(); void nudge(active.member.user_id) }}>Email them to set it up</a>}
                    </p>
                  </div>
                ) : (
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
                      <span className="small muted"><span className="lock" aria-hidden>●</span> Encrypted on this device before sending</span>
                      <span className="grow ws-err small">{err}</span>
                      <button className="ws-btn ws-btn-default" disabled={!text.trim() || busy} onClick={() => void sendText()}>
                        {busy ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

// ── Setup / unlock / device menu ─────────────────────────────────────────────

function SetupKey({ reset, userId, onDone }: { reset: boolean; userId: string; onDone: (w: WrappedKey, k: CryptoKey) => void }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [ok, setOk] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const valid = p1.length >= MIN_PASS && p1 === p2 && ok

  async function go(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true); setErr('')
    try {
      const { wrapped, privateKey } = await createIdentity(crypto.randomUUID(), p1)
      await api('/api/workspace/keys', { method: 'POST', json: { ...wrapped, reset } })
      if (remember) await saveDeviceKey(userId, wrapped.key_id, privateKey)
      onDone(wrapped, privateKey)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not set up'); setBusy(false) }
  }

  return (
    <form onSubmit={go} style={{ maxWidth: 560 }}>
      <h1>{reset ? 'Reset secure messages' : 'Set up secure messages'}</h1>
      <p className="ws-lede">
        Direct messages on Lenga are end-to-end encrypted. They are locked on your device before they
        are sent and can only be unlocked by you and the person you are writing to. Lenga cannot read
        them, and neither can your team owner or the email provider.
      </p>
      {reset && (
        <div className="ws-note small" style={{ marginBottom: 12 }}>
          Resetting creates a new key. Messages sent to your old key can no longer be read by anyone,
          including you. Your teammates will see a new security code.
        </div>
      )}
      <div className="ws-box">
        <div className="ws-field">
          <label className="ws-label" htmlFor="p1">Choose a messages passphrase (at least {MIN_PASS} characters)</label>
          <input id="p1" className="ws-input" type="password" autoComplete="new-password" style={{ width: '100%' }} value={p1} onChange={(e) => setP1(e.target.value)} />
        </div>
        <div className="ws-field">
          <label className="ws-label" htmlFor="p2">Type it again</label>
          <input id="p2" className="ws-input" type="password" autoComplete="new-password" style={{ width: '100%' }} value={p2} onChange={(e) => setP2(e.target.value)} />
          {p2 && p1 !== p2 && <div className="ws-err small">The two don&apos;t match.</div>}
        </div>
        <p className="small muted" style={{ margin: '0 0 8px' }}>
          Use something different from your login password. A short sentence works well, for example
          &quot;kafue floods every march&quot;. You&apos;ll need it once on each new device.
        </p>
        <label className="ws-check" style={{ marginBottom: 6 }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          I understand Lenga can&apos;t recover this passphrase. If I forget it, my old messages are gone.
        </label><br />
        <label className="ws-check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Keep me unlocked on this device
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button className="ws-btn ws-btn-default" disabled={!valid || busy}>{busy ? 'Creating your key…' : reset ? 'Reset and continue' : 'Turn on secure messages'}</button>
          {err && <span className="ws-err small">{err}</span>}
        </div>
      </div>
    </form>
  )
}

function UnlockKey({ wrapped, userId, onDone, onReset }: {
  wrapped: WrappedKey; userId: string; onDone: (k: CryptoKey) => void; onReset: () => void
}) {
  const [p, setP] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const k = await unlockIdentity(wrapped, p)
      if (remember) await saveDeviceKey(userId, wrapped.key_id, k)
      onDone(k)
    } catch (e) {
      setErr(e instanceof Error && e.message === 'wrong_passphrase' ? 'That passphrase is not right.' : 'Could not unlock')
      setBusy(false)
    }
  }
  return (
    <form onSubmit={go} style={{ maxWidth: 520 }}>
      <h1>Unlock your messages</h1>
      <p className="ws-lede">Your messages are end-to-end encrypted. Enter your messages passphrase to read them on this device.</p>
      <div className="ws-box">
        <div className="ws-field">
          <label className="ws-label" htmlFor="up">Messages passphrase</label>
          <input id="up" className="ws-input" type="password" autoComplete="current-password" autoFocus style={{ width: '100%' }} value={p} onChange={(e) => setP(e.target.value)} />
        </div>
        <label className="ws-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me unlocked on this device</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button className="ws-btn ws-btn-default" disabled={!p || busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
          {err && <span className="ws-err small">{err}</span>}
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>
        Forgot it? Nobody can recover it, Lenga included. You can{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); if (confirm('Reset secure messages? Messages sent to your current key can never be read again.')) onReset() }}>reset secure messages</a>
        {' '}and start fresh.
      </p>
    </form>
  )
}

function DeviceMenu({ wrapped, userId, onLocked, onChanged }: {
  wrapped: WrappedKey; userId: string; onLocked: () => void; onChanged: (w: WrappedKey) => void
}) {
  const [open_, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  const [oldP, setOldP] = useState('')
  const [newP, setNewP] = useState('')
  const [msg, setMsg] = useState('')
  async function change(e: React.FormEvent) {
    e.preventDefault()
    if (newP.length < MIN_PASS) { setMsg(`At least ${MIN_PASS} characters.`); return }
    try {
      const w = await changePassphrase(wrapped, oldP, newP)
      await api('/api/workspace/keys', { method: 'PUT', json: w })
      onChanged(w); setChanging(false); setOldP(''); setNewP(''); setMsg('Passphrase changed.')
    } catch (e) { setMsg(e instanceof Error && e.message === 'wrong_passphrase' ? 'Current passphrase is not right.' : 'Could not change it.') }
  }
  return (
    <span style={{ position: 'relative', textTransform: 'none', letterSpacing: 0, fontWeight: 'normal' }}>
      <button className="ws-btn ws-btn-flat" onClick={() => setOpen((v) => !v)} aria-expanded={open_}>Security ▾</button>
      {open_ && (
        <div className="ws-mention-pop" style={{ right: 0, left: 'auto', top: '100%', bottom: 'auto', width: 260, padding: 8, fontSize: 11 }}>
          {!changing ? (
            <>
              <button onClick={() => setChanging(true)}>Change messages passphrase</button>
              <button onClick={async () => { await forgetDeviceKey(userId); setOpen(false); onLocked() }}>Lock this device</button>
              {msg && <div className="small" style={{ padding: '3px 8px' }}>{msg}</div>}
            </>
          ) : (
            <form onSubmit={change}>
              <input className="ws-input" type="password" placeholder="Current passphrase" style={{ width: '100%', marginBottom: 4 }} value={oldP} onChange={(e) => setOldP(e.target.value)} />
              <input className="ws-input" type="password" placeholder="New passphrase" style={{ width: '100%', marginBottom: 6 }} value={newP} onChange={(e) => setNewP(e.target.value)} />
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="submit" className="ws-btn ws-btn-default">Change</button>
                <button type="button" className="ws-btn" onClick={() => { setChanging(false); setMsg('') }}>Cancel</button>
              </div>
              {msg && <div className="ws-err small" style={{ marginTop: 4 }}>{msg}</div>}
            </form>
          )}
        </div>
      )}
    </span>
  )
}

export default function MessagesPage() {
  return <Suspense fallback={null}><MessagesInner /></Suspense>
}
