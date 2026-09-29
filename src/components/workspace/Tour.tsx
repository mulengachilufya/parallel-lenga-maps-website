'use client'

/**
 * A short guided tour: dims the page, lights up one part of the screen at a
 * time and says in plain words what it does. Steps point at elements by
 * their data-tour attribute; a step whose element is not on screen is
 * skipped, so the tour never points at nothing.
 *
 * Runs once per browser (localStorage) and again whenever the user presses
 * "How it works".
 */

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

export interface TourStep { target: string; title: string; body: string }

export function tourSeen(key: string): boolean {
  try { return localStorage.getItem(key) === 'done' } catch { return true }
}

export default function Tour({ steps, storageKey, onClose }: { steps: TourStep[]; storageKey: string; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const live = steps.filter((s) => typeof document !== 'undefined' && document.querySelector(`[data-tour="${s.target}"]`))
  const step = live[i]

  const finish = useCallback(() => {
    try { localStorage.setItem(storageKey, 'done') } catch { /* private mode */ }
    onClose()
  }, [storageKey, onClose])

  const measure = useCallback(() => {
    const el = step && document.querySelector(`[data-tour="${step.target}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step])

  useLayoutEffect(() => { measure() }, [measure])
  useEffect(() => {
    window.addEventListener('resize', measure)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI((n) => (n + 1 < live.length ? n + 1 : n))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey)
    // The dimmed page stays usable: a click anywhere outside the card ends
    // the tour and still reaches whatever was clicked.
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.ws-tour-card')) finish()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('resize', measure); window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [measure, finish, live.length])

  if (!step || !rect) return null
  const last = i === live.length - 1

  // Card goes below the target if there is room, otherwise above it; kept on screen.
  const W = 320, pad = 8
  const vw = window.innerWidth, vh = window.innerHeight
  const below = rect.bottom + 180 < vh
  const top = below ? Math.min(vh - 190, rect.bottom + 12) : Math.max(8, rect.top - 190)
  const left = Math.min(vw - W - 8, Math.max(8, rect.left + rect.width / 2 - W / 2))

  return (
    <div className="ws-tour" role="dialog" aria-modal="true" aria-label={step.title}>
      <div className="ws-tour-hole" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div className="ws-tour-card" style={{ top, left, width: W }}>
        <div className="ws-tour-step">Step {i + 1} of {live.length}</div>
        <div className="ws-tour-title">{step.title}</div>
        <p className="ws-tour-body">{step.body}</p>
        <div className="ws-tour-actions">
          <button className="ws-link-btn" onClick={finish}>Skip</button>
          <span className="grow" />
          {i > 0 && <button className="ws-btn" onClick={() => setI(i - 1)}>Back</button>}
          <button className="ws-btn ws-btn-default" onClick={() => (last ? finish() : setI(i + 1))}>{last ? 'Got it' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}
