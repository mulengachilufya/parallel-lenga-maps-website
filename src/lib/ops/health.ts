// src/lib/ops/health.ts
//
// Health checks, each in plain language: what was tested, whether it's
// fine, and exactly what to do if not. Used by the ops console, the daily
// report and (in a reduced form, no details) the public /api/ops/ping that
// the GitHub uptime watch calls every 12 hours.

import { listFiles } from '@/lib/r2'
import { opsDb } from './log'

export type Status = 'ok' | 'warn' | 'fail'
export interface Check { id: string; name: string; status: Status; summary: string; fix?: string; ms?: number }

async function timed<T>(fn: () => Promise<T>): Promise<{ v?: T; err?: string; ms: number }> {
  const t = Date.now()
  try {
    const v = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timed out after 8 s')), 8000))])
    return { v, ms: Date.now() - t }
  } catch (e) { return { err: e instanceof Error ? e.message : String(e), ms: Date.now() - t } }
}

const VERCEL_ENV = 'Vercel → your project → Settings → Environment Variables'
const REDEPLOY = 'then redeploy (Vercel → Deployments → ⋯ on the latest → Redeploy)'

/** The two checks that decide "is the site up": database and sign-in. */
export async function coreChecks(): Promise<Check[]> {
  const out: Check[] = []
  const d = await timed(async () => {
    const { error } = await opsDb().from('profiles').select('id', { head: true, count: 'exact' }).limit(1)
    if (error) throw new Error(error.message)
  })
  out.push(d.err
    ? { id: 'database', name: 'Database', status: 'fail', ms: d.ms, summary: `The database did not answer (${d.err}). Nobody can sign in, download or use projects.`,
        fix: 'Open supabase.com → your project. If it says "Paused", press Restore. If Supabase shows an incident, wait for it to clear (status.supabase.com).' }
    : { id: 'database', name: 'Database', status: d.ms > 3000 ? 'warn' : 'ok', ms: d.ms, summary: d.ms > 3000 ? `Working, but slow (${d.ms} ms).` : `Working (${d.ms} ms).` })

  const a = await timed(async () => {
    const { error } = await opsDb().auth.admin.listUsers({ page: 1, perPage: 1 })
    if (error) throw new Error(error.message)
  })
  out.push(a.err
    ? { id: 'auth', name: 'Sign-in service', status: 'fail', ms: a.ms, summary: `Sign-in is not working (${a.err}). People can't log in.`,
        fix: 'Check status.supabase.com. You can still get into this console with an emergency key.' }
    : { id: 'auth', name: 'Sign-in service', status: 'ok', ms: a.ms, summary: 'Working.' })
  return out
}

export async function runHealthChecks(): Promise<Check[]> {
  const out = await coreChecks()
  const db = opsDb()

  // Dataset files on Cloudflare R2
  const r = await timed(async () => { await listFiles('', 1) })
  out.push(r.err
    ? { id: 'files', name: 'Dataset files (Cloudflare R2)', status: 'fail', ms: r.ms, summary: `Can't reach the dataset files (${r.err}). Downloads and maps won't load.`,
        fix: `Log in to dash.cloudflare.com → R2 and check the bucket exists and the API token is active. If you made a new token, update CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_SECRET_ACCESS_KEY in ${VERCEL_ENV}, ${REDEPLOY}.` }
    : { id: 'files', name: 'Dataset files (Cloudflare R2)', status: 'ok', ms: r.ms, summary: 'Reachable.' })

  // Email
  const keys: [string, string | undefined][] = [
    ['account emails', process.env.RESEND_NEW_USER_API_KEY], ['payment emails', process.env.RESEND_PAYMENTS_API_KEY],
    ['bank-detail emails', process.env.RESEND_MANUAL_PAYMENTS_API_KEY], ['newsletter', process.env.RESEND_NEWSLETTER_API_KEY],
  ]
  const missing = keys.filter(([, k]) => !k).map(([n]) => n)
  const e = await timed(async () => {
    const key = keys.find(([, k]) => k)?.[1]
    if (!key) throw new Error('no email keys at all')
    const res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } })
    if (res.status === 401 || res.status === 403) throw new Error('the email key was rejected')
    if (!res.ok && res.status !== 405) throw new Error(`Resend answered ${res.status}`)
  })
  out.push(e.err
    ? { id: 'email', name: 'Email sending (Resend)', status: 'fail', ms: e.ms, summary: `Emails can't be sent (${e.err}).`,
        fix: `Log in to resend.com: check the lengamaps.com domain is verified and make a new API key if needed. Put it in ${VERCEL_ENV} (RESEND_… keys), ${REDEPLOY}.` }
    : missing.length
      ? { id: 'email', name: 'Email sending (Resend)', status: 'warn', ms: e.ms, summary: `Working, but these have no key and are skipped: ${missing.join(', ')}.`, fix: `Add the missing RESEND_… keys in ${VERCEL_ENV}.` }
      : { id: 'email', name: 'Email sending (Resend)', status: 'ok', ms: e.ms, summary: 'Working. Use "Send a test email" to check your inbox receives them.' })

  // Workspace storage buckets
  const b = await timed(async () => {
    const { data, error } = await db.storage.listBuckets()
    if (error) throw new Error(error.message)
    const names = new Set((data ?? []).map((x) => x.name))
    return ['workspace-uploads', 'workspace-voice'].filter((n) => !names.has(n))
  })
  out.push(b.err || (b.v && b.v.length)
    ? { id: 'buckets', name: 'Project uploads and voice notes', status: 'fail', ms: b.ms, summary: b.err ? `Storage didn't answer (${b.err}).` : `Missing storage: ${b.v!.join(', ')}.`,
        fix: 'This needs a developer: the storage buckets from migrations 032 and 034 must exist in Supabase → Storage.' }
    : { id: 'buckets', name: 'Project uploads and voice notes', status: 'ok', ms: b.ms, summary: 'Storage ready.' })

  // Scheduled jobs
  const { data: runs, error: runsErr } = await db.from('ops_cron_runs').select('job, last_run_at, ok')
  const life = (runs ?? []).find((x) => x.job === 'lifecycle')
  const hours = life ? (Date.now() - new Date(life.last_run_at).getTime()) / 3600_000 : Infinity
  out.push(runsErr
    ? { id: 'jobs', name: 'Daily job (reminders, access expiry)', status: 'warn', summary: "Couldn't check (the database didn't answer)." }
    : !life
    ? { id: 'jobs', name: 'Daily job (reminders, access expiry)', status: 'warn', summary: 'Has not reported a run yet. It runs every morning at 09:00 UTC.', fix: 'Press "Run the daily job now" under Fix.' }
    : !life.ok
      ? { id: 'jobs', name: 'Daily job (reminders, access expiry)', status: 'fail', summary: `The last run failed (${new Date(life.last_run_at).toUTCString()}).`, fix: 'Press "Run the daily job now". The problem log shows why it failed.' }
      : hours > 26
        ? { id: 'jobs', name: 'Daily job (reminders, access expiry)', status: 'warn', summary: `Last ran ${Math.round(hours)} hours ago; it should run daily.`, fix: 'Press "Run the daily job now". Check Vercel → Settings → Cron Jobs is on.' }
        : { id: 'jobs', name: 'Daily job (reminders, access expiry)', status: 'ok', summary: `Last ran ${Math.round(hours)} h ago.` })

  // Customers waiting on you
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const { count: waiting, error: payErr } = await db.from('manual_payments').select('id', { head: true, count: 'exact' }).eq('status', 'pending').lt('created_at', dayAgo)
  out.push(payErr
    ? { id: 'payments', name: 'Payments waiting for you', status: 'warn', summary: "Couldn't check (the database didn't answer)." }
    : waiting
    ? { id: 'payments', name: 'Payments waiting for you', status: 'warn', summary: `${waiting} payment${waiting === 1 ? ' has' : 's have'} waited more than a day for approval.`, fix: 'Open Admin → Payments and approve or reject them.' }
    : { id: 'payments', name: 'Payments waiting for you', status: 'ok', summary: 'Nothing older than a day.' })

  // Problems logged
  const { data: open, error: openErr } = await db.from('ops_events').select('level').is('resolved_at', null).gte('last_at', dayAgo)
  const crit = (open ?? []).filter((x) => x.level === 'critical' || x.level === 'error').length
  out.push(openErr
    ? { id: 'problems', name: 'Problems in the last 24 hours', status: 'warn', summary: "Couldn't read the problem log (the database didn't answer)." }
    : crit
    ? { id: 'problems', name: 'Problems in the last 24 hours', status: 'warn', summary: `${crit} unresolved problem${crit === 1 ? '' : 's'}. See the Problems tab.` }
    : { id: 'problems', name: 'Problems in the last 24 hours', status: 'ok', summary: 'No errors logged.' })

  // Configuration
  const need = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CLOUDFLARE_R2_ACCOUNT_ID',
    'CLOUDFLARE_R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_BUCKET_NAME', 'CRON_SECRET']
  const gone = need.filter((k) => !process.env[k])
  out.push(gone.length
    ? { id: 'config', name: 'Settings (environment variables)', status: gone.some((k) => k !== 'CRON_SECRET') ? 'fail' : 'warn',
        summary: `Missing: ${gone.join(', ')}.`, fix: `Add them in ${VERCEL_ENV}, ${REDEPLOY}.${gone.includes('CRON_SECRET') ? ' Without CRON_SECRET the daily job refuses to run.' : ''}` }
    : { id: 'config', name: 'Settings (environment variables)', status: 'ok', summary: 'All required settings are present.' })

  // Emergency keys
  const { data: ek } = await db.from('ops_settings').select('value, updated_at').eq('key', 'emergency_keys').maybeSingle()
  const envCopy = /[0-9a-f]{64}/.test(process.env.OPS_EMERGENCY_KEY_HASHES ?? '')
  out.push(!ek
    ? { id: 'keys', name: 'Emergency keys', status: 'warn', summary: 'Not set up yet. Without them, losing both email accounts means losing access.',
        fix: 'Fix → Emergency keys → Create new keys. Save both, then paste the fingerprint line into Vercel as the page explains.' }
    : !envCopy
      ? { id: 'keys', name: 'Emergency keys', status: 'warn', summary: `Set up ${new Date(ek.updated_at).toDateString()}, but there's no copy in Vercel, so they won't work if the database is down.`,
          fix: `Fix → Emergency keys shows the fingerprint line. Paste it into OPS_EMERGENCY_KEY_HASHES in ${VERCEL_ENV}, ${REDEPLOY}.` }
      : { id: 'keys', name: 'Emergency keys', status: 'ok', summary: `Set up ${new Date(ek.updated_at).toDateString()}, with a copy in Vercel.` })

  return out
}

export function overall(checks: Check[]): Status {
  return checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok'
}
