/**
 * GET /api/cron/lifecycle-emails
 *
 * Runs daily (Vercel Cron).
 *
 *   Dormant-subscriber nudge - active (paid) accounts that signed up more
 *   than 3 days ago and have downloaded exactly zero datasets. Dedup via
 *   nudge_email_sent_at. CTA -> /atlas.
 *
 *   Access periods - paid plans last 3 months (plan_expires_at, and
 *   organizations.access_expires_at for teams). A week before the end the
 *   customer (or team owner) gets one reminder; on expiry the account flips
 *   to plan_status 'free' (plan is kept, so a renewal restores it) and gets
 *   an "ended" email. Rows with no expiry are grandfathered and never touched.
 *   Read-time checks (getUserState / isOrgActive) already refuse expired
 *   access, so this pass is housekeeping and email, not the gate.
 *
 * There is no trial any more. The welcome email is event-driven
 * (init-profile), not here.
 *
 * Auth: requires CRON_SECRET in the Authorization header. Vercel Cron sets
 * this automatically on production runs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, nudgeEmail, accessPeriodEmail } from '@/lib/email'
import { PLANS, type TierSlug } from '@/lib/pricing'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const now = Date.now()
  const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString()

  // Active (paid) accounts, signed up > 3 days ago, never downloaded, not
  // yet nudged.
  const { data: dormant, error: dormErr } = await service
    .from('profiles')
    .select('id, email, full_name, plan_status, downloads_used, created_at, nudge_email_sent_at')
    .eq('plan_status', 'active')
    .eq('downloads_used', 0)
    .lte('created_at', threeDaysAgo)
    .is('nudge_email_sent_at', null)

  if (dormErr) console.error('[lifecycle] dormant query failed:', dormErr)

  let nudgesSent = 0
  for (const p of dormant ?? []) {
    if (!p.email) continue
    const ok = await sendEmail(nudgeEmail(p.email, p.full_name))
    if (ok) {
      nudgesSent++
      await service
        .from('profiles')
        .update({ nudge_email_sent_at: new Date().toISOString() })
        .eq('id', p.id)
    }
  }

  const expiry = await accessPeriods(now)

  return NextResponse.json({
    ok: true,
    ...expiry,
    checked_at: new Date(now).toISOString(),
    nudges_sent: nudgesSent,
    nudge_candidates: (dormant ?? []).length,
  })
}

const WEEK = 7 * 86_400_000

async function accessPeriods(now: number) {
  const nowIso  = new Date(now).toISOString()
  const soonIso = new Date(now + WEEK).toISOString()
  let reminders = 0, lapsed = 0

  // Individuals: reminder a week out, once per period.
  const { data: ending } = await service.from('profiles')
    .select('id, email, full_name, plan, plan_expires_at')
    .eq('plan_status', 'active').neq('plan', 'team')
    .gt('plan_expires_at', nowIso).lte('plan_expires_at', soonIso)
    .is('expiry_reminder_sent_at', null)
  for (const p of ending ?? []) {
    if (!p.email) continue
    const ok = await sendEmail(accessPeriodEmail({
      to: p.email, name: p.full_name, planName: PLANS[p.plan as TierSlug]?.name ?? 'Individual',
      expiresAt: p.plan_expires_at, ended: false,
    }))
    if (ok) {
      reminders++
      await service.from('profiles').update({ expiry_reminder_sent_at: nowIso }).eq('id', p.id)
    }
  }

  // Anyone (team members too) whose period is over: switch off, keep plan.
  const { data: over } = await service.from('profiles')
    .select('id, email, full_name, plan, plan_expires_at')
    .eq('plan_status', 'active').lte('plan_expires_at', nowIso)
  for (const p of over ?? []) {
    await service.from('profiles').update({ plan_status: 'free' }).eq('id', p.id)
    lapsed++
    if (p.plan !== 'team' && p.email) {
      await sendEmail(accessPeriodEmail({
        to: p.email, name: p.full_name, planName: PLANS[p.plan as TierSlug]?.name ?? 'Individual',
        expiresAt: p.plan_expires_at, ended: true,
      }))
    }
  }

  // Teams: the owner hears about it, a week out and on the day.
  const { data: orgs } = await service.from('organizations')
    .select('id, name, contact_email, access_expires_at, expiry_notice_sent')
    .eq('status', 'active').not('access_expires_at', 'is', null).lte('access_expires_at', soonIso)
  for (const o of orgs ?? []) {
    const ended = new Date(o.access_expires_at).getTime() <= now
    const stage = ended ? 'ended' : 'reminder'
    if (!o.contact_email || o.expiry_notice_sent === stage) continue
    const ok = await sendEmail(accessPeriodEmail({
      to: o.contact_email, planName: 'Team', expiresAt: o.access_expires_at, ended, team: o.name,
    }))
    if (ok) {
      reminders++
      await service.from('organizations').update({ expiry_notice_sent: stage }).eq('id', o.id)
    }
  }

  return { expiry_reminders_sent: reminders, access_lapsed: lapsed }
}
