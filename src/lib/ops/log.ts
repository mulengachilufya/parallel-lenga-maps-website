// src/lib/ops/log.ts
//
// The problem log. Call logEvent() wherever something goes wrong (or is
// worth the owner knowing about). It never throws and never slows the
// request down meaningfully: one RPC, and an email only for 'critical'.
//
// Repeats of the same problem fold into one row (same fingerprint) with a
// count, so the owner sees "Emails to customers are failing, 14 times since
// 09:10" rather than 14 rows.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type OpsLevel = 'info' | 'warn' | 'error' | 'critical'

let client: SupabaseClient | null = null
function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  client ??= createClient(url, key, { auth: { persistSession: false } })
  return client
}
export function opsDb(): SupabaseClient {
  const c = db()
  if (!c) throw new Error('Supabase is not configured')
  return c
}

const ALERT_EVERY_MS = 6 * 3600_000

/** Strip anything that looks like a secret or a person's data out of free text. */
export function scrub(s: string): string {
  return s
    .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}/g, '[token]')
    .replace(/\b(sk|re|pk)_[A-Za-z0-9_]{12,}\b/g, '[key]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => `${m.slice(0, 2)}…@${m.split('@')[1]}`)
    .slice(0, 1000)
}

export async function logEvent(
  level: OpsLevel, area: string, code: string, message: string,
  detail: Record<string, unknown> = {}, fingerprint?: string,
): Promise<void> {
  try {
    const c = db()
    if (!c) { console.error('[ops]', level, area, code, message); return }
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(detail)) clean[k] = typeof v === 'string' ? scrub(v) : v
    const { data } = await c.rpc('ops_log', {
      p_fingerprint: fingerprint ?? `${area}:${code}`,
      p_level: level, p_area: area, p_code: code, p_message: scrub(message), p_detail: clean,
    })
    const row = data as { id: number; alerted_at: string | null } | null
    if (level === 'critical' && row && (!row.alerted_at || Date.now() - new Date(row.alerted_at).getTime() > ALERT_EVERY_MS)) {
      await c.from('ops_events').update({ alerted_at: new Date().toISOString() }).eq('id', row.id)
      const { sendOpsAlert } = await import('./alerts')
      await sendOpsAlert(area, code, message)
    }
  } catch (e) {
    console.error('[ops] could not log', area, code, e)
  }
}

/** Record that a scheduled job ran. */
export async function recordCron(job: string, ok: boolean, summary: Record<string, unknown>): Promise<void> {
  try {
    await db()?.from('ops_cron_runs').upsert({ job, ok, summary, last_run_at: new Date().toISOString() })
    if (!ok) await logEvent('error', 'jobs', `${job}_failed`, `The scheduled job "${job}" failed.`, summary)
  } catch { /* best effort */ }
}

/** Record an owner action (console, emergency key, GitHub, CLI). */
export async function audit(
  actor: string, via: 'console' | 'emergency-key' | 'github' | 'cli' | 'system',
  action: string, target: string | null, detail: Record<string, unknown> = {}, ok = true,
): Promise<void> {
  try { await db()?.from('ops_audit').insert({ actor, via, action, target, detail, ok }) }
  catch (e) { console.error('[ops] audit failed', e) }
}
