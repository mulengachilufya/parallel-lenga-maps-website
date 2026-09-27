'use client'

/**
 * /request-data — "Tell us what you need and where." A short request form
 * for data we don't list yet, or a ready-made package for a project area.
 * Posts to /api/quotes, so every request lands in Admin → Sales as an
 * organisation that has already replied, and emails the founder.
 */

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, MapPin } from 'lucide-react'

const field = 'w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#F5B800]/70'

export default function RequestDataPage() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const get = (k: string) => String(f.get(k) ?? '').trim()
    setState('sending'); setErr('')
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: get('org_name') || get('contact_name'),
          contact_name: get('contact_name'),
          email: get('email'),
          region: get('area'),
          datasets_interest: get('data'),
          notes: `Data request${get('deadline') ? `. Needed by: ${get('deadline')}` : ''}${get('notes') ? `\n${get('notes')}` : ''}`,
          website: get('website'),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message || 'Could not send your request. Please email lengamaps@gmail.com.')
      setState('sent')
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not send'); setState('idle') }
  }

  return (
    <div className="min-h-screen bg-[#0f1923] text-white">
      <div className="h-24" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 grid lg:grid-cols-5 gap-10">
        <div className="lg:col-span-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F5B800]">Request data</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold leading-tight">Tell us what you need, and where.</h1>
          <p className="mt-4 text-white/70 leading-relaxed">
            Can&apos;t find a layer, need a country we haven&apos;t covered yet, or want everything for one project area
            in a single package? Describe it here. We reply within one working day with what we can supply and when.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-white/80">
            {['A new dataset or a finer resolution', 'A ready-to-use package clipped to your project area', 'Data for a tender, EIA or feasibility study on a deadline'].map((t) => (
              <li key={t} className="flex gap-2.5"><MapPin size={16} className="text-[#F5B800] shrink-0 mt-0.5" />{t}</li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-white/50">
            Just browsing? <Link href="/datasets" className="underline">See what we already have</Link>, or <Link href="/signup" className="underline">sign up free</Link> and choose 3 datasets.
          </p>
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          {state === 'sent' ? (
            <div className="py-10 text-center">
              <CheckCircle2 size={44} className="mx-auto text-[#F5B800]" />
              <h2 className="mt-4 text-xl font-bold">Request received</h2>
              <p className="mt-2 text-sm text-white/70">We&apos;ll email you within one working day. A copy is on its way to your inbox.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
              <div className="grid sm:grid-cols-2 gap-4">
                <input name="contact_name" required maxLength={200} placeholder="Your name" className={field} />
                <input name="email" type="email" required maxLength={200} placeholder="Work email" className={field} />
              </div>
              <input name="org_name" maxLength={200} placeholder="Organisation (optional)" className={field} />
              <input name="area" required maxLength={200} placeholder="Where? Country, province or project area" className={field} />
              <textarea name="data" required rows={3} maxLength={1000} placeholder="What data do you need? e.g. rivers and roads at 1:50,000, land cover for 2024" className={field} />
              <div className="grid sm:grid-cols-2 gap-4">
                <input name="deadline" maxLength={100} placeholder="Needed by (optional)" className={field} />
                <input name="notes" maxLength={1000} placeholder="Anything else (optional)" className={field} />
              </div>
              {err && <p className="text-sm text-red-300">{err}</p>}
              <button disabled={state === 'sending'} className="w-full rounded-xl bg-[#F5B800] py-3.5 text-sm font-bold text-[#1a1200] disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {state === 'sending' ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send my request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
