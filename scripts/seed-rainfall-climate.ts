/**
 * seed-rainfall-climate.ts
 * Upload Rainfall / Temperature / Drought files to R2 and sync metadata to Supabase.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SUPABASE TABLE (run this SQL once in the Supabase dashboard > SQL Editor):
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   CREATE TABLE rainfall_climate_layers (
 *     id             bigserial PRIMARY KEY,
 *     country        varchar(255) NOT NULL,
 *     layer_type     varchar(50)  NOT NULL,   -- 'rainfall' | 'temperature' | 'drought_index'
 *     variable_name  varchar(100) NOT NULL,   -- 'Annual Total' | 'Monthly Means' | 'SPI-12' …
 *     year_start     integer      NOT NULL,
 *     year_end       integer      NOT NULL,
 *     r2_key         varchar(1024) UNIQUE NOT NULL,
 *     file_size_mb   decimal(10,2) NOT NULL,
 *     file_format    varchar(100) NOT NULL DEFAULT 'GeoTIFF (ZIP)',
 *     source         varchar(255) NOT NULL,   -- 'CHIRPS v2.0' | 'WorldClim v2.1' | …
 *     resolution     varchar(50)  NOT NULL DEFAULT '0.05° (~5km)',
 *     units          varchar(100) NOT NULL,   -- 'mm/year' | '°C' | 'dimensionless (SPI)'
 *     epsg           integer      NOT NULL DEFAULT 4326,
 *     nodata_value   integer      NOT NULL DEFAULT -9999,
 *     created_at     timestamptz  NOT NULL DEFAULT now(),
 *     updated_at     timestamptz  NOT NULL DEFAULT now()
 *   );
 *
 *   CREATE INDEX idx_rcl_country    ON rainfall_climate_layers(country);
 *   CREATE INDEX idx_rcl_layer_type ON rainfall_climate_layers(layer_type);
 *
 * ──────────────────────────────────────────────────────────────────────────
 * FILE NAMING CONVENTION
 * ──────────────────────────────────────────────────────────────────────────
 * Place files under  output/RainfallClimate/<SubDir>/
 *
 * Filename format:  {Country}_{LayerCode}_{Variable}_{YearStart}-{YearEnd}.zip
 *
 * LayerCode must be one of:
 *   Rainfall      → layer_type = 'rainfall'
 *   Temperature   → layer_type = 'temperature'
 *   DroughtIndex  → layer_type = 'drought_index'
 *
 * Examples:
 *   Zambia_Rainfall_Annual-Total_1981-2023.zip
 *   Kenya_Rainfall_Monthly-Means_1981-2023.zip
 *   South-Africa_Temperature_Monthly-Means_1970-2000.zip
 *   Ethiopia_DroughtIndex_SPI-12_1981-2023.zip
 *
 * The script:
 *   1. Scans all subdirectories of output/RainfallClimate/
 *   2. Parses metadata from each filename
 *   3. Uploads to R2:  datasets/RainfallClimate/{LayerType}/{Country}/{filename}
 *   4. Upserts to Supabase rainfall_climate_layers table
 *   5. Skips files already in R2 (on conflict: r2_key)
 *
 * Run:  npx ts-node --skip-project scripts/seed-rainfall-climate.ts
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
const {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} = require('@aws-sdk/client-s3')

// ─── R2 client ──────────────────────────────────────────────────────────────

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!

// ─── Supabase client ─────────────────────────────────────────────────────────

const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_DIR           = path.resolve(__dirname, '..', 'output', 'RainfallClimate')
const MULTIPART_THRESHOLD = 500 * 1024 * 1024  // 500 MB
const PART_SIZE           = 100 * 1024 * 1024  // 100 MB

// ─── Layer type lookup ───────────────────────────────────────────────────────

const LAYER_TYPE_MAP: Record<string, string> = {
  Rainfall:     'rainfall',
  Temperature:  'temperature',
  DroughtIndex: 'drought_index',
}

const SOURCE_MAP: Record<string, string> = {
  rainfall:     'CHIRPS v2.0',
  temperature:  'WorldClim v2.1',
  drought_index:'CHIRPS-derived SPI',
}

const UNITS_MAP: Record<string, string> = {
  rainfall:     'mm/year',        // overridden to mm/month when variable contains 'monthly'
  temperature:  '°C',
  drought_index:'dimensionless (SPI)',
}

// ─── Parse filename ───────────────────────────────────────────────────────────
// Format: {Country}_{LayerCode}_{Variable}_{YearStart}-{YearEnd}.zip
// e.g.    Zambia_Rainfall_Annual-Total_1981-2023.zip

interface FileMeta {
  country: string
  layer_type: string
  variable_name: string
  year_start: number
  year_end: number
  units: string
  source: string
}

function parseFilename(filename: string): FileMeta | null {
  const base = filename.replace(/\.zip$/i, '')
  const parts = base.split('_')

  if (parts.length < 4) {
    console.warn(`  ⚠  Skipping "${filename}" — expected format: Country_LayerCode_Variable_YearStart-YearEnd.zip`)
    return null
  }

  // Country can have hyphens (e.g. South-Africa) — it's always the first segment
  const country = parts[0].replace(/-/g, ' ')

  // LayerCode is second segment
  const layerCode = parts[1]
  const layer_type = LAYER_TYPE_MAP[layerCode]
  if (!layer_type) {
    console.warn(`  ⚠  Unknown layer code "${layerCode}" in "${filename}". Expected: Rainfall | Temperature | DroughtIndex`)
    return null
  }

  // Variable is third segment (hyphens become spaces)
  const variable_name = parts[2].replace(/-/g, ' ')

  // Year range is fourth segment
  const yearRange = parts[3]
  const yearMatch = yearRange.match(/^(\d{4})-(\d{4})$/)
  if (!yearMatch) {
    console.warn(`  ⚠  Cannot parse year range "${yearRange}" in "${filename}". Expected: YYYY-YYYY`)
    return null
  }
  const year_start = parseInt(yearMatch[1], 10)
  const year_end   = parseInt(yearMatch[2], 10)

  // Units — refine rainfall to mm/month if variable contains 'monthly'
  let units = UNITS_MAP[layer_type]
  if (layer_type === 'rainfall' && variable_name.toLowerCase().includes('monthly')) {
    units = 'mm/month'
  }

  return {
    country,
    layer_type,
    variable_name,
    year_start,
    year_end,
    units,
    source: SOURCE_MAP[layer_type],
  }
}

// ─── R2 upload ───────────────────────────────────────────────────────────────

async function uploadToR2(filePath: string, r2Key: string) {
  const fileSize = fs.statSync(filePath).size

  if (fileSize < MULTIPART_THRESHOLD) {
    const body = fs.readFileSync(filePath)
    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: r2Key,
        Body: body,
        ContentType: 'application/zip',
      })
    )
    return
  }

  // Multipart upload for large files
  const { UploadId } = await r2.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: r2Key,
      ContentType: 'application/zip',
    })
  )

  const parts: any[] = []
  const fd = fs.openSync(filePath, 'r')
  let offset = 0
  let partNumber = 1

  try {
    while (offset < fileSize) {
      const chunkSize = Math.min(PART_SIZE, fileSize - offset)
      const buffer = Buffer.alloc(chunkSize)
      fs.readSync(fd, buffer, 0, chunkSize, offset)

      const { ETag } = await r2.send(
        new UploadPartCommand({
          Bucket: BUCKET,
          Key: r2Key,
          UploadId,
          PartNumber: partNumber,
          Body: buffer,
        })
      )

      parts.push({ ETag, PartNumber: partNumber })
      process.stdout.write(
        `    part ${partNumber} (${(offset / 1024 / 1024).toFixed(0)}/${(fileSize / 1024 / 1024).toFixed(0)} MB)\r`
      )
      offset += chunkSize
      partNumber++
    }
  } finally {
    fs.closeSync(fd)
  }

  await r2.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: r2Key,
      UploadId,
      MultipartUpload: { Parts: parts },
    })
  )
  console.log()
}

// ─── Collect all ZIP files recursively under BASE_DIR ────────────────────────

function collectZips(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const entries: string[] = []
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) {
      entries.push(...collectZips(full))
    } else if (entry.toLowerCase().endsWith('.zip')) {
      entries.push(full)
    }
  }
  return entries
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seedRainfallClimate() {
  console.log('Starting Rainfall / Temperature / Drought seed…\n')

  if (!fs.existsSync(BASE_DIR)) {
    console.error(`Source directory not found: ${BASE_DIR}`)
    console.error('Create it and add your ZIP files following the naming convention in this file\'s header.')
    process.exit(1)
  }

  const allFiles = collectZips(BASE_DIR)

  if (allFiles.length === 0) {
    console.log('No ZIP files found under', BASE_DIR)
    console.log('Add files following the naming convention and re-run.')
    return
  }

  // Sort smallest first so partial runs make progress
  const sorted = allFiles
    .map((f: string) => ({ full: f, name: path.basename(f), size: fs.statSync(f).size }))
    .sort((a: any, b: any) => a.size - b.size)

  console.log(`Found ${sorted.length} ZIP file(s) (sorted smallest → largest)\n`)

  let uploaded = 0
  let skipped  = 0

  for (const { full: filePath, name: filename, size } of sorted) {
    const meta = parseFilename(filename)
    if (!meta) { skipped++; continue }

    const sizeMB = size / (1024 * 1024)
    // R2 key:  datasets/RainfallClimate/{layer_type}/{country}/{filename}
    const r2Key = `datasets/RainfallClimate/${meta.layer_type}/${meta.country}/${filename}`

    console.log(`  [${uploaded + skipped + 1}/${sorted.length}] ${filename} (${sizeMB.toFixed(1)} MB)`)

    try {
      await uploadToR2(filePath, r2Key)
    } catch (err: any) {
      console.error(`  ERROR uploading: ${err.message}`)
      skipped++
      continue
    }

    const { error } = await supabase
      .from('rainfall_climate_layers')
      .upsert(
        {
          country:       meta.country,
          layer_type:    meta.layer_type,
          variable_name: meta.variable_name,
          year_start:    meta.year_start,
          year_end:      meta.year_end,
          r2_key:        r2Key,
          file_size_mb:  sizeMB,
          file_format:   'GeoTIFF (ZIP)',
          source:        meta.source,
          resolution:    '0.05° (~5km)',
          units:         meta.units,
          epsg:          4326,
          nodata_value:  -9999,
        },
        { onConflict: 'r2_key' }
      )

    if (error) {
      console.error(`  DB error for ${meta.country}: ${error.message}`)
      skipped++
    } else {
      uploaded++
      console.log(`  ✓ ${meta.country} — ${meta.layer_type} / ${meta.variable_name} (${uploaded}/${sorted.length})`)
    }
  }

  console.log(`\nDone! ${uploaded} uploaded, ${skipped} skipped/errored.`)
}

seedRainfallClimate()
