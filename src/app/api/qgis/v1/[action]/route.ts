import { createHash } from 'node:crypto'
import { createClient, type Session } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { DATASETS, findDataset, getDatasetBundle, listFilesForDataset, readCatalogFiles, type ApiFile } from '@/lib/api-datasets'
import { CATALOG } from '@/lib/catalog'
import { BUNDLE_DATASETS, DATASET_SECTIONS, type DatasetSectionId } from '@/lib/dataset-sections'
import { LULC_CLASSES } from '@/lib/worldcover-legend'
import { objectMetadata } from '@/lib/r2'
import { COUNTRIES, isValidCountry } from '@/lib/countries'
import { callerAccess, signDatasetFile } from '@/lib/dataset-access'
import { canDownload, type Access } from '@/lib/entitlements'
import { savePicks } from '@/lib/free-picks'
import { FREE_PICKABLE, PASS_MONTH_PRICE, planCtaHref, type DatasetSlug } from '@/lib/pricing'
import { checkIpRateLimit, clientIp } from '@/lib/rate-limit'
import { browserCheckout, checkoutPage, checkoutPath } from '@/lib/qgis-checkout'
import { isValidSector, SECTORS } from '@/lib/sectors'

export const dynamic = 'force-dynamic'

const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
type Context = { params: Promise<{ action: string }> }
type Body = Record<string, unknown>

function authClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, authOptions)
}

function dbClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, authOptions)
}

function json(payload: Body, status = 200, headers: Record<string, string> = {}) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

function fail(status: number, message: string) {
  return json({ message }, status)
}

async function body(req: NextRequest): Promise<Body> {
  const reader = req.body?.getReader()
  if (!reader) throw new Error('Missing body')
  let length = 0
  let value = ''
  const decoder = new TextDecoder()
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    length += chunk.value.length
    if (length > 8192) {
      await reader.cancel()
      throw new Error('Body too large')
    }
    value += decoder.decode(chunk.value, { stream: true })
  }
  const parsed: unknown = JSON.parse(value + decoder.decode())
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object')
  return parsed as Body
}

function sessionResponse(session: Session) {
  return json({ access_token: session.access_token, refresh_token: session.refresh_token,
    expires_at: session.expires_at })
}

async function authenticate(req: NextRequest, action: string, data: Body) {
  const signup = action === 'signup'
  const refresh = action === 'refresh'
  const limit = await checkIpRateLimit(dbClient(), 'qgis-' + action, clientIp(req),
    signup ? 8 : refresh ? 60 : 30, signup ? 3600 : 900)
  if (limit.count === 0) return fail(503, 'Account requests are temporarily unavailable. Please try again.')
  if (!limit.ok) return json({ message: 'Too many account requests. Please wait and try again.' }, 429,
    { 'Retry-After': String(limit.retryAfter) })

  const auth = authClient().auth
  if (refresh) {
    if (typeof data.refresh_token !== 'string' || !data.refresh_token) return fail(400, 'Missing session token.')
    const { data: result, error } = await auth.refreshSession({ refresh_token: data.refresh_token })
    if (error && (!error.status || error.status >= 500)) return fail(503, 'Sign-in service temporarily unavailable.')
    if (error?.status === 429) return fail(429, 'Too many account requests. Please try again later.')
    return result.session ? sessionResponse(result.session) : fail(401, 'Your session expired. Please sign in again.')
  }

  const email = typeof data.email === 'string' ? data.email.trim() : ''
  const password = typeof data.password === 'string' ? data.password : ''
  if (!email || email.length > 254 || !password) return fail(400, 'Enter a valid email address and password.')

  if (signup) {
    const first = typeof data.first_name === 'string' ? data.first_name.trim() : ''
    const last = typeof data.last_name === 'string' ? data.last_name.trim() : ''
    if (!first || !last || first.length > 100 || last.length > 100
      || !isValidCountry(data.country) || !isValidSector(data.sector)
      || password.length < 8 || data.accepted_terms !== true) {
      return fail(400, 'Complete the signup form and accept the Terms and Privacy Policy.')
    }
    const { data: result, error } = await auth.signUp({
      email, password, options: { data: {
        first_name: first, last_name: last, full_name: first + ' ' + last,
        country: data.country, sector: data.sector,
      } },
    })
    if (error) {
      if (!error.status || error.status >= 500) return fail(503, 'Sign-in service temporarily unavailable.')
      return fail(error.status === 429 ? 429 : 400, error.message)
    }
    return result.session ? sessionResponse(result.session)
      : fail(409, 'If this address is new, follow the instructions sent by Lenga Maps. Otherwise, sign in.')
  }
  const { data: result, error } = await auth.signInWithPassword({ email, password })
  if (error && (!error.status || error.status >= 500)) return fail(503, 'Sign-in service temporarily unavailable.')
  if (error?.status === 429) return fail(429, 'Too many account requests. Please try again later.')
  return result.session ? sessionResponse(result.session) : fail(401, 'Could not sign in with that email and password.')
}

async function verifiedUser(req: NextRequest) {
  const match = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/i)
  if (!match) return null
  const { data, error } = await authClient().auth.getUser(match[1])
  if (error && (!error.status || error.status >= 500)) throw new Error('Auth service unavailable')
  return data.user ? { user: data.user, token: match[1] } : null
}

const report = { id: 'country-profiles', category: 'reports', source: 'Lenga Maps' }

const datasets = [...DATASETS, report].map(({ id, category, source }) => {
  const section = DATASET_SECTIONS[id as DatasetSectionId]
  const facts = CATALOG[id as DatasetSlug]
  return {
    id, name: section.name, category, description: section.description,
    facts: facts?.facts ?? [], note: facts?.note, source: facts?.credit ?? source,
    pickable: FREE_PICKABLE.includes(id as DatasetSlug),
  }
})

function account(access: Access, email: string) {
  return {
    email, state: access.state, left: access.personal.left, picks: access.personal.picks,
    allowed: datasets.filter(d => canDownload(access, d.id)).map(d => d.id),
  }
}

const countryAliases: Record<string, string> = {
  'Central Africa Republic': 'Central African Republic',
  'Central African Rep': 'Central African Republic',
  'Cote dIvoire': 'Côte d’Ivoire', "Cote d'Ivoire": 'Côte d’Ivoire', 'Côte d_Ivoire': 'Côte d’Ivoire',
  'Dem Rep Congo': 'Democratic Republic of the Congo',
  'Democratic Republic of Congo': 'Democratic Republic of the Congo',
  'DR Congo': 'Democratic Republic of the Congo',
  'Eq Guinea': 'Equatorial Guinea', 'eSwatini': 'Eswatini',
  'Guinea Bissau': 'Guinea-Bissau', 'S Sudan': 'South Sudan', 'W Sahara': 'Western Sahara',
}

function publicFile(file: ApiFile) {
  const objectName = file.r2_key.split('/').at(-1) ?? ''
  const name = typeof file.meta?.file_name === 'string' && file.meta.file_name ? file.meta.file_name : objectName
  const admin = file.meta?.admin_level
  const start = file.meta?.year_start
  const end = file.meta?.year_end
  const label = file.meta?.label ?? (admin != null ? `Admin level ${admin}`
    : start != null && end != null ? `${file.meta?.variable_name ?? file.source} · ${start}–${end}` : name)
  return {
    id: createHash('sha256').update(file.r2_key).digest('hex'),
    name, country: file.country_name, region: countryAliases[file.country_name] ?? file.country_name,
    size_mb: file.file_size_mb, format: file.file_format, label, source: file.source,
  }
}

async function reportsFor(slug: string, source: string): Promise<ApiFile[]> {
  return (await readCatalogFiles(slug)).map(row => ({
    country_iso3: row.iso3, country_name: row.country, r2_key: row.r2_key,
    file_format: row.file_format, file_size_mb: row.file_size_mb,
    source, meta: { label: row.label, file_name: row.file_name },
  }))
}

async function countryFiles(spec: NonNullable<ReturnType<typeof findDataset>>): Promise<ApiFile[]> {
  const main = listFilesForDataset(spec, null, true)
  if (spec.id === 'rivers') {
    const [full, lighter] = await Promise.all([
      main, listFilesForDataset({ ...spec, layer_type: 'rivers_main' }),
    ])
    return [
      ...full.map(file => ({ ...file, meta: { ...file.meta, label: 'Full river network' } })),
      ...lighter.map(file => ({ ...file, meta: { ...file.meta, label: 'Main rivers' } })),
    ]
  }
  if (spec.id === 'soil' || spec.id === 'temperature') {
    const [gis, reports] = await Promise.all([main, reportsFor(spec.id, spec.source)])
    return [...gis, ...reports]
  }
  return main
}

async function filesFor(id: unknown): Promise<ApiFile[] | null> {
  if (id === report.id) return reportsFor(report.id, report.source)
  const spec = typeof id === 'string' ? findDataset(id) : undefined
  if (!spec) return null
  const [files, bundle] = await Promise.all([
    countryFiles(spec),
    BUNDLE_DATASETS.has(spec.id) ? getDatasetBundle(spec.id) : null,
  ])
  const credit = CATALOG[spec.id as DatasetSlug]?.credit
  const result = files.map(file => ({
    ...file,
    source: credit && file.meta?.file_name ? credit : file.source,
    file_format: spec.id === 'admin-boundaries' && file.r2_key.toLowerCase().endsWith('.zip')
      ? 'Boundary archive (ZIP)' : file.file_format,
  }))
  if (!bundle) return result
  return [{
    country_iso3: '', country_name: 'Africa-wide', r2_key: bundle.r2_key,
    file_size_mb: Number(bundle.file_size_mb), file_format: bundle.file_format, source: spec.source,
    meta: { label: `Continental bundle · ${bundle.file_count} source files` },
  }, ...result]
}

export async function GET(req: NextRequest, { params }: Context) {
  const { action } = await params
  if (action === 'browser-checkout') return checkoutPage()
  if (action === 'info') {
    return json({
      name: 'Lenga Maps', countries: COUNTRIES, sectors: SECTORS,
      terms_path: '/terms', privacy_path: '/privacy', checkout_path: planCtaHref('individual'),
      checkout_handoff: true, pass_label: 'Get a pass · from $' + PASS_MONTH_PRICE + ' USD',
    })
  }
  if (action !== 'account' && action !== 'catalog' && action !== 'files') return fail(404, 'Unknown endpoint.')
  try {
    const caller = await verifiedUser(req)
    if (!caller) return fail(401, 'Please sign in.')
    if (action === 'account') {
      const access = await callerAccess(caller.user.id)
      return access ? json({ account: account(access, caller.user.email ?? '') }) : fail(401, 'Please sign in.')
    }
    if (action === 'catalog') return json({ datasets })
    const files = await filesFor(req.nextUrl.searchParams.get('dataset'))
    return files ? json({ files: files.filter(file => file.r2_key).map(publicFile) }) : fail(404, 'Unknown dataset.')
  } catch {
    return fail(503, 'The catalog is temporarily unavailable. Please try again.')
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  const { action } = await params
  if (!['signup', 'login', 'refresh', 'logout', 'pick', 'download', 'checkout', 'browser-checkout'].includes(action)) return fail(404, 'Unknown endpoint.')
  const data = await body(req).catch(() => null)
  if (!data) return fail(400, 'Send a JSON object no larger than 8 KB.')
  try {
    if (action === 'browser-checkout') return await browserCheckout(req, data)
    if (action === 'signup' || action === 'login' || action === 'refresh') return await authenticate(req, action, data)
    const caller = await verifiedUser(req)
    if (!caller) return fail(401, 'Please sign in.')
    if (action === 'checkout') {
      const email = caller.user.email
      if (!email || !caller.user.email_confirmed_at) return fail(403, 'Verify your Lenga Maps email before opening checkout.')
      const limit = await checkIpRateLimit(dbClient(), 'qgis-checkout', caller.user.id, 6, 900)
      if (!limit.count) return fail(503, 'Checkout is temporarily unavailable.')
      if (!limit.ok) return fail(429, 'Too many checkout links. Try again in a few minutes.')
      const { data: link, error } = await dbClient().auth.admin.generateLink({ type: 'magiclink', email })
      if (error || link.user?.id !== caller.user.id || !link.properties?.hashed_token) {
        return fail(503, 'Could not prepare checkout. Try again in a moment.')
      }
      return json({ path: checkoutPath(caller.user.id, email, link.properties.hashed_token) })
    }
    if (action === 'logout') {
      const { error } = await dbClient().auth.admin.signOut(caller.token, 'local')
      return error ? fail(503, 'Could not revoke the session. Please try again.') : json({ ok: true })
    }
    const dataset = datasets.find(d => d.id === data.dataset)
    if (!dataset) return fail(404, 'Unknown dataset.')
    const access = await callerAccess(caller.user.id)
    if (!access) return fail(401, 'Please sign in.')

    if (action === 'pick') {
      if (canDownload(access, dataset.id)) return json({ account: account(access, caller.user.email ?? '') })
      if (!dataset.pickable || access.paid) return fail(403, 'This dataset cannot be added as a free pick.')
      const files = await filesFor(dataset.id)
      if (!files?.some(file => file.r2_key)) return fail(404, 'This dataset has no downloadable files yet.')
      const result = await savePicks(dbClient(), 'profile', caller.user.id, [dataset.id])
      if ('error' in result) return fail(result.status, result.error)
      const updated = await callerAccess(caller.user.id)
      return updated ? json({ account: account(updated, caller.user.email ?? '') }) : fail(401, 'Please sign in.')
    }

    if (!canDownload(access, dataset.id)) return fail(403, 'Pick this dataset or activate an eligible pass before downloading.')
    if (typeof data.file !== 'string' || !/^[a-f0-9]{64}$/.test(data.file)) return fail(400, 'Select a file.')
    const files = await filesFor(dataset.id)
    const file = files?.find(f => f.r2_key && publicFile(f).id === data.file)
    if (!file) return fail(404, 'That file is no longer listed. Refresh the dataset.')
    const sidecarKey = dataset.id === 'lulc' ? file.r2_key + '.aux.xml' : null
    const [object, sidecar] = await Promise.all([
      objectMetadata(file.r2_key), sidecarKey ? objectMetadata(sidecarKey) : null,
    ])
    if (!object?.ContentLength) return fail(404, 'This file is unavailable in storage. Refresh the dataset and try another file.')
    const [downloadUrl, sidecarUrl] = await Promise.all([
      signDatasetFile(file.r2_key, { expiresIn: 900 }),
      sidecarKey && sidecar?.ContentLength ? signDatasetFile(sidecarKey, { expiresIn: 900 }) : null,
    ])
    return json({ download_url: downloadUrl, bytes: object.ContentLength,
      sidecar_url: sidecarUrl, sidecar_bytes: sidecar?.ContentLength,
      legend: dataset.id === 'lulc' ? LULC_CLASSES : undefined })
  } catch {
    return fail(503, 'The catalog is temporarily unavailable. Please try again.')
  }
}
