#!/usr/bin/env node
/**
 * Quick R2 discovery script — lists all water-related files in the bucket.
 * Run: node list-r2-water.mjs
 */
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'

// Parse .env.local manually
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = env.CLOUDFLARE_R2_BUCKET_NAME

// Water-related prefixes to check
const prefixes = [
  'datasets/',          // broad scan first
]

async function listAll(prefix) {
  const results = []
  let token

  do {
    const res = await r2.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: token,
    }))

    for (const obj of res.Contents ?? []) {
      results.push({ key: obj.Key, size_mb: (obj.Size / 1024 / 1024).toFixed(2) })
    }
    token = res.NextContinuationToken
  } while (token)

  return results
}

const WATER_KEYWORDS = ['river', 'lake', 'water', 'hydro', 'flood', 'wetland', 'stream', 'basin', 'drainage']

const all = await listAll('datasets/')
const waterFiles = all.filter(f =>
  WATER_KEYWORDS.some(kw => f.key.toLowerCase().includes(kw))
)

console.log(`\n=== Total files in bucket: ${all.length} ===`)
console.log(`=== Water-related files: ${waterFiles.length} ===\n`)

if (waterFiles.length === 0) {
  console.log('No water files found. All top-level prefixes:')
  const prefixSet = new Set(all.map(f => f.key.split('/').slice(0, 2).join('/')))
  prefixSet.forEach(p => console.log(' ', p))
} else {
  waterFiles.forEach(f => console.log(`  ${f.size_mb} MB  ${f.key}`))
}
