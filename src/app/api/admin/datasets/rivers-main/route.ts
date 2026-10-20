/**
 * Admin: build the "Main rivers" file for a country from its full
 * HydroRIVERS GeoPackage.
 *
 * GET  /api/admin/datasets/rivers-main          every country's full rivers
 *      file and whether its main-rivers file exists yet.
 * POST /api/admin/datasets/rivers-main  { id }  build one country (the
 *      hydrology_layers id of its 'rivers' row). One per request so each
 *      stays well inside the function time limit; the Ops page loops.
 *
 * The full file is only read. The new file keeps Strahler order >= 4 (the
 * named rivers and big tributaries); a small country with nothing that big
 * falls back to >= 3, then >= 2, and the row's source says which was used.
 * Saved as layer_type 'rivers_main', so nothing that lists 'rivers' changes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { SqlJsStatic } from 'sql.js'
import { createServerSupabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
import { getObjectBytes, putObjectBytes } from '@/lib/r2'
import { subsetGeoPackage } from '@/lib/datasets/gpkg-subset'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const SOURCE = 'HydroSHEDS HydroRIVERS v1.0'
const THRESHOLDS = [4, 3, 2]

/**
 * Admin session, or a short-lived job token: `Authorization: Bearer <token>`
 * whose sha256 is stored in ops_settings 'dataset_job_token' with an expiry.
 * Only a fingerprint is stored; deleting the row revokes it. It opens this
 * one build route and nothing else.
 */
async function admin(req?: NextRequest): Promise<boolean> {
  const bearer = req?.headers.get('authorization')?.match(/^Bearer (.{32,})$/)?.[1]
  if (bearer) {
    const { data } = await service.from('ops_settings').select('value').eq('key', 'dataset_job_token').maybeSingle()
    const v = data?.value as { hash?: string; expires_at?: string } | undefined
    if (!v?.hash || !v.expires_at || new Date(v.expires_at).getTime() < Date.now()) return false
    const got = Buffer.from(createHash('sha256').update(bearer).digest('hex'))
    const want = Buffer.from(v.hash)
    return got.length === want.length && timingSafeEqual(got, want)
  }
  const auth = await createServerSupabase()
  const { data: { user } } = await auth.auth.getUser()
  return !!user && isAdminEmail(user.email)
}

let sqlPromise: Promise<SqlJsStatic> | null = null
/** sql.js with its WebAssembly fetched from our own /public (bundling-proof). */
function loadSql(origin: string): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const res = await fetch(`${origin}/vendor/sql-wasm.wasm`)
      if (!res.ok) throw new Error(`sql-wasm.wasm: ${res.status}`)
      const wasmBinary = await res.arrayBuffer()
      const init = (await import('sql.js')).default
      return init({ wasmBinary })
    })().catch((e) => { sqlPromise = null; throw e })
  }
  return sqlPromise
}

/** datasets/zaf/rivers/ZAF_Rivers.gpkg -> datasets/zaf/rivers/ZAF_Rivers_Main.gpkg */
function mainKey(fullKey: string): string {
  return fullKey.replace(/(\.gpkg)$/i, '_Main$1')
}

export async function GET(req: NextRequest) {
  if (!(await admin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { data, error } = await service.from('hydrology_layers')
    .select('id, country, layer_type, r2_key, file_size_mb, source')
    .in('layer_type', ['rivers', 'rivers_main']).order('country')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const main = new Map((data ?? []).filter((r) => r.layer_type === 'rivers_main').map((r) => [r.country, r]))
  return NextResponse.json({
    countries: (data ?? []).filter((r) => r.layer_type === 'rivers').map((r) => ({
      id: r.id, country: r.country, full_mb: Number(r.file_size_mb),
      main_mb: main.has(r.country) ? Number(main.get(r.country)!.file_size_mb) : null,
      main_source: main.get(r.country)?.source ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!(await admin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const id = Number(body.id)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: row } = await service.from('hydrology_layers')
    .select('id, country, layer_type, r2_key').eq('id', id).eq('layer_type', 'rivers').maybeSingle()
  if (!row) return NextResponse.json({ error: 'not a rivers row' }, { status: 404 })
  if (!/\.gpkg$/i.test(row.r2_key)) return NextResponse.json({ error: `not a GeoPackage: ${row.r2_key}` }, { status: 422 })

  try {
    const SQL = await loadSql(req.nextUrl.origin)
    const src = await getObjectBytes(row.r2_key)
    let result = null
    let used = THRESHOLDS[0]
    for (const t of THRESHOLDS) {
      result = subsetGeoPackage(SQL, src, `"ORD_STRA" >= ${t}`, 'ORD_STRA')
      used = t
      if (result.kept > 0) break
    }
    if (!result || result.kept === 0) {
      return NextResponse.json({ ok: false, country: row.country, message: 'No river segments of order 2 or more; skipped.' })
    }

    const key = mainKey(row.r2_key)
    await putObjectBytes(key, result.bytes, 'application/geopackage+sqlite3')
    const sizeMb = Number((result.bytes.byteLength / 1_048_576).toFixed(2))

    // Replace this country's main-rivers row (never touches 'rivers' rows).
    await service.from('hydrology_layers').delete().eq('country', row.country).eq('layer_type', 'rivers_main')
    const { error } = await service.from('hydrology_layers').insert({
      country: row.country, layer_type: 'rivers_main', r2_key: key,
      file_size_mb: sizeMb, file_format: 'GeoPackage',
      source: `${SOURCE}, main rivers (Strahler order ${used}+)`,
    })
    if (error) throw new Error(error.message)

    return NextResponse.json({
      ok: true, country: row.country, kept: result.kept, total: result.total, order: used, size_mb: sizeMb,
    })
  } catch (e) {
    console.error('[rivers-main] build failed', row.country, e)
    return NextResponse.json({ ok: false, country: row.country, message: e instanceof Error ? e.message : 'build failed' }, { status: 500 })
  }
}
