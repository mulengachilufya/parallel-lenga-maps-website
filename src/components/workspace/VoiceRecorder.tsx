'use client'

/**
 * Record a voice note in the browser: tap to record, tap to stop, listen
 * back, then send or discard. Opus-in-WebM where the browser has it
 * (Chrome, Firefox, Edge), AAC-in-MP4 on Safari.
 */

import { useEffect, useRef, useState } from 'react'
import { clock } from '@/lib/workspace/dms'

const MAX_SECONDS = 300
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

export interface VoiceClip { blob: Blob; seconds: number }

export default function VoiceRecorder({ disabled, onSend }: {
  disabled?: boolean
  onSend: (clip: VoiceClip) => Promise<void>
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'sending'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [clip, setClip] = useState<VoiceClip | null>(null)
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const rec = useRef<MediaRecorder | null>(null)
  const started = useRef(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
    rec.current?.stream.getTracks().forEach((t) => t.stop())
  }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  async function start() {
    setErr('')
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErr('This browser cannot record audio.'); return
    }
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
    catch { setErr('Microphone access was blocked. Allow it in the browser address bar and try again.'); return }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const r = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined)
    const chunks: Blob[] = []
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      if (timer.current) clearInterval(timer.current)
      const seconds = Math.min(MAX_SECONDS, Math.max(1, Math.round((Date.now() - started.current) / 1000)))
      const blob = new Blob(chunks, { type: (r.mimeType || mimeType || 'audio/webm').split(';')[0] })
      setClip({ blob, seconds })
      setUrl(URL.createObjectURL(blob))
      setState('review')
    }
    rec.current = r
    started.current = Date.now()
    setElapsed(0)
    r.start(1000)
    setState('recording')
    timer.current = setInterval(() => {
      const s = Math.round((Date.now() - started.current) / 1000)
      setElapsed(s)
      if (s >= MAX_SECONDS) r.stop()
    }, 250)
  }

  function discard() {
    setClip(null); setUrl(''); setState('idle')
  }

  async function send() {
    if (!clip) return
    setState('sending'); setErr('')
    try { await onSend(clip); discard() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send'); setState('review') }
  }

  if (state === 'recording') {
    return (
      <span className="ws-rec">
        <span className="dot" aria-hidden /> <span className="mono">{clock(elapsed)}</span>
        <span className="muted small">/ {clock(MAX_SECONDS)}</span>
        <button className="ws-btn" onClick={() => rec.current?.stop()}>Stop</button>
      </span>
    )
  }
  if (state === 'review' || state === 'sending') {
    return (
      <span className="ws-rec">
        <audio src={url} controls preload="metadata" />
        <button className="ws-btn" onClick={discard} disabled={state === 'sending'}>Discard</button>
        <button className="ws-btn ws-btn-default" onClick={() => void send()} disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : `Send voice note (${clock(clip?.seconds ?? 0)})`}
        </button>
        {err && <span className="ws-err small">{err}</span>}
      </span>
    )
  }
  return (
    <span className="ws-rec">
      <button className="ws-btn" onClick={() => void start()} disabled={disabled} title="Record a voice note (up to 5 minutes)">
        <span className="mic" aria-hidden>●</span> Voice note
      </button>
      {err && <span className="ws-err small">{err}</span>}
    </span>
  )
}
