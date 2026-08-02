/**
 * seed-bundles.mjs
 *
 * Step 3 (final) of the continental-bundle build. Reads
 * output/bundles/bundles-manifest.json (written by combine-vector.py), uploads
 * each combined file to R2 under bundles/<slug>_africa.gpkg, and upserts the
 * dataset_bundles row the bundle endpoint reads.
 *
 * Run:  node scripts/seed-bundles.mjs
 *       node scripts/seed-bundles.mjs --dataset roads
 *
 * PREREQUISITE: run migration 020_create_dataset_bundles.sql in Supabase first,
 * and build at least one bundle:
 *   node   scripts/fetch-dataset-files.mjs --dataset roads
 *   python scripts/combine-vector.py       --dataset roads
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
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

const BUNDLES_DIR   = path.resolve(ROOT, 'output', 'bundles')
const MANIFEST_JSON = path.join(BUNDLES_DIR, 'bundles-manifest.json')

// Content type per format so R2 serves the object as a download, not a page.
const CONTENT_TYPE = {
  'GeoPackage':     'application/geopackage+sqlite3',
  'GeoTIFF (COG)':  'image/tiff',
}

const onlyDataset = (() => {
  const i = process.argv.indexOf('--dataset')
  return i >= 0 ? process.argv[i + 1] : undefined
})()

async function seed() {
  console.log('Continental bundle seeder\n')
  if (!fs.existsSync(MANIFEST_JSON)) {
    console.error('No bundles manifest. Run scripts/combine-vector.py first.')
    process.exit(1)
  }

  let manifest = JSON.parse(fs.readFileSync(MANIFEST_JSON, 'utf-8'))
  if (onlyDataset) manifest = manifest.filter((m) => m.dataset_id === onlyDataset)
  if (manifest.length === 0) { console.error('Nothing to seed.'); process.exit(1) }
  console.log(`${manifest.length} bundle(s) in scope.\n`)

  let ok = 0, fail = 0
  for (const entry of manifest) {
    const filePath = path.join(BUNDLES_DIR, entry.filename)
    if (!fs.existsSync(filePath)) {
      console.warn(`  [${entry.dataset_id}] file missing (${entry.filename}) — skipping`)
      fail++; continue
    }

    const sizeMB = fs.statSync(filePath).size / 1_048_576
    process.stdout.write(`  ${entry.dataset_id.padEnd(18)} → ${entry.r2_key} (${sizeMB.toFixed(2)} MB) ... `)

    try {
      await r2.send(new PutObjectCommand({
        Bucket:      BUCKET,
        Key:         entry.r2_key,
        Body:        fs.readFileSync(filePath),
        ContentType: CONTENT_TYPE[entry.file_format] ?? 'application/octet-stream',
      }))
    } catch (err) {
      console.log(`R2 ERROR: ${err.message}`); fail++; continue
    }

    const { error } = await sb.from('dataset_bundles').upsert({
      dataset_id:    entry.dataset_id,
      r2_key:        entry.r2_key,
      file_format:   entry.file_format,
      file_size_mb:  Number(sizeMB.toFixed(2)),
      bytes:         entry.bytes ?? fs.statSync(filePath).size,
      file_count:    entry.file_count ?? 0,
      feature_count: entry.feature_count ?? null,
      layers:        entry.layers ?? null,
      built_at:      new Date().toISOString(),
    }, { onConflict: 'dataset_id' })

    if (error) {
      console.log(`DB ERROR: ${error.message}`); fail++
    } else {
      console.log(`ok (${entry.file_count} countries, ${Number(entry.feature_count ?? 0).toLocaleString()} features)`)
      ok++
    }
  }

  console.log(`\nDone. ${ok} seeded, ${fail} failed.`)
}

seed().catch((err) => { console.error('fatal:', err); process.exit(1) })
