/**
 * fetch-dataset-files.mjs
 *
 * Step 1 of the continental-bundle build. Pulls EVERY per-country source file
 * for one dataset out of R2 into a local folder and writes a files.json index
 * that scripts/combine-vector.py then merges into a single GeoPackage.
 *
 * Why a separate Node step? R2 + Supabase access already live in the Node
 * seed scripts (@aws-sdk, @supabase/supabase-js). geopandas lives in Python.
 * So Node does the I/O, Python does the geometry — and the merge never depends
 * on stale local output/<Dataset>/ folders. The DB is the source of truth for
 * what's actually served, so the bundle always matches the per-country files.
 *
 * Run:
 *   node scripts/fetch-dataset-files.mjs --dataset roads
 *   node scripts/fetch-dataset-files.mjs --dataset admin-boundaries
 *   node scripts/fetch-dataset-files.mjs --dataset roads --out output/_bundle_src/roads
 *
 * Then: python scripts/combine-vector.py --dataset roads
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
})
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Mirrors the table mapping in src/lib/api-datasets.ts. `layer_type` filters
// shared tables; `adm0_only` keeps just level-0 boundaries for the admin
// dataset. Vector datasets combine into a GeoPackage (combine-vector.py); the
// coarse climate rasters combine into a COG (combine-raster.py).
const DATASETS = {
  'rivers':           { table: 'hydrology_layers', layer_type: 'rivers' },
  'lakes':            { table: 'hydrology_layers', layer_type: 'lakes' },
  'watersheds':       { table: 'hydrology_layers', layer_type: 'watersheds' },
  'aquifer':          { table: 'aquifer_layers' },
  'roads':            { table: 'road_layers' },
  'protected-areas':  { table: 'protected_areas_layers' },
  'population':       { table: 'population_settlements_layers' },
  'admin-boundaries': { table: 'admin_boundaries', adm0_only: true },
  // Climate rasters (~5 km) — combined by combine-raster.py, not the vector combiner.
  'rainfall':         { table: 'rainfall_climate_layers', layer_type: 'rainfall' },
  'temperature':      { table: 'rainfall_climate_layers', layer_type: 'temperature' },
  'drought-index':    { table: 'rainfall_climate_layers', layer_type: 'drought_index' },
}

function arg(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function isoFor(row) {
  return String(row.iso3 ?? row.country_code ?? '').toUpperCase()
}

async function main() {
  const slug = arg('--dataset')
  if (!slug || !DATASETS[slug]) {
    console.error(`Usage: node scripts/fetch-dataset-files.mjs --dataset <${Object.keys(DATASETS).join('|')}>`)
    process.exit(1)
  }
  const cfg = DATASETS[slug]
  const outDir = path.resolve(ROOT, arg('--out') ?? path.join('output', '_bundle_src', slug))
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`\nFetching source files for "${slug}" from ${cfg.table}…\n`)

  let q = sb.from(cfg.table).select('*')
  if (cfg.layer_type) q = q.eq('layer_type', cfg.layer_type)
  if (cfg.adm0_only)  q = q.eq('admin_level', 0)
  q = q.order('country', { ascending: true })

  const { data: rows, error } = await q
  if (error) { console.error('DB error:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.error('No rows for this dataset.'); process.exit(1) }

  const index = []
  let ok = 0, fail = 0
  for (const row of rows) {
    const r2Key = row.r2_key
    if (!r2Key) { fail++; continue }
    const iso3 = isoFor(row) || 'XXX'
    // Prefix with iso3 to guarantee unique local names across countries.
    const localName = `${iso3}__${path.basename(r2Key)}`
    const localPath = path.join(outDir, localName)

    process.stdout.write(`  ${String(row.country).padEnd(34)} (${iso3}) ... `)
    try {
      const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: r2Key }))
      const bytes = await obj.Body.transformToByteArray()
      fs.writeFileSync(localPath, Buffer.from(bytes))
      index.push({
        country:       String(row.country),
        iso3,
        r2_key:        r2Key,
        local_path:    localName,
        admin_level:   row.admin_level ?? null,
        variable_name: row.variable_name ?? null,
      })
      console.log(`ok (${(bytes.length / 1_048_576).toFixed(2)} MB)`)
      ok++
    } catch (err) {
      console.log(`R2 ERROR: ${err.message}`)
      fail++
    }
  }

  const manifestPath = path.join(outDir, 'files.json')
  fs.writeFileSync(manifestPath, JSON.stringify({ dataset_id: slug, files: index }, null, 2))
  console.log(`\nDone. ${ok} downloaded, ${fail} failed.`)
  console.log(`Index: ${path.relative(ROOT, manifestPath)}`)
  console.log(`Next:  python scripts/combine-vector.py --dataset ${slug}\n`)
}

main().catch((e) => { console.error('fatal:', e); process.exit(1) })
