/**
 * seed-lakes.mjs
 *
 * Reads output/Lakes/manifest.json (written by prepare-lakes.py), uploads each
 * per-country GeoPackage to R2, and upserts a row into hydrology_layers with
 * layer_type = 'lakes'.
 *
 * Lakes share the hydrology_layers table with rivers + watersheds but are a
 * distinct dataset (layer_type discriminates). This seeder ONLY ever touches
 * rows where layer_type = 'lakes', so it can never clobber rivers/watersheds.
 *
 * Run:
 *   node scripts/seed-lakes.mjs                # all countries in manifest
 *   node scripts/seed-lakes.mjs --country ZMB  # single country
 *
 * Required env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CLOUDFLARE_R2_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   CLOUDFLARE_R2_BUCKET_NAME
 *
 * Idempotent: re-running replaces each country's lakes row + R2 object in place.
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

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!sbUrl || !sbKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — set them in .env.local')
  process.exit(1)
}
const sb = createClient(sbUrl, sbKey)

const BASE_DIR      = path.resolve(__dirname, '..', 'output', 'Lakes')
const MANIFEST_JSON = path.join(BASE_DIR, 'manifest.json')

const onlyIso = (() => {
  const i = process.argv.indexOf('--country')
  return i >= 0 ? process.argv[i + 1]?.toUpperCase() : undefined
})()

async function seed() {
  console.log('Lakes seeder')
  console.log('  R2 bucket :', BUCKET)
  console.log('  Supabase  :', sbUrl, '\n')

  if (!fs.existsSync(MANIFEST_JSON)) {
    console.error('No manifest found. Run scripts/prepare-lakes.py first.')
    process.exit(1)
  }

  let manifest = JSON.parse(fs.readFileSync(MANIFEST_JSON, 'utf-8'))
  if (onlyIso) manifest = manifest.filter((m) => m.iso3 === onlyIso)
  console.log(`${manifest.length} entries in scope.\n`)

  let ok = 0, fail = 0
  for (const entry of manifest) {
    const filePath = path.join(BASE_DIR, entry.filename)
    if (!fs.existsSync(filePath)) {
      console.warn(`  [${entry.iso3}] file missing — skipping`)
      fail++
      continue
    }

    const sizeMB = fs.statSync(filePath).size / 1_048_576
    const r2Key  = `datasets/${entry.iso3.toLowerCase()}/lakes/${entry.filename}`
    process.stdout.write(`  ${entry.country.padEnd(38)} (${entry.iso3}) ${sizeMB.toFixed(2)} MB ... `)

    // 1. Upload to R2
    try {
      await r2.send(new PutObjectCommand({
        Bucket:      BUCKET,
        Key:         r2Key,
        Body:        fs.readFileSync(filePath),
        ContentType: 'application/geopackage+sqlite3',
      }))
    } catch (err) {
      console.error(`R2 ERROR: ${err.message}`)
      fail++
      continue
    }

    // 2. Replace the lakes row for this country (idempotent). Scoped to
    //    layer_type='lakes' so rivers/watersheds rows are never affected.
    const { error: delErr } = await sb.from('hydrology_layers')
      .delete()
      .eq('country', entry.country)
      .eq('layer_type', 'lakes')
    if (delErr) {
      console.error(`DB DELETE ERROR: ${delErr.message}`)
      fail++
      continue
    }

    const { error: insErr } = await sb.from('hydrology_layers').insert({
      country:      entry.country,
      layer_type:   'lakes',
      r2_key:       r2Key,
      file_size_mb: Number(sizeMB.toFixed(2)),
      file_format:  'GeoPackage',
      source:       entry.source,
    })
    if (insErr) {
      console.error(`DB INSERT ERROR: ${insErr.message}`)
      fail++
    } else {
      console.log(`ok (${entry.lake_count} lakes)`)
      ok++
    }
  }

  console.log(`\nDone. ${ok} seeded, ${fail} failed.`)
}

seed().catch((err) => { console.error('fatal:', err); process.exit(1) })
