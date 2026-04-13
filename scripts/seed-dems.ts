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
const { S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } = require('@aws-sdk/client-s3')

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

const MULTIPART_THRESHOLD = 500 * 1024 * 1024 // 500MB
const PART_SIZE = 100 * 1024 * 1024 // 100MB chunks

/**
 * Upload a file to R2 — uses multipart for files over 500MB
 */
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
      process.stdout.write(`    part ${partNumber} (${(offset / 1024 / 1024).toFixed(0)}/${(fileSize / 1024 / 1024).toFixed(0)} MB)\r`)
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
  console.log() // newline after progress
}

async function seedDEMs() {
  console.log('Starting DEM seed (elevation only, smallest first)...\n')

  // Only DEM ZIPs — no slope files
  const allFiles = fs.readdirSync(DEM_DIR).filter((f: string) => f.endsWith('.zip') && f.includes('_DEM.'))

  // Sort by file size ascending (smallest first)
  const sorted = allFiles
    .map((f: string) => ({ name: f, size: fs.statSync(path.join(DEM_DIR, f)).size }))
    .sort((a: any, b: any) => a.size - b.size)

  console.log(`Found ${sorted.length} DEM ZIP files (sorted smallest → largest)\n`)

  if (sorted.length === 0) {
    console.log('No DEM ZIP files found.')
    return
  }

  let uploaded = 0

  for (const { name: file, size } of sorted) {
    const country = file.replace('_DEM.zip', '').replace(/_/g, ' ')
    const r2Key = `datasets/DEMs/${country}/${file}`
    const filePath = path.join(DEM_DIR, file)
    const sizeMB = size / (1024 * 1024)

    console.log(`  [${uploaded + 1}/${sorted.length}] ${file} (${sizeMB.toFixed(1)} MB)...`)

    try {
      await uploadToR2(filePath, r2Key)
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`)
      continue
    }

    // Upsert to Supabase immediately after each upload
    const { error } = await supabase
      .from('dem_layers')
      .upsert({
        country,
        layer_type: 'dem',
        r2_key: r2Key,
        file_size_mb: sizeMB,
        file_format: 'GeoTIFF (ZIP)',
        source: 'SRTM 30m',
        resolution: '30m',
      }, { onConflict: 'r2_key' })

    if (error) {
      console.error(`  DB error for ${country}: ${error.message}`)
    } else {
      uploaded++
      console.log(`  ✓ ${country} — uploaded & synced to Supabase (${uploaded}/${sorted.length})`)
    }
  }

  console.log(`\nDone! ${uploaded}/${sorted.length} DEM files uploaded and synced.`)
}

seedDEMs()
