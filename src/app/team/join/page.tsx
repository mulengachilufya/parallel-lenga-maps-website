'use client'

/**
 * /team/join?token=… — accept a team invitation.
 *
 * The invite email lands here. Signed-out visitors are sent to log in (or
 * sign up) and bounced back; signed-in visitors accept with one click.
 * The server (/api/team/join) enforces everything that matters: token
 * validity, email match, seat cap, one-org-per-user.
 */

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, Users, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const NAVY = '#0D2B45'
const GOLD = '#F5B800'

export default function TeamJoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: NAVY }}>
        <Loader2 size={32} className="animate-spin" style={{ color: GOLD }} />
      </div>
    }>
      <JoinInner />
    </Suspense>
  )
}

function JoinInner() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [phase, setPhase] = useState<'checking' | 'signin' | 'ready' | 'joining' | 'done' | 'error'>('checking')
  const [message, setMessage] = useState('')
  const [orgName, setOrgName] = useState('')
  const [info, setInfo] = useState<{ org_name: string; free: boolean; email: string } | null>(null)
  const here = `/team/join?token=${token}`

  useEffect(() => {
    if (!token) { setPhase('error'); setMessage('This invite link is missing its token. Open the link from your email again.'); return }
    Promise.all([
      fetch(`/api/team/join?token=${encodeURIComponent(token)}`).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) })),
      supabase.auth.getSession(),
    ]).then(([inv, { data: { session } }]) => {
      if (!inv.ok) { setPhase('error'); setMessage(inv.j.message ?? 'This invite is not valid any more.'); return }
      setInfo(inv.j)
      setOrgName(inv.j.org_name)
      setPhase(session ? 'ready' : 'signin')
    }).catch(() => { setPhase('error'); setMessage('Network error. Try the link again.') })
  }, [token])

  async function accept() {
    setPhase('joining')
    try {
      const res = await fetch('/api/team/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setPhase('error'); setMessage(j.message ?? 'Could not accept this invite.'); return }
      setOrgName(j.org_name ?? 'your team')
      setPhase('done')
    } catch {
      setPhase('error'); setMessage('Network error. Try the link again.')
    }
  }

  return (
    <div className="min-h-screen text-white" style={{ background: NAVY }}>
      <div className="h-28" />
      <div className="max-w-md mx-auto px-4 text-center">
        {phase === 'checking' && <Loader2 size={32} className="animate-spin mx-auto" style={{ color: GOLD }} />}

        {phase === 'signin' && info && (
          <>
            <Users size={40} className="mx-auto" style={{ color: GOLD }} />
            <h1 className="mt-5 text-2xl font-extrabold">Join {info.org_name} on Lenga Maps</h1>
            <p className="mt-3 text-sm leading-relaxed text-blue-200">
              You were invited as <strong className="text-white">{info.email}</strong>. Create your free
              account with that address, or sign in if you already have one. You will come straight back here.
            </p>
            <div className="mt-7 flex flex-col gap-3">
              <Link
                href={`/signup?email=${encodeURIComponent(info.email)}&next=${encodeURIComponent(here)}`}
                className="rounded-xl px-8 py-3.5 text-sm font-bold"
                style={{ background: GOLD, color: '#1a1200' }}
              >
                Create my account
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(here)}`}
                className="rounded-xl px-8 py-3.5 text-sm font-bold border border-blue-700 text-white"
              >
                I already have an account
              </Link>
            </div>
          </>
        )}

        {phase === 'ready' && (
          <>
            <Users size={40} className="mx-auto" style={{ color: GOLD }} />
            <h1 className="mt-5 text-2xl font-extrabold">Join {info?.org_name ?? 'your team'} on Lenga Maps</h1>
            <p className="mt-3 text-sm leading-relaxed text-blue-200">
              {info?.free
                ? 'You get the team\'s shared GIS workspace and its 3 datasets. Free, no card needed.'
                : 'Accepting takes one of your team\'s seats and unlocks every dataset across all 54 African countries, plus the shared GIS workspace.'}
            </p>
            <button
              onClick={accept}
              className="mt-7 rounded-xl px-8 py-3.5 text-sm font-bold"
              style={{ background: GOLD, color: '#1a1200' }}
            >
              Accept invitation
            </button>
          </>
        )}

        {phase === 'joining' && (
          <>
            <Loader2 size={32} className="animate-spin mx-auto" style={{ color: GOLD }} />
            <p className="mt-4 text-sm text-blue-200">Taking your seat…</p>
          </>
        )}

        {phase === 'done' && (
          <>
            <CheckCircle2 size={44} className="mx-auto" style={{ color: GOLD }} />
            <h1 className="mt-5 text-2xl font-extrabold">Welcome to {orgName}</h1>
            <p className="mt-3 text-sm leading-relaxed text-blue-200">
              You are in. Open the workspace to see your team&apos;s projects and maps.
            </p>
            <Link
              href="/workspace"
              className="mt-7 inline-block rounded-xl px-8 py-3.5 text-sm font-bold"
              style={{ background: GOLD, color: '#1a1200' }}
            >
              Open the team workspace
            </Link>
          </>
        )}

        {phase === 'error' && (
          <>
            <AlertTriangle size={40} className="mx-auto text-amber-400" />
            <h1 className="mt-5 text-xl font-extrabold">Can&apos;t accept this invite</h1>
            <p className="mt-3 text-sm leading-relaxed text-blue-200">{message}</p>
            <p className="mt-5 text-xs text-blue-400">
              Wrong account? Sign out, then sign in with the address the invite was sent
              to. Still stuck? Email <a className="underline" href="mailto:lengamaps@gmail.com">lengamaps@gmail.com</a>.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
