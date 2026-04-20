/**
 * seed-population-settlements.ts
 * Upload Population & Settlements shapefiles (produced by prepare-population-settlements.py)
 * to R2 and sync metadata to Supabase.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SUPABASE TABLE (run once):
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   CREATE TABLE population_settlements_layers (
 *     id                bigserial PRIMARY KEY,
 *     country           varchar(255)  NOT NULL,
 *     iso3              varchar(3)    NOT NULL,
 *     admin_level       varchar(10)   NOT NULL,              -- 'ADM1' | 'ADM2'
 *     ref_year          integer       NOT NULL,
 *     total_population  bigint        NOT NULL,
 *     feature_count     integer       NOT NULL,
 *     r2_key            varchar(1024) UNIQUE NOT NULL,
 *     file_size_mb      decimal(10,2) NOT NULL,
 *     file_format       varchar(100)  NOT NULL DEFAULT 'Shapefile (ZIP)',
 *     source            varchar(500)  NOT NULL,
 *     hdx_url           varchar(1024),
 *     epsg              integer       NOT NULL DEFAULT 4326,
 *     created_at        timestamptz   NOT NULL DEFAULT now(),
 *     updated_at        timestamptz   NOT NULL DEFAULT now()
 *   );
 *
 *   CREATE INDEX idx_psl_country ON population_settlements_layers(country);
 *   CREATE INDEX idx_psl_iso3    ON population_settlements_layers(iso3);
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Reads output/PopulationSettlements/manifest.json (written by the Python script)
 * and uploads every referenced ZIP.
 *
 * Run:  npx ts-node --skip-project scripts/seed-population-settlements.ts
 * ──────────────────────────────────────────────────────────────────────────
 */

// @ts-ignore
const dotenv = require('dotenv')
dotenv.config({ path: '.env.local' })

// @ts-ignore
const { createClient } = require('@supabase/supabase-js')
// @ts-ignore
const fs = require('fs')
// @ts-ignore
const path = require('path')
// @ts-ignore
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

// ─── Clients ────────────────────────────────────────────────────────────────

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceRoleKey)

// ─── Paths ──────────────────────────────────────────────────────────────────

const BASE_DIR     = path.resolve(__dirname, '..', 'output', 'PopulationSettlements')
const MANIFEST_JSON = path.join(BASE_DIR, 'manifest.json')

// ─── Types ──────────────────────────────────────────────────────────────────

interface ManifestEntry {
  filename: string
  country: string
  iso3: string
  admin_level: 'ADM1' | 'ADM2'
  ref_year: number
  total_population: number
  feature_count: number
  source: string
  hdx_url: string
}

// ─── Upload ─────────────────────────────────────────────────────────────────

async function uploadToR2(filePath: string, r2Key: string) {
  const body = fs.readFileSync(filePath)
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: r2Key,
    Body: body,
    ContentType: 'application/zip',
  }))
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Starting Population & Settlements seed…\n')

  if (!fs.existsSync(BASE_DIR)) {
    console.error(`Source directory not found: ${BASE_DIR}`)
    console.error('Run scripts/prepare-population-settlements.py first.')
    process.exit(1)
  }
  if (!fs.existsSync(MANIFEST_JSON)) {
    console.error(`Manifest not found: ${MANIFEST_JSON}`)
    console.error('Run the Python prep script first — it writes the manifest.')
    process.exit(1)
  }

  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(MANIFEST_JSON, 'utf-8'))
  console.log(`Manifest has ${manifest.length} countries.\n`)

  let uploaded = 0
  let skipped  = 0

  for (let i = 0; i < manifest.length; i++) {
    const entry = manifest[i]
    const filePath = path.join(BASE_DIR, entry.filename)

    if (!fs.existsSync(filePath)) {
      console.warn(`  [${i + 1}/${manifest.length}] ${entry.filename} — file missing, skipping`)
      skipped++
      continue
    }

    const stats = fs.statSync(filePath)
    const sizeMB = stats.size / (1024 * 1024)
    // R2 key: datasets/PopulationSettlements/{iso3}/{filename}
    const r2Key = `datasets/PopulationSettlements/${entry.iso3}/${entry.filename}`

    console.log(`  [${i + 1}/${manifest.length}] ${entry.country} (${entry.iso3}) ${entry.admin_level} ${entry.ref_year} — ${sizeMB.toFixed(2)} MB`)

    try {
      await uploadToR2(filePath, r2Key)
    } catch (err: any) {
      console.error(`    ERROR uploading: ${err.message}`)
      skipped++
      continue
    }

    const { error } = await supabase
      .from('population_settlements_layers')
      .upsert({
        country:          entry.country,
        iso3:             entry.iso3,
        admin_level:      entry.admin_level,
        ref_year:         entry.ref_year,
        total_population: entry.total_population,
        feature_count:    entry.feature_count,
        r2_key:           r2Key,
        file_size_mb:     sizeMB,
        file_format:      'Shapefile (ZIP)',
        source:           entry.source,
        hdx_url:          entry.hdx_url,
        epsg:             4326,
      }, { onConflict: 'r2_key' })

    if (error) {
      console.error(`    DB error: ${error.message}`)
      skipped++
    } else {
      uploaded++
      console.log(`    ✓ pop ${entry.total_population.toLocaleString()} · ${entry.feature_count} features`)
    }
  }

  console.log(`\nDone. ${uploaded} uploaded, ${skipped} skipped.`)
}

seed()
