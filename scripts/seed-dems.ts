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

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const DEM_DIR = path.resolve(__dirname, '..', 'output', 'DEMs')

interface DEMRecord {
  country: string
  layer_type: 'dem' | 'slope'
  r2_key: string
  file_size_mb: number
  file_format: string
  source: string
  resolution: string
}

/**
 * Upload a file to R2 and return the key
 */
async function uploadToR2(filePath: string, r2Key: string) {
  const body = fs.readFileSync(filePath)
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: r2Key,
      Body: body,
      ContentType: 'application/zip',
    })
  )
}

async function seedDEMs() {
  console.log('Starting DEM seed...\n')

  const files = fs.readdirSync(DEM_DIR).filter((f: string) => f.endsWith('.zip'))
  console.log(`Found ${files.length} ZIP files in output/DEMs/\n`)

  if (files.length === 0) {
    console.log('No ZIP files found. Run the DEM pipeline first.')
    return
  }

  const records: DEMRecord[] = []

  for (const file of files) {
    // Pattern: Country_Name_DEM.zip or Country_Name_slope.zip
    const isDEM = file.includes('_DEM.')
    const isSlope = file.includes('_slope.')
    if (!isDEM && !isSlope) continue

    const country = file
      .replace('_DEM.zip', '')
      .replace('_slope.zip', '')
      .replace(/_/g, ' ')

    const layerType: 'dem' | 'slope' = isDEM ? 'dem' : 'slope'
    const r2Key = `datasets/${country.toLowerCase().replace(/ /g, '-')}/dems/${file}`
    const filePath = path.join(DEM_DIR, file)
    const stats = fs.statSync(filePath)
    const sizeMB = stats.size / (1024 * 1024)

    // Upload to R2
    console.log(`  Uploading ${file} (${sizeMB.toFixed(1)} MB)...`)
    try {
      await uploadToR2(filePath, r2Key)
    } catch (err: any) {
      console.error(`  ERROR uploading ${file}: ${err.message}`)
      continue
    }

    records.push({
      country,
      layer_type: layerType,
      r2_key: r2Key,
      file_size_mb: sizeMB,
      file_format: 'GeoTIFF (ZIP)',
      source: 'SRTM 30m',
      resolution: '30m',
    })
  }

  console.log(`\nUploaded ${records.length} files to R2`)

  // Clear existing records
  console.log('Clearing existing dem_layers table...')
  const { error: deleteError } = await supabase
    .from('dem_layers')
    .delete()
    .neq('id', 0)

  if (deleteError) {
    console.error('Error clearing table:', deleteError.message)
    console.log('\nYou may need to create the dem_layers table first. SQL:')
    console.log(`
CREATE TABLE dem_layers (
  id BIGSERIAL PRIMARY KEY,
  country TEXT NOT NULL,
  layer_type TEXT NOT NULL CHECK (layer_type IN ('dem', 'slope')),
  r2_key TEXT NOT NULL UNIQUE,
  file_size_mb REAL NOT NULL DEFAULT 0,
  file_format TEXT NOT NULL DEFAULT 'GeoTIFF (ZIP)',
  source TEXT NOT NULL DEFAULT 'SRTM 30m',
  resolution TEXT NOT NULL DEFAULT '30m',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dem_layers_country ON dem_layers(country);
CREATE INDEX idx_dem_layers_type ON dem_layers(layer_type);

ALTER TABLE dem_layers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON dem_layers FOR SELECT USING (true);
    `)
    return
  }

  // Insert records
  console.log(`Inserting ${records.length} records into Supabase...`)
  const { error: insertError, data } = await supabase
    .from('dem_layers')
    .insert(records)
    .select()

  if (insertError) {
    console.error('Insert error:', insertError.message)
    return
  }

  console.log(`\nSeeded ${data?.length || records.length} DEM layers!`)

  // Summary
  const byCountry: Record<string, number> = {}
  records.forEach((r) => {
    byCountry[r.country] = (byCountry[r.country] || 0) + 1
  })

  console.log('\nSummary:')
  console.log(`  ${Object.keys(byCountry).length} countries`)
  console.log(`  ${records.filter(r => r.layer_type === 'dem').length} DEM files`)
  console.log(`  ${records.filter(r => r.layer_type === 'slope').length} slope files`)
  console.log('\nDone!')
}

seedDEMs()
