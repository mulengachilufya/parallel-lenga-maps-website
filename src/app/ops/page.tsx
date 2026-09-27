'use client'

/**
 * /ops — the owner's control room. Works in three situations:
 *   - signed in with an owner/admin email (normal case),
 *   - signed out, with an emergency key (email lost, sign-in broken),
 *   - on a phone: everything stacks.
 * Deliberately plain: no maps, no heavy libraries, so it keeps working
 * when other parts of the site are broken.
 */

import { useCallback, useEffect, useState } from 'react'

type Status = 'ok' | 'warn' | 'fail'
interface Check { id: string; name: string; status: Status; summary: string; fix?: string; ms?: number }
interface Problem {
  id: number; level: string; area: string; area_label: string; code: string; message: string; count: number
  first_at: string; last_at: string; detail: Record<string, unknown>; explain: { title: string; impact: string; fix: string }
}
interface AuditRow { id: number; at: string; actor: string; via: string; action: string; target: string | null; ok: boolean }
interface Overview {
  you: { actor: string; via: string }; status: Status; checks: Check[]; problems: Problem[]; audit: AuditRow[]
  settings: { banner?: { text: string }; maintenance?: { on: boolean; message?: string }; emergency_keys?: { hashes: string[]; created_at: string; by: string } }
  jobs: { job: string; last_run_at: string; ok: boolean }[]
}

const DOT: Record<Status, string> = { ok: '#2e8540', warn: '#d98c00', fail: '#c0392b' }
const WORD: Record<Status, string> = { ok: 'Everything is working', warn: 'Working, with things to look at', fail: 'Something is broken' }
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function OpsPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [state, setState] = useState<'loading' | 'in' | 'out' | 'error'>('loading')
  const [tab, setTab] = useState<'health' | 'problems' | 'fix' | 'log' | 'help'>('health')

  const load = useCallback(async () => {
    const res = await fetch('/api/ops/overview', { cache: 'no-store' }).catch(() => null)
    if (!res) { setState('error'); return }
    if (res.status === 403) { setState('out'); return }
    if (!res.ok) { setState('error'); return }
    setData(await res.json()); setState('in')
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <div className="ops">
      <style>{CSS}</style>
      <header>
        <b>Lenga Maps · Ops</b>
        {data && <span className="who">Signed in as {data.you.actor}{data.you.via === 'emergency-key' ? ' (emergency access, 8 hours)' : ''}</span>}
        <span style={{ flex: 1 }} />
        <a href="/admin">Admin panel</a>
        {data?.you.via === 'emergency-key' && <button className="link" onClick={async () => { await fetch('/api/ops/logout', { method: 'POST' }); location.reload() }}>Lock</button>}
      </header>

      {state === 'loading' && <main><p>Checking everything…</p></main>}
      {state === 'error' && <main><h1>The ops console can&apos;t reach the server</h1><p>The website itself may be down. Use the backup tools in GitHub instead: see the runbook (docs/RUNBOOK.md in the repository), section &ldquo;When the website is down&rdquo;.</p></main>}
      {state === 'out' && <Login onIn={load} />}

      {state === 'in' && data && (
        <main>
          <div className={`banner ${data.status}`}>
            <span className="dot" style={{ background: DOT[data.status] }} /> {WORD[data.status]}
            <button className="link" style={{ marginLeft: 'auto' }} onClick={() => { setState('loading'); void load() }}>Check again</button>
          </div>
          {data.settings.maintenance?.on && <div className="note">Maintenance mode is ON: customers see a &ldquo;back soon&rdquo; page. Turn it off under Fix.</div>}
          <nav>
            {(['health', 'problems', 'fix', 'log', 'help'] as const).map((t) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t === 'health' ? 'Health' : t === 'problems' ? `Problems${data.problems.length ? ` (${data.problems.length})` : ''}` : t === 'fix' ? 'Fix' : t === 'log' ? 'Who did what' : 'Help'}
              </button>
            ))}
          </nav>
          {tab === 'health' && <Health checks={data.checks} />}
          {tab === 'problems' && <Problems problems={data.problems} reload={load} />}
          {tab === 'fix' && <Fix settings={data.settings} reload={load} via={data.you.via} />}
          {tab === 'log' && <Log rows={data.audit} />}
          {tab === 'help' && <Help />}
        </main>
      )}
    </div>
  )
}

function Login({ onIn }: { onIn: () => void }) {
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <main style={{ maxWidth: 520 }}>
      <h1>Owner access</h1>
      <p><b>Normal way:</b> <a href="/login?next=/ops">sign in</a> with <b>cmulenga672@gmail.com</b> or <b>lengamaps@gmail.com</b>, then come back here.</p>
      <p><b>Emergency way</b> (lost email access, sign-in broken): type one of your emergency keys.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('')
        const res = await fetch('/api/ops/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }).catch(() => null)
        const d = await res?.json().catch(() => ({})) ?? {}
        if (res?.ok) onIn(); else { setErr(d.error ?? 'Could not reach the server.'); setBusy(false) }
      }}>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="LENGA-XXXXX-XXXXX-…" autoComplete="off" spellCheck={false} style={{ width: '100%', fontFamily: 'monospace' }} />
        <button disabled={!key || busy} style={{ marginTop: 8 }}>{busy ? 'Checking…' : 'Open with emergency key'}</button>
        {err && <p className="err">{err}</p>}
      </form>
      <p className="muted">Every use of an emergency key is emailed to both owner addresses. Five wrong tries in an hour locks that network out.</p>
    </main>
  )
}

function Health({ checks }: { checks: Check[] }) {
  return (
    <section>
      <p className="muted">Each line is a live test run just now. Anything orange or red says what to do.</p>
      {checks.map((c) => (
        <div key={c.id} className="check">
          <span className="dot" style={{ background: DOT[c.status] }} />
          <div>
            <b>{c.name}</b> <span className="muted">{c.ms !== undefined ? `· ${c.ms} ms` : ''}</span>
            <div>{c.summary}</div>
            {c.fix && c.status !== 'ok' && <div className="fix"><b>What to do:</b> {c.fix}</div>}
          </div>
        </div>
      ))}
    </section>
  )
}

function Problems({ problems, reload }: { problems: Problem[]; reload: () => void }) {
  const [open, setOpen] = useState<number | null>(null)
  async function resolve(body: Record<string, unknown>) {
    await fetch('/api/ops/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve_problem', ...body }) })
    reload()
  }
  if (!problems.length) return <section><p>No open problems. Anything that goes wrong on the site appears here, explained, and serious ones are emailed to you straight away.</p></section>
  return (
    <section>
      <p className="muted">Newest first. The same problem happening again adds to its count instead of a new line. Mark it dealt with once you&apos;ve handled it.
        {' '}<button className="link" onClick={() => { if (confirm('Mark every problem as dealt with?')) void resolve({ all: true }) }}>Mark all dealt with</button></p>
      {problems.map((p) => (
        <div key={p.id} className={`problem ${p.level}`}>
          <div className="row" onClick={() => setOpen(open === p.id ? null : p.id)}>
            <span className={`lvl ${p.level}`}>{p.level === 'critical' ? 'Urgent' : p.level === 'error' ? 'Error' : p.level === 'warn' ? 'Warning' : 'Info'}</span>
            <b>{p.explain.title}</b>
            <span className="muted">· {p.area_label} · {p.count}× · last {when(p.last_at)}</span>
          </div>
          {open === p.id && (
            <div className="body">
              <p><b>What happened:</b> {p.message}</p>
              <p><b>Who is affected:</b> {p.explain.impact}</p>
              <p><b>What to do:</b> {p.explain.fix}</p>
              <details><summary>Technical details (safe to send to a developer)</summary><pre>{JSON.stringify({ code: `${p.area}:${p.code}`, first: p.first_at, last: p.last_at, ...p.detail }, null, 2)}</pre></details>
              <button onClick={() => void resolve({ id: p.id })}>Mark dealt with</button>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

function Tool({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return <div className="tool"><b>{title}</b><p className="muted">{help}</p>{children}</div>
}

function Fix({ settings, reload, via }: { settings: Overview['settings']; reload: () => void; via: string }) {
  const [email, setEmail] = useState('')
  const [months, setMonths] = useState('3')
  const [plan, setPlan] = useState('individual')
  const [banner, setBanner] = useState(settings.banner?.text ?? '')
  const [maint, setMaint] = useState(settings.maintenance?.message ?? 'We are making improvements and will be back shortly.')
  const [out, setOut] = useState<{ ok: boolean; message: string; data?: unknown } | null>(null)
  const [busy, setBusy] = useState('')

  async function run(action: string, input: Record<string, unknown> = {}, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return
    setBusy(action); setOut(null)
    const res = await fetch('/api/ops/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...input }) }).catch(() => null)
    const d = await res?.json().catch(() => null)
    setOut(d ?? { ok: false, message: 'Could not reach the server.' })
    setBusy('')
    if (['set_banner', 'set_maintenance'].includes(action)) reload()
  }
  const b = (action: string, label: string, input: Record<string, unknown> = {}, confirmText?: string, needsEmail = true) => (
    <button disabled={!!busy || (needsEmail && !email.includes('@'))} onClick={() => void run(action, { email, ...input }, confirmText)}>{busy === action ? 'Working…' : label}</button>
  )

  return (
    <section>
      {out && (
        <div className={`result ${out.ok ? 'ok' : 'bad'}`}>
          {out.message}
          {out.data !== undefined && out.data !== null && (
            <table>{Object.entries(out.data as Record<string, unknown>).map(([k, v]) => <tr key={k}><td>{k}</td><td>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>)}</table>
          )}
        </div>
      )}

      <EmergencyKeys saved={settings.emergency_keys} via={via} reload={reload} />

      <Tool title="A customer" help="Type their email, then pick what to do. Look them up first if you're not sure what's wrong.">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" type="email" style={{ width: '100%', maxWidth: 360 }} />
        <div className="btns">
          {b('lookup_user', 'Look up')}
          {b('confirm_email', '"I can\'t sign in": confirm their email')}
          {b('send_login_link', 'Email them a sign-in link')}
          {b('send_password_reset', 'Email them a password reset')}
        </div>
        <div className="btns">
          <select value={plan} onChange={(e) => setPlan(e.target.value)}><option value="individual">Individual</option><option value="team">Team</option></select>
          <select value={months} onChange={(e) => setMonths(e.target.value)}>
            <option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option><option value="0">Permanent</option>
          </select>
          {b('grant_access', 'Give access', { plan, months: Number(months) }, `Give ${email} ${plan} access for ${months === '0' ? 'ever' : `${months} months`}?`)}
          {b('revoke_access', 'Remove paid access', {}, `Remove paid access from ${email}?`)}
          {b('extend_team', 'Renew their whole team +3 months', {}, `Add 3 months for every member of ${email}'s team?`)}
        </div>
        <div className="btns">
          {b('reset_messages_key', 'Reset their secure messages', {}, `Reset secure messages for ${email}? Their old direct messages become unreadable forever.`)}
          {b('reset_free_datasets', 'Let them re-choose free datasets', {}, `Clear ${email}'s 3 free datasets so they can choose again? (Also their free team's, if they own one.)`)}
        </div>
      </Tool>

      <Tool title="Email" help="Sends a test on every email channel to your inbox, and tells you which ones work.">
        <div className="btns">{b('send_test_email', 'Send a test email', {}, undefined, false)}{b('send_report_now', 'Email me the health report now', {}, undefined, false)}</div>
      </Tool>

      <Tool title="Scheduled jobs" help="The daily job sends expiry reminders and switches off expired plans. Run it by hand if it's been missed.">
        <div className="btns">{b('run_daily_job', 'Run the daily job now', {}, undefined, false)}</div>
      </Tool>

      <Tool title="&ldquo;Too many attempts&rdquo;" help="If a real person is blocked from the contact form, sign-up or quotes after several tries, clear the blocks.">
        <div className="btns">{b('clear_rate_limits', 'Clear all blocks', {}, undefined, false)}</div>
      </Tool>

      <Tool title="Announcement banner" help="A short message across the top of every page, e.g. 'Payments are delayed today.' Leave empty to remove.">
        <input value={banner} onChange={(e) => setBanner(e.target.value)} maxLength={300} style={{ width: '100%' }} placeholder="Message for all visitors" />
        <div className="btns">{b('set_banner', banner.trim() ? 'Show banner' : 'Remove banner', { text: banner }, undefined, false)}</div>
      </Tool>

      <Tool title="Maintenance mode" help="Shows visitors a 'back soon' page while you or a developer fix something. You can still use /ops, /admin and sign in.">
        <input value={maint} onChange={(e) => setMaint(e.target.value)} maxLength={300} style={{ width: '100%' }} />
        <div className="btns">
          {settings.maintenance?.on
            ? b('set_maintenance', 'Turn maintenance OFF (open the site)', { on: false, message: maint }, undefined, false)
            : b('set_maintenance', 'Turn maintenance ON', { on: true, message: maint }, 'Close the site to visitors until you turn this off?', false)}
        </div>
      </Tool>
    </section>
  )
}

// ── Emergency keys: made in this browser, shown once, only fingerprints leave it ──

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // no 0/O, 1/I: easy to copy by hand
function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(25))
  const raw = Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('')   // 32 divides 256: no bias
  return `LENGA-${raw.match(/.{5}/g)!.join('-')}`
}
async function fingerprint(key: string): Promise<string> {
  const norm = key.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm))
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')
}

function EmergencyKeys({ saved, via, reload }: { saved?: { hashes: string[]; created_at: string; by: string }; via: string; reload: () => void }) {
  const [keys, setKeys] = useState<{ a: string; b: string; ha: string; hb: string } | null>(null)
  const [stored, setStored] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const line = keys ? `${keys.ha},${keys.hb}` : saved?.hashes.join(',') ?? ''

  if (via !== 'console') {
    return <Tool title="Emergency keys" help="You're in with an emergency key. To make new keys, sign in with an owner email; that way a lost key can't be used to lock you out."><span /></Tool>
  }
  return (
    <Tool title="Emergency keys" help="Two keys that open this console without email sign-in, for when you've lost both email accounts or sign-in is broken. They're made here in your browser and shown once. Lenga's server only ever sees fingerprints, so nobody (including a developer or Claude) can recover a lost key: you just make new ones.">
      {!keys && (
        <>
          <p style={{ margin: '0 0 8px' }}>{saved ? <>Keys are set up (made {new Date(saved.created_at).toDateString()} by {saved.by}). Making new ones switches the old ones off.</> : <b>No keys yet.</b>}</p>
          <div className="btns">
            <button disabled={busy} onClick={async () => {
              if (saved && !confirm('Make new keys? The current keys A and B stop working as soon as you turn the new ones on.')) return
              const a = newKey(), b = newKey()
              setKeys({ a, b, ha: await fingerprint(a), hb: await fingerprint(b) }); setStored(false); setMsg('')
            }}>{saved ? 'Make new keys' : 'Create emergency keys'}</button>
          </div>
        </>
      )}
      {keys && (
        <div className="keys">
          <p><b>Write these down now. They are shown only once.</b> Keep A in your password manager and B printed on paper, somewhere safe away from your laptop.</p>
          <div className="keybox"><span>Key A</span><code>{keys.a}</code></div>
          <div className="keybox"><span>Key B</span><code>{keys.b}</code></div>
          <div className="btns">
            <button onClick={() => void navigator.clipboard.writeText(`Lenga Maps emergency keys (open lengamaps.com/ops)\nKey A: ${keys.a}\nKey B: ${keys.b}`)}>Copy both</button>
            <button onClick={() => window.print()}>Print</button>
          </div>
          <label style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" checked={stored} onChange={(e) => setStored(e.target.checked)} /> I have saved both keys somewhere safe</label>
          <div className="btns">
            <button disabled={!stored || busy} onClick={async () => {
              setBusy(true); setMsg('')
              const res = await fetch('/api/ops/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_emergency_keys', hashes: [keys.ha, keys.hb] }) }).catch(() => null)
              const d = await res?.json().catch(() => null)
              setBusy(false)
              if (d?.ok) { setMsg(d.message); setKeys({ ...keys, a: '', b: '' }); reload() } else setMsg(d?.message ?? 'Could not save.')
            }}>{busy ? 'Saving…' : 'Turn these keys on'}</button>
            <button className="link" onClick={() => { setKeys(null); setMsg('') }}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.startsWith('The new keys') ? '' : 'err'}>{msg}</p>}
      {line && (!keys || !keys.a) && (
        <details style={{ marginTop: 8 }} open={!!keys}>
          <summary><b>Also save a copy in Vercel</b> (so the keys work even if the database is down)</summary>
          <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li>Copy this fingerprint line (it is not a key and can&apos;t be used to get in):
              <div className="keybox"><code style={{ fontSize: 12, wordBreak: 'break-all' }}>{line}</code></div>
              <button onClick={() => void navigator.clipboard.writeText(line)}>Copy fingerprint line</button></li>
            <li>vercel.com → the lenga maps project → Settings → Environment Variables → <b>OPS_EMERGENCY_KEY_HASHES</b> → Edit → paste → Save.</li>
            <li>Deployments → ⋯ on the latest → Redeploy.</li>
          </ol>
        </details>
      )}
    </Tool>
  )
}

function Log({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <section><p>No actions yet. Everything done from here or the emergency tools is recorded, with who did it.</p></section>
  return (
    <section>
      <table className="log">
        <thead><tr><th>When</th><th>Who</th><th>Did</th><th>To</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td>{when(r.at)}</td><td>{r.actor}<div className="muted">{r.via}</div></td><td>{r.action.replace(/_/g, ' ')}</td><td>{r.target ?? '—'}</td><td>{r.ok ? '✓' : '✗'}</td></tr>
        ))}</tbody>
      </table>
    </section>
  )
}

function Help() {
  return (
    <section className="help">
      <h2>Ways in (keep more than one working)</h2>
      <ol>
        <li><b>Your email:</b> sign in at lengamaps.com/login with cmulenga672@gmail.com or lengamaps@gmail.com. Both are permanent owners in the code itself, so no setting can remove them.</li>
        <li><b>Emergency keys A and B:</b> make them under Fix → Emergency keys (your browser creates them; nobody else ever sees them). Then open lengamaps.com/ops and type a key: it works even if both email accounts are lost or sign-in is broken. Keep A in a password manager and B printed, somewhere safe away from your laptop.</li>
        <li><b>GitHub:</b> if the website itself is down, the Actions tab of the repository has &ldquo;Emergency&rdquo; buttons that act directly on the database (see the runbook).</li>
        <li><b>The services themselves:</b> Supabase (data and sign-in), Vercel (the website), Cloudflare (dataset files), Resend (emails), GitHub (the code). Make both of your emails owners of each, with two-step verification on.</li>
      </ol>
      <h2>Common problems</h2>
      <dl>
        <dt>&ldquo;A customer paid but can&apos;t download&rdquo;</dt><dd>Fix → type their email → Look up. If Access says free, approve their payment in Admin → Payments, or use Give access.</dd>
        <dt>&ldquo;I never got the confirmation email / can&apos;t sign in&rdquo;</dt><dd>Fix → Confirm their email, then Email them a sign-in link.</dd>
        <dt>&ldquo;Nobody is getting emails&rdquo;</dt><dd>Fix → Send a test email. Then Health → Email says what to do.</dd>
        <dt>The site shows errors after an update</dt><dd>Vercel → Deployments → the last one that worked → ⋯ → Promote to Production. That rolls the website back in about a minute; the database is not touched.</dd>
        <dt>You need a few minutes to fix something</dt><dd>Fix → Maintenance mode ON. Turn it off when done.</dd>
      </dl>
      <p className="muted">The full runbook, including what to do when the website is completely down, is docs/RUNBOOK.md in the repository.</p>
    </section>
  )
}

const CSS = `
.ops { min-height: 100vh; background: #f6f5f1; color: #1f2326; font: 15px/1.55 -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
.ops header { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; padding: 10px 18px; background: #0d2b45; color: #fff; }
.ops header a, .ops header .link { color: #cfe0f0; }
.ops .who { color: #b7c7d6; font-size: 13px; }
.ops main { max-width: 900px; margin: 0 auto; padding: 18px 16px 60px; }
.ops h1 { font-size: 22px; margin: 6px 0 12px; }
.ops h2 { font-size: 17px; margin: 18px 0 6px; }
.ops .muted { color: #6b7075; font-size: 13px; }
.ops .err { color: #b3261e; }
.ops input, .ops select { font: inherit; padding: 7px 9px; border: 1px solid #b9bcc0; border-radius: 4px; background: #fff; }
.ops button { font: inherit; padding: 7px 12px; border: 1px solid #0d2b45; background: #0d2b45; color: #fff; border-radius: 4px; cursor: pointer; }
.ops button:disabled { opacity: .45; cursor: default; }
.ops button.link { background: none; border: 0; padding: 0; color: #1d5a9a; text-decoration: underline; }
.ops .banner { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; padding: 12px 14px; border-radius: 6px; background: #fff; border: 1px solid #ddd; }
.ops .banner.fail { background: #fdecea; border-color: #f0b4ad; } .ops .banner.warn { background: #fff5e0; border-color: #f1d18a; } .ops .banner.ok { background: #eaf6ec; border-color: #b7dfbf; }
.ops .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex: none; margin-top: 6px; }
.ops .note { margin-top: 10px; padding: 9px 12px; background: #fff5e0; border: 1px solid #f1d18a; border-radius: 6px; }
.ops nav { display: flex; gap: 4px; margin: 16px 0 10px; flex-wrap: wrap; }
.ops nav button { background: #fff; color: #1f2326; border-color: #c9ccd0; }
.ops nav button.on { background: #0d2b45; color: #fff; border-color: #0d2b45; }
.ops .check { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #e3e3e0; }
.ops .fix { margin-top: 4px; color: #7a4600; background: #fff8e8; padding: 6px 9px; border-radius: 4px; }
.ops .problem { background: #fff; border: 1px solid #e0e0dc; border-left: 4px solid #aaa; border-radius: 4px; margin-bottom: 6px; }
.ops .problem.critical { border-left-color: #c0392b; } .ops .problem.error { border-left-color: #e0662b; } .ops .problem.warn { border-left-color: #d98c00; }
.ops .problem .row { padding: 9px 12px; cursor: pointer; display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.ops .problem .body { padding: 0 12px 12px; }
.ops .problem pre { background: #f2f2ef; padding: 8px; overflow: auto; font-size: 12px; }
.ops .lvl { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; background: #eee; }
.ops .lvl.critical { background: #c0392b; color: #fff; } .ops .lvl.error { background: #e0662b; color: #fff; } .ops .lvl.warn { background: #f3c552; }
.ops .tool { background: #fff; border: 1px solid #e0e0dc; border-radius: 6px; padding: 12px 14px; margin-bottom: 10px; }
.ops .tool p { margin: 2px 0 8px; }
.ops .btns { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.ops .result { padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; }
.ops .result.ok { background: #eaf6ec; border: 1px solid #b7dfbf; } .ops .result.bad { background: #fdecea; border: 1px solid #f0b4ad; }
.ops .result table { margin-top: 8px; border-collapse: collapse; font-size: 13px; }
.ops .result td { padding: 3px 12px 3px 0; vertical-align: top; } .ops .result td:first-child { color: #555; white-space: nowrap; }
.ops table.log { width: 100%; border-collapse: collapse; background: #fff; font-size: 13px; }
.ops table.log th, .ops table.log td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e6e6e2; vertical-align: top; }
.ops .keybox { display: flex; gap: 10px; align-items: center; background: #f2f2ef; border: 1px solid #ddd; padding: 8px 10px; border-radius: 4px; margin: 6px 0; }
.ops .keybox span { font-weight: 700; width: 50px; }
.ops .keybox code { font-size: 17px; letter-spacing: .04em; }
@media print { .ops header, .ops nav, .ops .banner, .ops .tool:not(:has(.keys)), .ops .btns, .ops label { display: none !important; } }
.ops .help dt { font-weight: 600; margin-top: 10px; } .ops .help dd { margin: 2px 0 0 0; }
`
