// src/lib/ops/actions.ts
//
// The owner's fix-it tools. Each action is small, safe to repeat, and
// recorded in the audit trail with who did it. Used by the ops console
// (/api/ops/action) and mirrored by scripts/ops-cli.mjs for the GitHub
// emergency workflows.

import { accessExpiry, ACCESS_MONTHS } from '@/lib/pricing'
import { sendEmail, type EmailChannel } from '@/lib/email'
import { runLifecycle } from '@/lib/jobs/lifecycle'
import { audit, opsDb, recordCron } from './log'
import { sendDailyReport } from './report'
import type { OpsActor } from './auth'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ActionResult { ok: boolean; message: string; data?: unknown }

async function findUser(email: string) {
  const db = opsDb()
  const e = email.trim().toLowerCase()
  if (!EMAIL.test(e)) return null
  const { data: profile } = await db.from('profiles').select('*').ilike('email', e).maybeSingle()
  let authUser = null as null | { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null }
  if (profile?.id) {
    const { data } = await db.auth.admin.getUserById(profile.id)
    authUser = data.user ?? null
  } else {
    // Fall back to scanning auth users (small user base).
    for (let page = 1; page <= 10 && !authUser; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 })
      authUser = data.users.find((u) => u.email?.toLowerCase() === e) ?? null
      if (data.users.length < 200) break
    }
  }
  if (!authUser && !profile) return null
  return { id: (authUser?.id ?? profile?.id) as string, email: e, profile, authUser }
}

function simpleEmail(to: string, subject: string, lines: string[], cta?: { label: string; href: string }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  return {
    to, subject,
    text: [...lines, cta ? `\n${cta.label}: ${cta.href}` : ''].join('\n\n'),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}${cta ? `<p><a href="${cta.href}" style="background:#0D2B45;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px">${esc(cta.label)}</a></p>` : ''}<p style="color:#888;font-size:12px">Lenga Maps</p></div>`,
  }
}

export async function runAction(actor: OpsActor, action: string, input: Record<string, unknown>): Promise<ActionResult> {
  const db = opsDb()
  const email = typeof input.email === 'string' ? input.email : ''
  const done = async (r: ActionResult, target: string | null = email || null) => {
    await audit(actor.actor, actor.via, action, target, { ...input, email: undefined }, r.ok)
    return r
  }

  switch (action) {
    case 'lookup_user': {
      const u = await findUser(email)
      if (!u) return { ok: false, message: `No account found for ${email}.` }
      const [{ data: member }, { data: pays }, { data: key }] = await Promise.all([
        db.from('organization_members').select('role, organizations(name, status, access_expires_at, seat_count)').eq('user_id', u.id).maybeSingle(),
        db.from('manual_payments').select('reference, plan, status, amount_usd, submitted_at').eq('user_id', u.id).order('submitted_at', { ascending: false }).limit(5),
        db.from('workspace_user_keys').select('created_at').eq('user_id', u.id).is('retired_at', null).maybeSingle(),
      ])
      const p = u.profile
      return {
        ok: true, message: `Found ${u.email}.`,
        data: {
          'Account created': u.authUser?.created_at ?? p?.created_at,
          'Last signed in': u.authUser?.last_sign_in_at ?? 'never',
          'Email confirmed': u.authUser?.email_confirmed_at ? 'yes' : 'NO (they may be stuck at sign-in: use "Confirm email")',
          'Plan': p?.plan ?? 'none', 'Access': p?.plan_status ?? 'free',
          'Access ends': p?.plan_status === 'active' ? (p?.plan_expires_at ?? 'never (permanent)') : '—',
          'Team': member ? `${(member.organizations as unknown as { name: string })?.name} (${member.role})` : 'none',
          'Free datasets chosen': (p?.free_datasets as string[] | null)?.join(', ') || 'none yet',
          'Secure messages set up': key ? 'yes' : 'no',
          'Recent payments': (pays ?? []).map((x) => `${x.reference} · ${x.plan} · ${x.status}`).join('; ') || 'none',
        },
      }
    }

    case 'grant_access': {
      const u = await findUser(email)
      if (!u) return done({ ok: false, message: `No account found for ${email}. Ask them to sign up first.` })
      const plan = input.plan === 'team' ? 'team' : 'individual'
      const months = Number(input.months)
      const permanent = months === 0
      if (!permanent && ![1, 3, 6, 12].includes(months)) return { ok: false, message: 'Choose 1, 3, 6 or 12 months, or permanent.' }
      let expires: string | null = null
      if (!permanent) {
        const cur = u.profile?.plan_status === 'active' ? u.profile?.plan_expires_at as string | null : null
        const d = new Date(cur && new Date(cur) > new Date() ? cur : Date.now())
        d.setMonth(d.getMonth() + months)
        expires = d.toISOString()
      }
      const { error } = await db.from('profiles').update({ plan, plan_status: 'active', plan_expires_at: expires, expiry_reminder_sent_at: null }).eq('id', u.id)
      if (error) return done({ ok: false, message: `Could not update: ${error.message}` })
      return done({ ok: true, message: `${email} now has ${plan} access ${permanent ? 'permanently' : `until ${new Date(expires!).toDateString()}`}.` })
    }

    case 'revoke_access': {
      const u = await findUser(email)
      if (!u) return done({ ok: false, message: `No account found for ${email}.` })
      const { error } = await db.from('profiles').update({ plan_status: 'free' }).eq('id', u.id)
      return done(error ? { ok: false, message: error.message } : { ok: true, message: `${email} no longer has paid access. Their plan is kept, so "Give access" restores it.` })
    }

    case 'confirm_email': {
      const u = await findUser(email)
      if (!u) return done({ ok: false, message: `No account found for ${email}.` })
      const { error } = await db.auth.admin.updateUserById(u.id, { email_confirm: true })
      return done(error ? { ok: false, message: error.message } : { ok: true, message: `${email} is confirmed and can sign in.` })
    }

    case 'send_login_link':
    case 'send_password_reset': {
      const u = await findUser(email)
      if (!u) return done({ ok: false, message: `No account found for ${email}.` })
      const type = action === 'send_login_link' ? 'magiclink' : 'recovery'
      const { data, error } = await db.auth.admin.generateLink({
        type, email: u.email,
        options: { redirectTo: `${APP_URL}${type === 'recovery' ? '/reset-password' : '/dashboard'}` },
      })
      const link = data?.properties?.action_link
      if (error || !link) return done({ ok: false, message: `Could not make a link: ${error?.message ?? 'unknown'}` })
      const msg = type === 'magiclink'
        ? simpleEmail(u.email, 'Your Lenga Maps sign-in link', ['Here is a one-time link to sign in to Lenga Maps. It works once and expires in an hour.'], { label: 'Sign in', href: link })
        : simpleEmail(u.email, 'Reset your Lenga Maps password', ['Use this link to choose a new password. It works once and expires in an hour.'], { label: 'Choose a new password', href: link })
      const sent = await sendEmail(msg, 'account') || await sendEmail(msg, 'payments')
      return done(sent ? { ok: true, message: `Sent to ${email}.` } : { ok: false, message: 'The link was made but the email failed. Check Health → Email.' })
    }

    case 'reset_messages_key': {
      const u = await findUser(email)
      if (!u) return done({ ok: false, message: `No account found for ${email}.` })
      const { error } = await db.from('workspace_user_keys').update({ retired_at: new Date().toISOString() }).eq('user_id', u.id).is('retired_at', null)
      return done(error ? { ok: false, message: error.message } : { ok: true, message: `${email} will be asked to set up secure messages again. Their old messages stay unreadable; nobody can recover them.` })
    }

    case 'reset_free_datasets': {
      const u = await findUser(email)
      if (!u) return done({ ok: false, message: `No account found for ${email}.` })
      const { error } = await db.from('profiles').update({ free_datasets: null, free_datasets_at: null }).eq('id', u.id)
      let team = ''
      const { data: m } = await db.from('organization_members').select('org_id, role, organizations(plan)').eq('user_id', u.id).maybeSingle()
      if (!error && m?.role === 'owner' && (m.organizations as unknown as { plan?: string })?.plan === 'free') {
        await db.from('organizations').update({ free_datasets: null, free_datasets_at: null }).eq('id', m.org_id)
        team = ' Their free team\'s choice was cleared too.'
      }
      return done(error ? { ok: false, message: error.message } : { ok: true, message: `${email} can choose their 3 free datasets again.${team}` })
    }

    case 'clear_rate_limits': {
      const { error } = await db.from('ip_rate_counters').delete().gte('window_start', '1970-01-01')
      return done(error ? { ok: false, message: error.message } : { ok: true, message: 'All "too many attempts" blocks are cleared.' }, null)
    }

    case 'send_test_email': {
      const to = typeof input.to === 'string' && EMAIL.test(input.to) ? input.to : (actor.via === 'console' ? actor.actor : 'lengamaps@gmail.com')
      const results: string[] = []
      for (const ch of ['account', 'payments', 'manual_payment', 'newsletter'] as EmailChannel[]) {
        const ok = await sendEmail(simpleEmail(to, `Lenga Maps test email (${ch} channel)`, [`This is a test from the ops console on the "${ch}" channel. If you can read it, that channel works.`]), ch)
        results.push(`${ch}: ${ok ? 'sent' : 'FAILED'}`)
      }
      const allOk = results.every((r) => r.endsWith('sent'))
      return done({ ok: allOk, message: `${allOk ? 'All channels sent' : 'Some channels failed'} to ${to}. Check that inbox (and spam). ${results.join(' · ')}` }, to)
    }

    case 'run_daily_job': {
      try {
        const summary = await runLifecycle()
        await recordCron('lifecycle', true, summary)
        return done({ ok: true, message: 'The daily job ran.', data: summary }, null)
      } catch (e) {
        await recordCron('lifecycle', false, { error: String(e) })
        return done({ ok: false, message: `It failed: ${e instanceof Error ? e.message : e}` }, null)
      }
    }

    case 'send_report_now': {
      const r = await sendDailyReport(true)
      return done({ ok: r.sent, message: r.sent ? `Report emailed (${r.status}).` : 'The report could not be emailed. Check Health → Email.' }, null)
    }

    case 'set_banner': {
      const text = typeof input.text === 'string' ? input.text.trim().slice(0, 300) : ''
      const { error } = text
        ? await db.from('ops_settings').upsert({ key: 'banner', value: { text }, updated_by: actor.actor, updated_at: new Date().toISOString() })
        : await db.from('ops_settings').delete().eq('key', 'banner')
      return done(error ? { ok: false, message: error.message } : { ok: true, message: text ? 'The banner is showing on every page (within 30 seconds).' : 'The banner is off.' }, null)
    }

    case 'set_maintenance': {
      const on = input.on === true
      const message = typeof input.message === 'string' ? input.message.trim().slice(0, 300) : ''
      const { error } = await db.from('ops_settings').upsert({ key: 'maintenance', value: { on, message }, updated_by: actor.actor, updated_at: new Date().toISOString() })
      return done(error ? { ok: false, message: error.message } : {
        ok: true, message: on ? 'Maintenance mode is ON: visitors see a "back soon" page. You can still use /ops, /admin and sign in.' : 'Maintenance mode is off. The site is open.',
      }, null)
    }

    case 'extend_team': {
      const u = await findUser(email)
      if (!u) return done({ ok: false, message: `No account found for ${email}.` })
      const { data: m } = await db.from('organization_members').select('org_id').eq('user_id', u.id).maybeSingle()
      if (!m) return done({ ok: false, message: `${email} is not on a team.` })
      const { data: org } = await db.from('organizations').select('name, access_expires_at').eq('id', m.org_id).single()
      const next = accessExpiry(org?.access_expires_at ?? null)
      const { error } = await db.from('organizations').update({ access_expires_at: next, status: 'active', expiry_notice_sent: null }).eq('id', m.org_id)
      if (error) return done({ ok: false, message: error.message })
      const { data: members } = await db.from('organization_members').select('user_id').eq('org_id', m.org_id)
      await db.from('profiles').update({ plan: 'team', plan_status: 'active', plan_expires_at: next }).in('id', (members ?? []).map((x) => x.user_id))
      return done({ ok: true, message: `${org?.name}: every member has access until ${new Date(next).toDateString()} (+${ACCESS_MONTHS} months).` })
    }

    case 'set_emergency_keys': {
      // Only from a real email sign-in: someone holding a key must not be
      // able to replace the keys and lock the owner out.
      if (actor.via !== 'console') return { ok: false, message: 'Sign in with an owner email to change the emergency keys.' }
      const hashes = Array.isArray(input.hashes) ? input.hashes.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h)) : []
      if (hashes.length !== 2 || hashes[0] === hashes[1]) return { ok: false, message: 'Expected two different key fingerprints.' }
      const { error } = await db.from('ops_settings').upsert({
        key: 'emergency_keys', value: { hashes, created_at: new Date().toISOString(), by: actor.actor },
        updated_by: actor.actor, updated_at: new Date().toISOString(),
      })
      if (error) return done({ ok: false, message: error.message }, null)
      const { sendToOwners } = await import('./alerts')
      await sendToOwners('Lenga Maps: new emergency keys were created',
        `${actor.actor} created new emergency keys A and B for the ops console. The old keys no longer work. If this wasn't you, sign in and create new ones immediately.`,
        `<p style="font-family:Arial,sans-serif"><b>${actor.actor}</b> created new emergency keys A and B for the ops console. The old keys no longer work.</p><p style="font-family:Arial,sans-serif">If this wasn't you, sign in at <a href="${APP_URL}/ops">${APP_URL}/ops</a> and create new ones immediately.</p>`)
      return done({ ok: true, message: 'The new keys are on. The old ones stopped working.' }, null)
    }

    case 'resolve_problem': {
      const id = Number(input.id)
      const q = db.from('ops_events').update({ resolved_at: new Date().toISOString(), resolved_by: actor.actor }).is('resolved_at', null)
      const { error } = input.all === true ? await q.gte('id', 0) : await q.eq('id', id)
      return done(error ? { ok: false, message: error.message } : { ok: true, message: input.all ? 'All problems marked as dealt with.' : 'Marked as dealt with.' }, null)
    }

    default:
      return { ok: false, message: `Unknown action "${action}".` }
  }
}
