/**
 * seed-district-stats.mjs
 *
 * Seeds one of the district-statistics datasets (crop-production,
 * forest-loss, soil-fertility). Same pattern as seed-rivers-hydrorivers.mjs:
 * reads output/<Folder>/manifest.json (written by
 * scripts/district_stats/<dataset>.py), uploads each country GeoPackage to R2
 * at datasets/<iso3>/<slug>/<file>, and writes one row per country into the
 * dataset's own table.
 *
 * It refuses to run unless output/<Folder>/qa_report.json (written by
 * scripts/district_stats/qa.py) says PASS or PASS-WITH-WARNINGS.
 *
 * Only the dataset's own table and its own R2 prefix are touched.
 *
 * Run:
 *   node scripts/seed-district-stats.mjs crop-production
 *   node scripts/seed-district-stats.mjs crop-production --country ZMB
 *   node scripts/seed-district-stats.mjs crop-production --dry-run
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Per dataset: output folder, table, and the manifest fields that become
// table columns (manifest key -> column).
const DATASETS = {
  'crop-production': {
    folder: 'CropProduction', table: 'crop_production_layers',
    columns: { total_phys_ha: 'total_phys_ha', top_crop: 'top_crop' },
  },
  'forest-loss': {
    folder: 'ForestLoss', table: 'forest_loss_layers',
    columns: {
      tc2000_ha: 'tc2000_ha', loss_total_ha: 'loss_total_ha', loss_since_2021_ha: 'loss_since_2021_ha',
      forest2020_ha: 'forest2020_ha', year_start: 'year_start', year_end: 'year_end',
    },
  },
  'soil-fertility': {
    folder: 'SoilFertility', table: 'soil_fertility_layers',
    columns: { valid_pct_median: 'valid_pct_median' },
  },
}

const slug = process.argv[2]
const spec = DATASETS[slug]
if (!spec) {
  console.error(`Usage: node scripts/seed-district-stats.mjs <${Object.keys(DATASETS).join('|')}> [--country ISO3] [--dry-run]`)
  process.exit(1)
}
const onlyIso = (() => {
  const i = process.argv.indexOf('--country')
  return i >= 0 ? process.argv[i + 1]?.toUpperCase() : undefined
})()
const dryRun = process.argv.includes('--dry-run')

const BASE_DIR = path.resolve(__dirname, '..', 'output', spec.folder)

async function seed() {
  console.log(`${slug} seeder${dryRun ? ' (dry run)' : ''}\n`)

  const qaPath = path.join(BASE_DIR, 'qa_report.json')
  if (!fs.existsSync(qaPath)) {
    console.error(`No QA report. Run: python scripts/district_stats/qa.py ${slug}`)
    process.exit(1)
  }
  const qa = JSON.parse(fs.readFileSync(qaPath, 'utf-8'))
  if (qa.verdict !== 'PASS' && qa.verdict !== 'PASS-WITH-WARNINGS') {
    console.error(`QA verdict is ${qa.verdict}. Fix the failures before seeding:\n  ${qa.fails.slice(0, 10).join('\n  ')}`)
    process.exit(1)
  }
  console.log(`QA: ${qa.verdict} (${qa.date})\n`)

  let manifest = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'manifest.json'), 'utf-8'))
  if (onlyIso) manifest = manifest.filter(m => m.iso3 === onlyIso)
  console.log(`${manifest.length} entries in scope.\n`)

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

  let ok = 0, fail = 0
  for (const entry of manifest) {
    const filePath = path.join(BASE_DIR, entry.filename)
    if (!fs.existsSync(filePath)) { console.warn(`  [${entry.iso3}] file missing — skipping`); fail++; continue }

    const sizeMB = fs.statSync(filePath).size / 1_048_576
    const r2Key  = `datasets/${entry.iso3.toLowerCase()}/${slug}/${entry.filename}`
    process.stdout.write(`  ${entry.country.padEnd(38)} (${entry.iso3}) ${sizeMB.toFixed(2)} MB ... `)

    const row = {
      country:          entry.country,
      iso3:             entry.iso3,
      district_count:   entry.district_count,
      admin_level:      entry.admin_level,
      source:           entry.source,
      source_version:   entry.source_version,
      license:          entry.license,
      boundary_license: entry.boundary_license ?? null,
      r2_key:           r2Key,
      file_size_mb:     Number(sizeMB.toFixed(2)),
      file_format:      'GeoPackage',
      epsg:             4326,
      updated_at:       new Date().toISOString(),
    }
    for (const [key, col] of Object.entries(spec.columns)) row[col] = entry[key] ?? null

    if (dryRun) { console.log(`would upload to ${r2Key}`); ok++; continue }

    try {
      await r2.send(new PutObjectCommand({
        Bucket: BUCKET, Key: r2Key,
        Body: fs.readFileSync(filePath),
        ContentType: 'application/geopackage+sqlite3',
      }))
    } catch (err) { console.error(`R2 ERROR: ${err.message}`); fail++; continue }

    // One row per country in this dataset's own table: replace it on re-seed.
    const { error: delErr } = await sb.from(spec.table).delete().eq('iso3', entry.iso3)
    if (delErr) { console.error(`DB ERROR: ${delErr.message}`); fail++; continue }
    const { error } = await sb.from(spec.table).insert(row)
    if (error) { console.error(`DB ERROR: ${error.message}`); fail++ }
    else { console.log(`ok (${entry.district_count} districts)`); ok++ }
  }
  console.log(`\nDone. ${ok} seeded, ${fail} failed.`)
  if (fail) process.exit(1)
}

seed().catch(err => { console.error('fatal:', err); process.exit(1) })
