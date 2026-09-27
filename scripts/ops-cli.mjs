#!/usr/bin/env node
// scripts/ops-cli.mjs — emergency tools that work WITHOUT the website.
//
// Talks straight to Supabase (database + sign-in), so it keeps working when
// Vercel or the site is down. Runs from the GitHub "Emergency" workflow
// (Actions tab → Emergency → Run workflow) or on any computer with Node:
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/ops-cli.mjs <command> [email] [value]
//
// Commands:
//   health                          is the database / sign-in / website up?
//   lookup <email>                  what state is this account in?
//   grant <email> <months|permanent> [team]   give paid access
//   revoke <email>                  remove paid access (plan kept)
//   confirm <email>                 mark their email confirmed (stuck at sign-in)
//   login-link <email>              Supabase emails them a one-time sign-in link
//   maintenance-on "<message>"      show visitors a "back soon" page
//   maintenance-off                 open the site again
//   banner "<text>" | banner-off    message across the top of every page
//
// Output never prints full email addresses, keys or links, because GitHub
// Actions logs on a public repository can be read by anyone.

const URL_ = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SITE = (process.env.SITE_URL || 'https://www.lengamaps.com').replace(/\/$/, '')
const VIA = process.env.GITHUB_ACTIONS ? 'github' : 'cli'
const ACTOR = process.env.GITHUB_ACTOR ? `github:${process.env.GITHUB_ACTOR}` : `cli:${process.env.USER || 'owner'}`

const [, , cmd, arg1, arg2, arg3] = process.argv
const mask = (e) => (e && e.includes('@') ? `${e.slice(0, 2)}***@${e.split('@')[1]}` : e)
const say = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) process.exitCode = 1 }

if (!URL_ || !KEY) {
  say(false, 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. In GitHub: Settings → Secrets and variables → Actions → New repository secret.')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(path, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`database said ${res.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}
async function authAdmin(path, init = {}) {
  const res = await fetch(`${URL_}/auth/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`sign-in service said ${res.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}
async function audit(action, target, detail = {}, ok = true) {
  try { await rest('ops_audit', { method: 'POST', body: JSON.stringify({ actor: ACTOR, via: VIA, action, target: target ? mask(target) : null, detail, ok }) }) } catch { /* best effort */ }
}
async function findUser(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('that is not an email address')
  const rows = await rest(`profiles?email=ilike.${encodeURIComponent(e)}&select=*`)
  if (rows?.[0]) return rows[0]
  throw new Error(`no account for ${mask(e)}`)
}
async function setting(key, value) {
  if (value === null) return rest(`ops_settings?key=eq.${key}`, { method: 'DELETE' })
  return rest('ops_settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value, updated_by: ACTOR, updated_at: new Date().toISOString() }) })
}

async function main() {
  switch (cmd) {
    case 'health': {
      let t = Date.now()
      try { await rest('profiles?select=id&limit=1'); say(true, `Database answers (${Date.now() - t} ms).`) } catch (e) { say(false, `Database: ${e.message}. Check supabase.com: is the project paused? status.supabase.com for incidents.`) }
      t = Date.now()
      try { await authAdmin('admin/users?page=1&per_page=1'); say(true, `Sign-in service answers (${Date.now() - t} ms).`) } catch (e) { say(false, `Sign-in: ${e.message}.`) }
      t = Date.now()
      try {
        const r = await fetch(`${SITE}/api/ops/ping`)
        say(r.ok, r.ok ? `Website is up (${Date.now() - t} ms).` : `Website answered ${r.status}. If the database is fine, the problem is the website: Vercel → Deployments → last good one → Promote to Production.`)
      } catch (e) { say(false, `Website unreachable: ${e.message}. Check vercel.com status and your domain.`) }
      try {
        const open = await rest('ops_events?resolved_at=is.null&select=level,code,area,count&order=last_at.desc&limit=10')
        console.log(open?.length ? `Open problems:\n${open.map((p) => `  - [${p.level}] ${p.area}/${p.code} ×${p.count}`).join('\n')}` : 'No open problems in the log.')
      } catch { /* log unreachable */ }
      return
    }
    case 'lookup': {
      const p = await findUser(arg1)
      const users = await authAdmin(`admin/users/${p.id}`).catch(() => null)
      say(true, `${mask(p.email)}: plan ${p.plan || 'none'}, access ${p.plan_status || 'free'}${p.plan_status === 'active' ? `, ends ${p.plan_expires_at || 'never'}` : ''}; email confirmed: ${users?.email_confirmed_at ? 'yes' : 'NO'}; last sign-in: ${users?.last_sign_in_at || 'never'}.`)
      return audit('lookup_user', p.email)
    }
    case 'grant': {
      const p = await findUser(arg1)
      const permanent = String(arg2) === 'permanent' || String(arg2) === '0'
      const months = permanent ? 0 : Number(arg2 || 3)
      if (!permanent && !(months > 0 && months <= 24)) throw new Error('months must be 1-24 or "permanent"')
      let expires = null
      if (!permanent) {
        const base = p.plan_status === 'active' && p.plan_expires_at && new Date(p.plan_expires_at) > new Date() ? new Date(p.plan_expires_at) : new Date()
        base.setMonth(base.getMonth() + months); expires = base.toISOString()
      }
      await rest(`profiles?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ plan: arg3 === 'team' ? 'team' : 'individual', plan_status: 'active', plan_expires_at: expires, expiry_reminder_sent_at: null }) })
      say(true, `${mask(p.email)} has access ${permanent ? 'permanently' : `until ${expires.slice(0, 10)}`}.`)
      return audit('grant_access', p.email, { months: permanent ? 'permanent' : months })
    }
    case 'revoke': {
      const p = await findUser(arg1)
      await rest(`profiles?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ plan_status: 'free' }) })
      say(true, `${mask(p.email)} no longer has paid access.`)
      return audit('revoke_access', p.email)
    }
    case 'confirm': {
      const p = await findUser(arg1)
      await authAdmin(`admin/users/${p.id}`, { method: 'PUT', body: JSON.stringify({ email_confirm: true }) })
      say(true, `${mask(p.email)} is confirmed.`)
      return audit('confirm_email', p.email)
    }
    case 'login-link': {
      const p = await findUser(arg1)
      await authAdmin('otp', { method: 'POST', body: JSON.stringify({ email: p.email, create_user: false }) })
      say(true, `Supabase emailed a one-time sign-in link to ${mask(p.email)}.`)
      return audit('send_login_link', p.email)
    }
    case 'maintenance-on': {
      await setting('maintenance', { on: true, message: arg1 || 'We are making improvements and will be back shortly.' })
      say(true, 'Maintenance mode is ON (visitors see it within 30 seconds).')
      return audit('set_maintenance', null, { on: true })
    }
    case 'maintenance-off': {
      await setting('maintenance', { on: false })
      say(true, 'Maintenance mode is OFF.')
      return audit('set_maintenance', null, { on: false })
    }
    case 'banner': {
      if (!arg1) throw new Error('give the banner text in quotes')
      await setting('banner', { text: String(arg1).slice(0, 300) })
      say(true, 'Banner is showing.')
      return audit('set_banner', null)
    }
    case 'banner-off': {
      await setting('banner', null)
      say(true, 'Banner removed.')
      return audit('set_banner', null, { off: true })
    }
    default:
      console.log('Commands: health | lookup <email> | grant <email> <months|permanent> [team] | revoke <email> | confirm <email> | login-link <email> | maintenance-on "<message>" | maintenance-off | banner "<text>" | banner-off')
      process.exitCode = cmd ? 1 : 0
  }
}

main().catch((e) => say(false, e.message))
