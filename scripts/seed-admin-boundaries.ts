import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

// Cloudflare R2 client (S3-compatible)
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!

/**
 * List files in R2 under a given prefix
 */
async function listFiles(prefix: string, maxKeys = 100) {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
    MaxKeys: maxKeys,
  })
  const response = await r2.send(command)
  return response.Contents ?? []
}

// Initialize Supabase with service role key for admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

interface AdminBoundary {
  country: string
  country_code?: string
  admin_level: number
  r2_key: string
  file_size_mb: number
  geom_type: string
  source: string
}

/**
 * Parse admin boundary filenames to extract metadata
 * Expected format: geoBoundaries_{COUNTRY_CODE}_{ADMIN_LEVEL}_{FORMAT}.{EXT}
 * Example: geoBoundaries_ZMB_ADM0_all.zip
 */
function parseFilename(filename: string, key: string): AdminBoundary | null {
  // Extract country from path: datasets/{country}/admin-boundaries/{filename}
  const pathParts = key.split('/')
  const country =
    pathParts.length >= 2
      ? pathParts[1].charAt(0).toUpperCase() + pathParts[1].slice(1)
      : 'Unknown'

  // Parse filename for admin level
  // geoBoundaries_ZMB_ADM0_all, geoBoundaries_ZMB_ADM1, etc.
  const adminLevelMatch = filename.match(/ADM(\d)/i)
  const adminLevel = adminLevelMatch ? parseInt(adminLevelMatch[1]) : 0

  // Extract country code (typically 3 letters)
  const countryCodeMatch = filename.match(/geoBoundaries[_-]([A-Z]{3})/i)
  const countryCode = countryCodeMatch ? countryCodeMatch[1] : null

  // Try to guess geometry type from filename
  let geomType = 'MultiPolygon' // default for admin boundaries
  if (filename.includes('points') || filename.includes('Point'))
    geomType = 'Point'

  return {
    country,
    country_code: countryCode || undefined,
    admin_level: adminLevel,
    r2_key: key,
    file_size_mb: 0, // Will be populated from R2 metadata
    geom_type: geomType,
    source: 'geoBoundaries',
  }
}

/**
 * Fetch all admin boundary files from R2 and seed the database
 */
async function seedAdminBoundaries() {
  console.log('🌍 Starting admin boundaries seed...\n')

  try {
    // List all files in datasets/ folder
    const files = await listFiles('datasets/', 1000)
    console.log(`📦 Found ${files?.length || 0} files in R2\n`)

    if (!files || files.length === 0) {
      console.log('⚠️  No files found in R2. Please upload boundary files first.')
      return
    }

    const boundaries: AdminBoundary[] = []
    const seen = new Set<string>()

    // Filter for boundary files and parse metadata
    for (const file of files) {
      if (!file.Key) continue

      // Only process boundary files
      if (
        !file.Key.includes('admin') &&
        !file.Key.includes('geoBoundaries')
      ) {
        continue
      }

      // Skip duplicates (in case of different formats of same boundary)
      if (seen.has(file.Key)) continue
      seen.add(file.Key)

      const filename = path.basename(file.Key)
      const boundary = parseFilename(filename, file.Key)

      if (boundary) {
        // Add file size from R2 metadata
        boundary.file_size_mb = (file.Size || 0) / (1024 * 1024)
        boundaries.push(boundary)
      }
    }

    console.log(`✅ Parsed ${boundaries.length} admin boundary files\n`)

    if (boundaries.length === 0) {
      console.log('⚠️  No boundary files matched expected format')
      return
    }

    // Delete existing records to avoid duplicates
    console.log('🗑️  Clearing existing admin_boundaries table...')
    const { error: deleteError } = await supabase
      .from('admin_boundaries')
      .delete()
      .neq('id', 0)

    if (deleteError) {
      console.error('❌ Error clearing table:', deleteError.message)
      return
    }

    // Insert new records
    console.log(`⬆️  Inserting ${boundaries.length} records into Supabase...\n`)

    const { error: insertError, data } = await supabase
      .from('admin_boundaries')
      .insert(boundaries)
      .select()

    if (insertError) {
      console.error('❌ Insert error:', insertError.message)
      return
    }

    console.log(`✨ Successfully seeded ${data?.length || boundaries.length} admin boundaries!\n`)

    // Summary by country
    const byCountry: Record<string, number> = {}
    boundaries.forEach((b) => {
      byCountry[b.country] = (byCountry[b.country] || 0) + 1
    })

    console.log('📊 Summary by country:')
    Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .forEach(([country, count]) => {
        console.log(`   ${country}: ${count} boundaries`)
      })

    console.log('\n✅ Seed complete! Admin boundaries are ready to use.')
  } catch (error) {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  }
}

// Run the seed
seedAdminBoundaries()
