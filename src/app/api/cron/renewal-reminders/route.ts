/**
 * GET /api/cron/renewal-reminders
 *
 * Runs daily (Vercel Cron). Does two things:
 *   1. Email subscribers whose plan expires in 2–4 days, asking them to
 *      renew with a one-tap link. Skips users who've already been reminded
 *      in the last 7 days, or who've cancelled auto-renew.
 *   2. Downgrade any plan that's now past expiry (plan_status='active' but
 *      plan_expires_at < now) to 'free'. This is the closing of the loop —
 *      since we can't silently auto-charge on Lipila, "didn't renew" = "no
 *      access".
 *
 * Auth: requires CRON_SECRET in the Authorization header. Vercel Cron sets
 * this automatically on production runs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, renewalReminderEmail } from '@/lib/email'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface DueProfile {
  id:                  string
  email:               string
  full_name:           string | null
  plan:                string
  plan_expires_at:     string
}

async function sendRenewalEmail(p: DueProfile): Promise<boolean> {
  const days = Math.max(
    0,
    Math.ceil((new Date(p.plan_expires_at).getTime() - Date.now()) / 86_400_000),
  )
  // Customer-facing renewal reminder, Resend account channel (from support@).
  return sendEmail(renewalReminderEmail(p.email, p.full_name, p.plan, days), 'account')
}

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron sets `Authorization: Bearer <CRON_SECRET>` automatically.
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const now      = new Date()
  const in2days  = new Date(now.getTime() + 2 * 86_400_000).toISOString()
  const in4days  = new Date(now.getTime() + 4 * 86_400_000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()

  // ── 1. Reminder pass ────────────────────────────────────────────────────
  // Active subscribers, auto-renew on, expiring in the next 2-4 days,
  // and either never reminded or last reminded more than a week ago.
  const { data: due, error: dueErr } = await service
    .from('profiles')
    .select('id, email, full_name, plan, plan_expires_at, renewal_reminded_at, auto_renew_enabled')
    .eq('plan_status', 'active')
    .eq('auto_renew_enabled', true)
    .gte('plan_expires_at', in2days)
    .lte('plan_expires_at', in4days)

  if (dueErr) {
    console.error('[cron] reminder query failed:', dueErr)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  const toRemind = (due ?? []).filter((p) =>
    !p.renewal_reminded_at || p.renewal_reminded_at < sevenDaysAgo
  )

  let remindersSent = 0
  for (const p of toRemind) {
    const ok = await sendRenewalEmail(p as DueProfile)
    if (ok) {
      remindersSent++
      await service
        .from('profiles')
        .update({ renewal_reminded_at: now.toISOString() })
        .eq('id', p.id)
    }
  }

  // ── 2. Expiry sweep ─────────────────────────────────────────────────────
  // Plans that have actually passed their expiry → downgrade to free.
  const { data: expired, error: expErr } = await service
    .from('profiles')
    .select('id, plan, plan_expires_at')
    .eq('plan_status', 'active')
    .lt('plan_expires_at', now.toISOString())

  if (expErr) {
    console.error('[cron] expiry query failed:', expErr)
  }

  let expiredCount = 0
  if (expired && expired.length > 0) {
    const ids = expired.map((p) => p.id)
    const { error: upErr } = await service
      .from('profiles')
      .update({ plan_status: 'free', auto_renew_enabled: false })
      .in('id', ids)
    if (upErr) console.error('[cron] expiry update failed:', upErr)
    else       expiredCount = ids.length
  }

  return NextResponse.json({
    ok: true,
    checked_at: now.toISOString(),
    reminders_sent: remindersSent,
    reminder_candidates: toRemind.length,
    expired_downgraded: expiredCount,
  })
}
