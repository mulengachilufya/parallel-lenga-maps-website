/**
 * seed-rivers-hydrorivers.mjs
 *
 * Reads output/Rivers/manifest.json (written by prepare-rivers-hydrorivers.py),
 * uploads each country GeoPackage to R2, and REPLACES the rivers rows in
 * hydrology_layers (layer_type = 'rivers') — swapping the coarse Natural Earth
 * layer for the detailed HydroRIVERS network.
 *
 * Run:
 *   node scripts/seed-rivers-hydrorivers.mjs
 *   node scripts/seed-rivers-hydrorivers.mjs --country ZMB
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

const r2 = new S3Client({
  region:   'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
})
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const BASE_DIR      = path.resolve(__dirname, '..', 'output', 'Rivers')
const MANIFEST_JSON = path.join(BASE_DIR, 'manifest.json')

const onlyIso = (() => {
  const i = process.argv.indexOf('--country')
  return i >= 0 ? process.argv[i + 1]?.toUpperCase() : undefined
})()

async function seed() {
  console.log('HydroRIVERS seeder\n')
  if (!fs.existsSync(MANIFEST_JSON)) {
    console.error('No manifest. Run scripts/prepare-rivers-hydrorivers.py first.')
    process.exit(1)
  }
  let manifest = JSON.parse(fs.readFileSync(MANIFEST_JSON, 'utf-8'))
  if (onlyIso) manifest = manifest.filter(m => m.iso3 === onlyIso)
  console.log(`${manifest.length} entries in scope.\n`)

  let ok = 0, fail = 0
  for (const entry of manifest) {
    const filePath = path.join(BASE_DIR, entry.filename)
    if (!fs.existsSync(filePath)) { console.warn(`  [${entry.iso3}] file missing — skipping`); fail++; continue }

    const sizeMB = fs.statSync(filePath).size / 1_048_576
    const r2Key  = `datasets/${entry.iso3.toLowerCase()}/rivers/${entry.filename}`
    process.stdout.write(`  ${entry.country.padEnd(38)} (${entry.iso3}) ${sizeMB.toFixed(2)} MB ... `)

    try {
      await r2.send(new PutObjectCommand({
        Bucket: BUCKET, Key: r2Key,
        Body: fs.readFileSync(filePath),
        ContentType: 'application/geopackage+sqlite3',
      }))
    } catch (err) { console.error(`R2 ERROR: ${err.message}`); fail++; continue }

    // Replace any existing rivers row for this country (was Natural Earth).
    await sb.from('hydrology_layers').delete()
      .eq('country', entry.country).eq('layer_type', 'rivers')

    const { error } = await sb.from('hydrology_layers').insert({
      country:      entry.country,
      layer_type:   'rivers',
      r2_key:       r2Key,
      file_size_mb: Number(sizeMB.toFixed(2)),
      file_format:  'GeoPackage',
      source:       entry.source,
    })

    if (error) { console.error(`DB ERROR: ${error.message}`); fail++ }
    else { console.log(`ok (${Number(entry.reach_count).toLocaleString()} reaches)`); ok++ }
  }
  console.log(`\nDone. ${ok} seeded, ${fail} failed.`)
}

seed().catch(err => { console.error('fatal:', err); process.exit(1) })
