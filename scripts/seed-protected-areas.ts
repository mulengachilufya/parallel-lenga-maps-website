/**
 * seed-protected-areas.ts
 *
 * Reads output/ProtectedAreas/manifest.json (written by
 * scripts/prepare-protected-areas.py), uploads each country's ZIP to R2,
 * and upserts metadata into Supabase (table: protected_areas_layers,
 * created via supabase/migrations/008_create_protected_areas_layers.sql).
 *
 * Required env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CLOUDFLARE_R2_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   CLOUDFLARE_R2_BUCKET_NAME
 *
 * Run:
 *   npx ts-node --skip-project scripts/seed-protected-areas.ts
 *   npx ts-node --skip-project scripts/seed-protected-areas.ts --country ZMB
 *
 * Idempotent: re-running re-uploads + upserts (ON CONFLICT r2_key).
 */

// @ts-ignore
const dotenv = require('dotenv')
dotenv.config({ path: '.env.local' })

// @ts-ignore
const { createClient } = require('@supabase/supabase-js')
// @ts-ignore
const fs   = require('fs')
// @ts-ignore
const path = require('path')
// @ts-ignore
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

// ─── Clients ────────────────────────────────────────────────────────────────

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
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

const BASE_DIR      = path.resolve(__dirname, '..', 'output', 'ProtectedAreas')
const MANIFEST_JSON = path.join(BASE_DIR, 'manifest.json')

// ─── Manifest type — must match what the Python prep writes ─────────────────

interface ManifestEntry {
  filename:             string   // e.g. "ZMB_ProtectedAreas.zip"
  country:              string   // "Zambia"
  iso3:                 string   // "ZMB"
  feature_count:        number
  total_area_km2:       number
  marine_area_km2:      number | null
  designation_summary:  string
  source:               string   // attribution string
  source_version:       string   // e.g. "WDPA Mar 2025"
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const onlyIso = (() => {
  const i = process.argv.indexOf('--country')
  return i >= 0 ? process.argv[i + 1]?.toUpperCase() : undefined
})()

// ─── Upload helper ──────────────────────────────────────────────────────────

async function uploadToR2(filePath: string, r2Key: string) {
  const body = fs.readFileSync(filePath)
  await r2.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         r2Key,
    Body:        body,
    ContentType: 'application/zip',
  }))
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Starting Protected Areas seed…\n')

  if (!fs.existsSync(BASE_DIR)) {
    console.error(`Source directory not found: ${BASE_DIR}`)
    console.error('Run scripts/prepare-protected-areas.py first.')
    process.exit(1)
  }
  if (!fs.existsSync(MANIFEST_JSON)) {
    console.error(`Manifest not found: ${MANIFEST_JSON}`)
    console.error('Run the Python prep script first — it writes the manifest.')
    process.exit(1)
  }

  let manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(MANIFEST_JSON, 'utf-8'))
  if (onlyIso) manifest = manifest.filter((m) => m.iso3 === onlyIso)
  console.log(`${manifest.length} ${onlyIso ? 'country' : 'countries'} in scope.\n`)

  let uploaded = 0
  let skipped  = 0

  for (let i = 0; i < manifest.length; i++) {
    const entry    = manifest[i]
    const filePath = path.join(BASE_DIR, entry.filename)

    if (!fs.existsSync(filePath)) {
      console.warn(`  [${i + 1}/${manifest.length}] ${entry.filename} — file missing, skipping`)
      skipped++
      continue
    }

    const sizeMB = fs.statSync(filePath).size / (1024 * 1024)
    // R2 layout matches the per-country dataset convention used elsewhere:
    //   datasets/{country-folder}/protected_areas/{filename}
    // We use lowercase iso3 as the country folder so all country-keyed
    // datasets sit under the same parent prefix and can be enumerated
    // together later if needed.
    const r2Key = `datasets/${entry.iso3.toLowerCase()}/protected_areas/${entry.filename}`

    console.log(`  [${i + 1}/${manifest.length}] ${entry.country} (${entry.iso3}) — ${entry.feature_count} PAs · ${sizeMB.toFixed(2)} MB`)

    try {
      await uploadToR2(filePath, r2Key)
    } catch (err: any) {
      console.error(`    ERROR uploading: ${err.message}`)
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
      console.error(`    DB error: ${error.message}`)
      skipped++
    } else {
      uploaded++
      console.log(`    ✓ ${entry.total_area_km2.toLocaleString()} km² total · ${entry.designation_summary || '(no desig summary)'}`)
    }
  }

  console.log(`\nDone. ${uploaded} uploaded, ${skipped} skipped.`)
}

seed()
