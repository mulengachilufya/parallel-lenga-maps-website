// src/lib/sales/find-emails.ts
//
// Finds a prospect's published general inbox (info@, contact@ ...) from its
// own website, with no paid service and no AI:
//
//   1. Website: the one on the account, or else the official website Wikidata
//      lists for an organisation of that exact name in that country.
//   2. Read the home page and up to three of its contact / about pages.
//   3. Keep only addresses on the organisation's own domain, decoding the
//      usual obfuscations (mailto links, Cloudflare email protection, "[at]").
//   4. Pick the best general inbox and put it on a contact that has no email,
//      so the prospect appears in Email drafts. Nothing is guessed: no
//      address on the site means none is saved.
//
// Every account is checked once (email_scan_at, migration 058).

import { db } from './server'
import { countryName } from './server'

const UA = 'LengaMapsBot/1.0 (+https://www.lengamaps.com; prospect contact lookup)'
const FETCH_MS = 8000

async function get(url: string, accept = 'text/html'): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: AbortSignal.timeout(FETCH_MS) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (accept === 'text/html' && !type.includes('html')) return null
    return (await res.text()).slice(0, 1_500_000)
  } catch { return null }
}

// ── 1. Website from Wikidata ────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|of|and|ltd|limited|pty|inc|plc|sa|south africa)\b/g, ' ').replace(/\s+/g, ' ').trim()

const countryQid = new Map<string, string | null>()

async function iso3OfCountry(qid: string): Promise<string | null> {
  if (countryQid.has(qid)) return countryQid.get(qid)!
  const j = await get(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, 'application/json')
  let iso: string | null = null
  try { iso = JSON.parse(j ?? '{}').entities?.[qid]?.claims?.P298?.[0]?.mainsnak?.datavalue?.value ?? null } catch { /* none */ }
  countryQid.set(qid, iso)
  return iso
}

/** The official website Wikidata gives for this organisation, if the name and country match. */
export async function websiteFromWikidata(name: string, iso3: string | null): Promise<string | null> {
  const q = name.replace(/\([^)]*\)/g, '').trim()
  const s = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=5&search=${encodeURIComponent(q)}`, 'application/json')
  let hits: { id: string; label?: string }[] = []
  try { hits = JSON.parse(s ?? '{}').search ?? [] } catch { return null }
  const want = norm(name)
  for (const h of hits) {
    if (!h.label || norm(h.label) !== want) continue // exact name only
    const e = await get(`https://www.wikidata.org/wiki/Special:EntityData/${h.id}.json`, 'application/json')
    let claims: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> = {}
    try { claims = JSON.parse(e ?? '{}').entities?.[h.id]?.claims ?? {} } catch { continue }
    const site = claims.P856?.[0]?.mainsnak?.datavalue?.value
    if (typeof site !== 'string') continue
    if (iso3) {
      const c = (claims.P17?.[0]?.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id
      if (!c || (await iso3OfCountry(c)) !== iso3) continue // must be the same country
    }
    return site
  }
  return null
}

// ── 2-3. Emails on the site ─────────────────────────────────────────────────

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }

/** Same organisation: equal domains, or one a subdomain of the other. */
const sameOrg = (emailDomain: string, siteHost: string) =>
  emailDomain === siteHost || siteHost.endsWith(`.${emailDomain}`) || emailDomain.endsWith(`.${siteHost}`)

function cfDecode(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16)
  let out = ''
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
  return out
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

function emailsIn(html: string): string[] {
  const found = new Set<string>()
  const text = html
    .replace(/data-cfemail="([0-9a-f]+)"/gi, (_, h: string) => ` ${cfDecode(h)} `)
    .replace(/&#64;|&commat;/g, '@').replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@').replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.')
  for (const m of text.matchAll(EMAIL)) {
    const e = m[0].toLowerCase().replace(/^mailto:/, '').replace(/\.+$/, '')
    if (/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e) || e.includes('example.')) continue
    found.add(e)
  }
  return [...found]
}

function contactLinks(html: string, base: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (!/contact|about|get-in-touch|reach|enquir|inquir|office/i.test(m[1])) continue
    try {
      const u = new URL(m[1], base)
      if (host(u.href) === host(base)) out.add(u.href.split('#')[0])
    } catch { /* skip */ }
    if (out.size >= 3) break
  }
  return [...out]
}

// General inboxes first; never personal-sounding or system addresses when a general one exists.
const RANK: [RegExp, number][] = [
  [/^(info|contact|contactus|enquiries|enquiry|inquiries|inquiry|hello|general|office|reception|admin|mail)@/, 0],
  [/^(communications|comms|media|marketing|partnerships|business|sales|projects)@/, 1],
  [/^(support|help|customercare|service)@/, 2],
]
const BLOCK = /^(no-?reply|donotreply|privacy|dpo|popia|gdpr|careers|jobs|hr|recruit|vacancies|webmaster|abuse|postmaster|security|tenders|procurement|fraud|whistle)/

export function bestEmail(emails: string[], siteHost: string): string | null {
  const own = emails.filter((e) => sameOrg(e.split('@')[1], siteHost) && !BLOCK.test(e))
  if (!own.length) return null
  const score = (e: string) => RANK.find(([re]) => re.test(e))?.[1] ?? 3
  return own.sort((a, b) => score(a) - score(b) || a.length - b.length)[0]
}

/** Read the site's home page and contact pages; the best general inbox on its own domain. */
export async function emailFromSite(website: string): Promise<{ email: string | null; pages: number }> {
  const start = /^https?:\/\//i.test(website) ? website : `https://${website}`
  const home = await get(start)
  if (!home) return { email: null, pages: 0 }
  const siteHost = host(start)
  let emails = emailsIn(home)
  let pages = 1
  let best = bestEmail(emails, siteHost)
  if (!best || RANK[0][0].test(best) === false) {
    // The pages it links to, plus the usual addresses for a contact page.
    const origin = new URL(start).origin
    const urls = [...new Set([...contactLinks(home, start), `${origin}/contact`, `${origin}/contact-us`])].slice(0, 5)
    const more = await Promise.all(urls.map((u) => get(u)))
    for (const h of more) if (h) { emails = emails.concat(emailsIn(h)); pages++ }
    best = bestEmail(emails, siteHost)
  }
  return { email: best, pages }
}

// ── 4. One account ──────────────────────────────────────────────────────────

const ROLE = /\b(officer|lead|manager|head|director|specialist|analyst|coordinator|team|engineer|unit|lecturer|gis)\b/i

export async function findEmailFor(a: { id: string; name: string; country_iso3: string | null; website: string | null }): Promise<string | null> {
  let website = a.website
  let note = ''
  if (!website) {
    website = await websiteFromWikidata(a.name, a.country_iso3)
    note = website ? `website from Wikidata: ${website}` : `no website found (${countryName(a.country_iso3) || 'no country'})`
  }
  let email: string | null = null
  if (website) {
    const r = await emailFromSite(website)
    email = r.email
    note = [note, email ? `found ${email} on ${website}` : `no address on ${website} (${r.pages} pages read)`].filter(Boolean).join('; ')
  }
  const now = new Date().toISOString()
  await db.from('sales_accounts').update({ email_scan_at: now, email_scan_note: note.slice(0, 500), ...(website && !a.website ? { website } : {}) }).eq('id', a.id)
  if (!email) return null

  // Put it on a contact without an email: a role placeholder first, so a named person is not greeted at a shared inbox.
  const { data: contacts } = await db.from('sales_contacts').select('id, name, email, notes').eq('account_id', a.id).is('opted_out_at', null)
  const free = (contacts ?? []).filter((c) => !c.email)
  const target = free.find((c) => ROLE.test(c.name)) ?? free[0]
  const source = `General inbox found on ${website} (${now.slice(0, 10)})`
  if (target) {
    await db.from('sales_contacts').update({ email, notes: [target.notes, source].filter(Boolean).join('\n') }).eq('id', target.id)
  } else if (!(contacts ?? []).some((c) => c.email)) {
    await db.from('sales_contacts').insert({ account_id: a.id, name: `${a.name} team`, email, notes: source, is_primary: false })
  }
  return email
}

/** Check the next accounts not yet scanned (no contact email), a few at a time, within a time budget. */
export async function scanBatch(pipeline: 'sales' | 'partner', opts: { limit?: number; budgetMs?: number } = {}) {
  const limit = opts.limit ?? 12
  const deadline = Date.now() + (opts.budgetMs ?? 45_000)
  const { data: accounts } = await db.from('sales_accounts')
    .select('id, name, country_iso3, website, contacts:sales_contacts(email)')
    .eq('pipeline', pipeline).is('email_scan_at', null).neq('stage', 'lost')
    .order('website', { ascending: true, nullsFirst: false }).order('name').limit(limit)
  const hasEmail = (a: { contacts: unknown }) => ((a.contacts as { email: string | null }[] | null) ?? []).some((c) => c.email)
  // Already reachable by email: nothing to look up, just mark it checked.
  const done = (accounts ?? []).filter(hasEmail).map((a) => a.id)
  if (done.length) await db.from('sales_accounts').update({ email_scan_at: new Date().toISOString(), email_scan_note: 'already had an email address' }).in('id', done)
  const todo = (accounts ?? []).filter((a) => !hasEmail(a))
  let found = 0, checked = done.length
  // Four at a time, stopping before the time budget runs out.
  for (let i = 0; i < todo.length && Date.now() < deadline - FETCH_MS * 3; i += 4) {
    const res = await Promise.all(todo.slice(i, i + 4).map((a) => findEmailFor(a).catch(() => null)))
    checked += res.length
    found += res.filter(Boolean).length
  }
  const { count } = await db.from('sales_accounts').select('id', { count: 'exact', head: true }).eq('pipeline', pipeline).is('email_scan_at', null).neq('stage', 'lost')
  return { checked, found, left: count ?? 0 }
}
