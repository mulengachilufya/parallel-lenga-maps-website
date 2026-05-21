/**
 * seed-protected-areas.mjs
 *
 * Plain-Node ESM version of seed-protected-areas.ts. The TS variant was
 * silently producing zero stdout AND zero rows on this Windows box (some
 * ts-node + tsconfig path resolution issue), so this is a flat .mjs that
 * skips the toolchain entirely. Same R2 upload + Supabase upsert logic.
 *
 * Run:  node scripts/seed-protected-areas.mjs
 *       node scripts/seed-protected-areas.mjs --country ZMB
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Load .env.local explicitly (default dotenv only reads .env)
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Clients ─────────────────────────────────────────────────────────────

const r2 = new S3Client({
  region:   'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
})
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  console.error('Has URL:', !!url, ' Has key:', !!key)
  process.exit(1)
}
const supabase = createClient(url, key)

// ─── Paths ───────────────────────────────────────────────────────────────

const BASE_DIR      = path.resolve(__dirname, '..', 'output', 'ProtectedAreas')
const MANIFEST_JSON = path.join(BASE_DIR, 'manifest.json')

// ─── CLI ─────────────────────────────────────────────────────────────────

const onlyIso = (() => {
  const i = process.argv.indexOf('--country')
  return i >= 0 ? process.argv[i + 1]?.toUpperCase() : undefined
})()

// ─── Upload helper ───────────────────────────────────────────────────────

async function uploadToR2(filePath, r2Key) {
  const body = fs.readFileSync(filePath)
  await r2.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         r2Key,
    Body:        body,
    ContentType: 'application/zip',
  }))
}

// ─── Main ────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Starting Protected Areas seed (Node ESM)…')
  console.log('R2 endpoint:', `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)
  console.log('R2 bucket  :', BUCKET)
  console.log('Supabase   :', url)
  console.log()

  if (!fs.existsSync(MANIFEST_JSON)) {
    console.error(`Manifest not found: ${MANIFEST_JSON}`)
    process.exit(1)
  }

  let manifest = JSON.parse(fs.readFileSync(MANIFEST_JSON, 'utf-8'))
  if (onlyIso) manifest = manifest.filter((m) => m.iso3 === onlyIso)
  console.log(`${manifest.length} ${onlyIso ? 'country' : 'countries'} in scope.`)
  console.log()

  let uploaded = 0
  let skipped  = 0

  for (let i = 0; i < manifest.length; i++) {
    const entry    = manifest[i]
    const filePath = path.join(BASE_DIR, entry.filename)

    if (!fs.existsSync(filePath)) {
      console.warn(`  [${i + 1}/${manifest.length}] ${entry.filename} — file missing`)
      skipped++
      continue
    }

    const sizeMB = fs.statSync(filePath).size / (1024 * 1024)
    const r2Key  = `datasets/${entry.iso3.toLowerCase()}/protected_areas/${entry.filename}`

    process.stdout.write(`  [${i + 1}/${manifest.length}] ${entry.country} (${entry.iso3}) — ${entry.feature_count} PAs · ${sizeMB.toFixed(2)} MB ... `)

    try {
      await uploadToR2(filePath, r2Key)
    } catch (err) {
      console.error(`R2 ERROR: ${err.message}`)
      skipped++
      continue
    }

    const { error } = await supabase
      .from('protected_areas_layers')
      .upsert({
        country:             entry.country,
        iso3:                entry.iso3,
        feature_count:       entry.feature_count,
        total_area_km2:      entry.total_area_km2,
        marine_area_km2:     entry.marine_area_km2,
        designation_summary: entry.designation_summary || null,
        source:              entry.source,
        source_version:      entry.source_version,
        r2_key:              r2Key,
        file_size_mb:        Number(sizeMB.toFixed(2)),
        file_format:         'Shapefile (ZIP)',
        epsg:                4326,
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'r2_key' })

    if (error) {
      console.error(`DB ERROR: ${error.message}`)
      skipped++
    } else {
      uploaded++
      console.log('ok')
    }
  }

  console.log()
  console.log(`Done. ${uploaded} uploaded, ${skipped} skipped.`)
}

seed().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
