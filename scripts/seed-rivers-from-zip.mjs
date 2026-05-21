/**
 * seed-rivers-from-zip.mjs
 *
 * Replace the rivers layer for each country with the user-supplied
 * Natural Earth GeoPackage files (one .gpkg per country, attribute table
 * embedded — no sidecar files).
 *
 * Source convention:
 *   The user drops *_rivers.gpkg files into a folder (default: ~/Downloads).
 *   Filename = "<Country>_rivers.gpkg" using Natural Earth's country names
 *   (underscores in place of spaces; "Côte_dIvoire", "United_Republic_of_Tanzania",
 *   "Democratic_Republic_of_the_Congo", etc.). We map those to the canonical
 *   country name we use in the database (so the dashboard label stays
 *   consistent with the rest of the app).
 *
 * What it does, per country:
 *   1. Upload the .gpkg to R2 at  datasets/{iso3}/rivers/{Country}_rivers.gpkg
 *   2. DELETE any existing row in hydrology_layers where
 *        country = <canonical name> AND layer_type = 'rivers'
 *   3. INSERT a fresh row with file_size_mb, file_format='GeoPackage',
 *        source='Natural Earth — Rivers (1:10m, significant)'
 *
 * Optional flag --purge-missing: AFTER all seeding, delete any river rows
 * still in hydrology_layers whose country isn't in the new set. Use this
 * once at the end to enforce "if it's not in the new ZIP, it shouldn't
 * appear on the dashboard".
 *
 * CLI:
 *   node scripts/seed-rivers-from-zip.mjs --country Zambia
 *   node scripts/seed-rivers-from-zip.mjs --all
 *   node scripts/seed-rivers-from-zip.mjs --all --purge-missing
 *   node scripts/seed-rivers-from-zip.mjs --source-dir "C:/somewhere/else"
 *
 * Required env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CLOUDFLARE_R2_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   CLOUDFLARE_R2_BUCKET_NAME
 *
 * Idempotent: re-run safely. Each country invocation replaces in place.
 */

import 'dotenv/config'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── ISO3 + display-name registry ─────────────────────────────────────────────
// Filename stem → { iso3, display }. `display` is what gets written to the
// `country` column in hydrology_layers (matches other datasets' naming).

const FILENAME_TO_COUNTRY = {
  'Angola':                            { iso3: 'AGO', display: 'Angola' },
  'Benin':                             { iso3: 'BEN', display: 'Benin' },
  'Botswana':                          { iso3: 'BWA', display: 'Botswana' },
  'Burkina_Faso':                      { iso3: 'BFA', display: 'Burkina Faso' },
  'Burundi':                           { iso3: 'BDI', display: 'Burundi' },
  'Cameroon':                          { iso3: 'CMR', display: 'Cameroon' },
  'Central_African_Republic':          { iso3: 'CAF', display: 'Central African Republic' },
  'Chad':                              { iso3: 'TCD', display: 'Chad' },
  'Congo':                             { iso3: 'COG', display: 'Congo' },
  'Côte_dIvoire':                      { iso3: 'CIV', display: "Cote d'Ivoire" },
  'Democratic_Republic_of_the_Congo':  { iso3: 'COD', display: 'Democratic Republic of the Congo' },
  'Egypt':                             { iso3: 'EGY', display: 'Egypt' },
  'Equatorial_Guinea':                 { iso3: 'GNQ', display: 'Equatorial Guinea' },
  'Eritrea':                           { iso3: 'ERI', display: 'Eritrea' },
  'Ethiopia':                          { iso3: 'ETH', display: 'Ethiopia' },
  'Gabon':                             { iso3: 'GAB', display: 'Gabon' },
  'Gambia':                            { iso3: 'GMB', display: 'Gambia' },
  'Ghana':                             { iso3: 'GHA', display: 'Ghana' },
  'Guinea':                            { iso3: 'GIN', display: 'Guinea' },
  'Guinea-Bissau':                     { iso3: 'GNB', display: 'Guinea-Bissau' },
  'Kenya':                             { iso3: 'KEN', display: 'Kenya' },
  'Lesotho':                           { iso3: 'LSO', display: 'Lesotho' },
  'Liberia':                           { iso3: 'LBR', display: 'Liberia' },
  'Madagascar':                        { iso3: 'MDG', display: 'Madagascar' },
  'Malawi':                            { iso3: 'MWI', display: 'Malawi' },
  'Mali':                              { iso3: 'MLI', display: 'Mali' },
  'Mauritania':                        { iso3: 'MRT', display: 'Mauritania' },
  'Morocco':                           { iso3: 'MAR', display: 'Morocco' },
  'Mozambique':                        { iso3: 'MOZ', display: 'Mozambique' },
  'Namibia':                           { iso3: 'NAM', display: 'Namibia' },
  'Niger':                             { iso3: 'NER', display: 'Niger' },
  'Nigeria':                           { iso3: 'NGA', display: 'Nigeria' },
  'Rwanda':                            { iso3: 'RWA', display: 'Rwanda' },
  'Senegal':                           { iso3: 'SEN', display: 'Senegal' },
  'Sierra_Leone':                      { iso3: 'SLE', display: 'Sierra Leone' },
  'Somalia':                           { iso3: 'SOM', display: 'Somalia' },
  'South_Africa':                      { iso3: 'ZAF', display: 'South Africa' },
  'South_Sudan':                       { iso3: 'SSD', display: 'South Sudan' },
  'Sudan':                             { iso3: 'SDN', display: 'Sudan' },
  'Togo':                              { iso3: 'TGO', display: 'Togo' },
  'Uganda':                            { iso3: 'UGA', display: 'Uganda' },
  'United_Republic_of_Tanzania':       { iso3: 'TZA', display: 'Tanzania' },
  'Zambia':                            { iso3: 'ZMB', display: 'Zambia' },
  'Zimbabwe':                          { iso3: 'ZWE', display: 'Zimbabwe' },
}

const SOURCE_LABEL = 'Natural Earth — Rivers (1:10m, significant)'
const FILE_FORMAT  = 'GeoPackage'

// ─── Client setup ────────────────────────────────────────────────────────────

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
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL — set them in .env.local')
  process.exit(1)
}
const supabase = createClient(sbUrl, sbKey)

// ─── CLI parsing ─────────────────────────────────────────────────────────────

function getArg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const onlyCountry  = getArg('--country')
const sourceDir    = getArg('--source-dir') || path.join(os.homedir(), 'Downloads')
const seedAll      = process.argv.includes('--all')
const purgeMissing = process.argv.includes('--purge-missing')

if (!onlyCountry && !seedAll && !purgeMissing) {
  console.error('Pass --country <Name> OR --all  (optionally --purge-missing)')
  console.error('Run "node scripts/seed-rivers-from-zip.mjs --help" for the full list of flags.')
  process.exit(1)
}

// ─── Per-country seed ────────────────────────────────────────────────────────

async function seedCountry(stem) {
  const meta = FILENAME_TO_COUNTRY[stem]
  if (!meta) {
    console.warn(`  ! unknown filename stem "${stem}" — skipping`)
    return false
  }
  const filePath = path.join(sourceDir, `${stem}_rivers.gpkg`)
  if (!fs.existsSync(filePath)) {
    console.warn(`  ! file not found: ${filePath} — skipping`)
    return false
  }

  const sizeMB = fs.statSync(filePath).size / (1024 * 1024)
  const r2Key  = `datasets/${meta.iso3.toLowerCase()}/rivers/${stem}_rivers.gpkg`

  process.stdout.write(`  → ${meta.display.padEnd(36)} (${meta.iso3}) ${sizeMB.toFixed(2)} MB ... `)

  // 1. Upload to R2
  try {
    const body = fs.readFileSync(filePath)
    await r2.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         r2Key,
      Body:        body,
      ContentType: 'application/geopackage+sqlite3',
    }))
  } catch (err) {
    console.error(`R2 ERROR: ${err.message}`)
    return false
  }

  // 2. Delete old rivers row(s) for this country (idempotent — handles
  //    the format change from shapefile-ZIP to GeoPackage cleanly).
  const { error: delErr } = await supabase
    .from('hydrology_layers')
    .delete()
    .eq('country', meta.display)
    .eq('layer_type', 'rivers')
  if (delErr) {
    console.error(`DB DELETE ERROR: ${delErr.message}`)
    return false
  }

  // 3. Insert the new row
  const { error: insErr } = await supabase
    .from('hydrology_layers')
    .insert({
      country:      meta.display,
      layer_type:   'rivers',
      r2_key:       r2Key,
      file_size_mb: Number(sizeMB.toFixed(2)),
      file_format:  FILE_FORMAT,
      source:       SOURCE_LABEL,
    })
  if (insErr) {
    console.error(`DB INSERT ERROR: ${insErr.message}`)
    return false
  }

  console.log('ok')
  return true
}

// ─── Purge ───────────────────────────────────────────────────────────────────

async function purge() {
  const keepCountries = Object.values(FILENAME_TO_COUNTRY).map((m) => m.display)
  console.log(`\nPurging rivers rows for countries NOT in the new set (${keepCountries.length} keep-list)…`)

  const { data: existing, error: selErr } = await supabase
    .from('hydrology_layers')
    .select('id, country, r2_key')
    .eq('layer_type', 'rivers')
  if (selErr) {
    console.error(`DB SELECT ERROR: ${selErr.message}`)
    return
  }

  const toPurge = (existing ?? []).filter((r) => !keepCountries.includes(r.country))
  if (toPurge.length === 0) {
    console.log('  nothing to purge — every existing row is in the keep-list')
    return
  }

  console.log(`  purging ${toPurge.length} rows:`)
  for (const r of toPurge) {
    console.log(`    - ${r.country}  (r2_key: ${r.r2_key})`)
  }

  const { error: delErr } = await supabase
    .from('hydrology_layers')
    .delete()
    .in('id', toPurge.map((r) => r.id))
  if (delErr) {
    console.error(`DB PURGE ERROR: ${delErr.message}`)
    return
  }
  console.log(`  ✓ purged ${toPurge.length} stale rivers rows`)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Rivers seeder')
  console.log('  source dir :', sourceDir)
  console.log('  R2 bucket  :', BUCKET)
  console.log('  Supabase   :', sbUrl)
  console.log()

  let ok = 0, fail = 0

  if (onlyCountry) {
    // Find the stem matching this country name (case-insensitive, flexible)
    const target = onlyCountry.toLowerCase().replace(/\s+/g, '_')
    const stem = Object.keys(FILENAME_TO_COUNTRY).find(
      (s) => s.toLowerCase() === target ||
             FILENAME_TO_COUNTRY[s].display.toLowerCase() === onlyCountry.toLowerCase() ||
             FILENAME_TO_COUNTRY[s].iso3 === onlyCountry.toUpperCase()
    )
    if (!stem) {
      console.error(`Unknown country "${onlyCountry}". Use one of:`)
      for (const s of Object.keys(FILENAME_TO_COUNTRY)) {
        console.error(`  --country "${FILENAME_TO_COUNTRY[s].display}"  (or ${FILENAME_TO_COUNTRY[s].iso3})`)
      }
      process.exit(1)
    }
    const success = await seedCountry(stem)
    success ? ok++ : fail++
  } else if (seedAll) {
    const stems = Object.keys(FILENAME_TO_COUNTRY)
    console.log(`Seeding all ${stems.length} countries:\n`)
    for (const stem of stems) {
      const success = await seedCountry(stem)
      success ? ok++ : fail++
    }
  }

  console.log(`\nSeed done. ${ok} succeeded, ${fail} failed.`)

  if (purgeMissing) await purge()
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
