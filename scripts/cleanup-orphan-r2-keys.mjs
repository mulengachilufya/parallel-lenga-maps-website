/**
 * cleanup-orphan-r2-keys.mjs
 *
 * Audits R2 for files that aren't referenced by any current row in any
 * dataset table. Reports them. With --confirm, deletes them.
 *
 * Two scenarios this catches:
 *   1. Manual experiments: you renamed/moved a file in R2 without
 *      updating Supabase, leaving the new path orphaned (if the DB row
 *      was deleted) or the old path orphaned (if the DB row was updated).
 *   2. Pipeline format changes: rivers went shapefile-ZIP → GeoPackage.
 *      The seeder DELETEs the DB row pointing at the old .zip and
 *      INSERTs a new row pointing at the .gpkg, but the .zip stays in R2
 *      forever. This script removes those.
 *
 * Safety rails:
 *   - Default mode is DRY-RUN. Reports orphans, deletes nothing.
 *   - Only scans keys under `datasets/` prefix. payment-screenshots/*
 *     and any other non-dataset prefixes are NEVER touched.
 *   - LULC sidecars: a key like `…/lulc.tif.aux.xml` is KEPT if a DB row
 *     references the parent `…/lulc.tif`. (The lulc API serves the
 *     sidecar by appending .aux.xml to the r2_key at download time, so
 *     the sidecar isn't tracked separately in Supabase but is still in use.)
 *   - ATTRIBUTION.txt / SCHEMA.txt inside dataset ZIPs aren't separate
 *     R2 keys (they're inside the ZIP), so nothing to worry about there.
 *
 * CLI:
 *   node scripts/cleanup-orphan-r2-keys.mjs                # dry-run (default)
 *   node scripts/cleanup-orphan-r2-keys.mjs --confirm      # actually delete
 *   node scripts/cleanup-orphan-r2-keys.mjs --confirm --prefix datasets/Rivers/
 *
 * Required env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CLOUDFLARE_R2_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   CLOUDFLARE_R2_BUCKET_NAME
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// ─── Tables to scan for r2_key references ───────────────────────────────────

const DATASET_TABLES = [
  'hydrology_layers',
  'admin_boundaries',
  'aquifer_layers',
  'lulc_layers',
  'rainfall_climate_layers',
  'population_settlements_layers',
  'protected_areas_layers',
]

// Only audit objects under this prefix. Keeps payment-screenshots/ etc.
// completely out of reach.
const ROOT_PREFIX = 'datasets/'

// A key matching `{parent}.aux.xml` is preserved if `{parent}` is in the
// referenced set. Add to this list if you introduce more sidecar formats.
const SIDECAR_SUFFIXES = ['.aux.xml']

// ─── Clients ────────────────────────────────────────────────────────────────

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
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in .env.local')
  process.exit(1)
}
const supabase = createClient(sbUrl, sbKey)

// ─── CLI ────────────────────────────────────────────────────────────────────

const confirmDelete = process.argv.includes('--confirm')
const prefixArg = (() => {
  const i = process.argv.indexOf('--prefix')
  return i >= 0 ? process.argv[i + 1] : ROOT_PREFIX
})()

// ─── Helpers ────────────────────────────────────────────────────────────────

async function collectReferencedKeys() {
  const referenced = new Set()
  for (const table of DATASET_TABLES) {
    const { data, error } = await supabase.from(table).select('r2_key')
    if (error) {
      // Table may not exist in this env — that's fine, skip.
      console.warn(`  ! ${table}: ${error.message} (skipping)`)
      continue
    }
    for (const row of data ?? []) {
      if (row.r2_key) referenced.add(row.r2_key)
    }
  }
  return referenced
}

async function listAllR2Objects(prefix) {
  const out = []
  let token
  do {
    const res = await r2.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
      MaxKeys: 1000,
    }))
    for (const o of res.Contents ?? []) out.push({ Key: o.Key, Size: o.Size ?? 0 })
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

function isSidecarOf(key, referencedSet) {
  for (const suffix of SIDECAR_SUFFIXES) {
    if (key.endsWith(suffix)) {
      const parent = key.slice(0, -suffix.length)
      if (referencedSet.has(parent)) return true
    }
  }
  return false
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('R2 orphan-key audit')
  console.log('  bucket :', BUCKET)
  console.log('  prefix :', prefixArg)
  console.log('  mode   :', confirmDelete ? 'DELETE (--confirm)' : 'DRY-RUN')
  console.log()

  console.log('Step 1: collecting r2_key values from Supabase…')
  const referenced = await collectReferencedKeys()
  console.log(`  ${referenced.size} keys referenced across ${DATASET_TABLES.length} tables`)
  console.log()

  console.log(`Step 2: listing all objects under ${prefixArg}…`)
  const all = await listAllR2Objects(prefixArg)
  console.log(`  ${all.length} objects in R2`)
  console.log()

  console.log('Step 3: cross-referencing…')
  const orphans = []
  let keptByDb = 0
  let keptAsSidecar = 0
  for (const obj of all) {
    if (referenced.has(obj.Key)) { keptByDb++; continue }
    if (isSidecarOf(obj.Key, referenced)) { keptAsSidecar++; continue }
    orphans.push(obj)
  }
  const orphanBytes = orphans.reduce((s, o) => s + o.Size, 0)

  console.log(`  ${keptByDb} kept (referenced by a DB row)`)
  console.log(`  ${keptAsSidecar} kept (sidecar for a referenced key)`)
  console.log(`  ${orphans.length} orphans, total ${humanSize(orphanBytes)}`)
  console.log()

  if (orphans.length === 0) {
    console.log('Nothing to clean up.')
    return
  }

  // Print up to 25 sample orphans so the operator can sanity-check.
  const sample = orphans.slice(0, 25)
  console.log('Sample orphans (first 25):')
  for (const o of sample) {
    console.log(`  ${humanSize(o.Size).padStart(10)}  ${o.Key}`)
  }
  if (orphans.length > sample.length) {
    console.log(`  … and ${orphans.length - sample.length} more`)
  }
  console.log()

  if (!confirmDelete) {
    console.log('DRY-RUN — nothing deleted.')
    console.log('Re-run with `--confirm` to actually remove these objects from R2.')
    return
  }

  console.log(`Step 4: deleting ${orphans.length} orphans…`)
  // DeleteObjects max 1000 keys per request — batch.
  let deleted = 0
  for (let i = 0; i < orphans.length; i += 1000) {
    const batch = orphans.slice(i, i + 1000)
    const res = await r2.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: batch.map((o) => ({ Key: o.Key })), Quiet: true },
    }))
    if (res.Errors && res.Errors.length > 0) {
      console.error(`  ! batch ${i / 1000} had ${res.Errors.length} errors:`)
      for (const e of res.Errors) console.error(`      ${e.Key}: ${e.Message}`)
    }
    deleted += batch.length - (res.Errors?.length ?? 0)
    console.log(`  …${deleted}/${orphans.length} done`)
  }

  console.log()
  console.log(`Done. Deleted ${deleted} of ${orphans.length} orphan objects (${humanSize(orphanBytes)}).`)
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
