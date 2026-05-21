import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TABLES = ['hydrology_layers','admin_boundaries','aquifer_layers','lulc_layers','rainfall_climate_layers','population_settlements_layers','protected_areas_layers']
const COLS   = ['r2_key', 'file_key', 'screenshot_key', 'source']

// 1. Full hydrology_layers dump
const { data: hyd } = await sb.from('hydrology_layers').select('id,country,layer_type,r2_key').order('id')
console.log(`=== hydrology_layers — ${hyd?.length || 0} total rows ===`)
for (const r of hyd ?? []) {
  console.log(`  id=${String(r.id).padEnd(4)} ${(r.country || '').padEnd(40)} ${r.layer_type.padEnd(10)} ${r.r2_key}`)
}
console.log()

// 2. Cross-table substring scan
console.log(`=== searching every table for "Zambia_Rivers.zip" or "datasets/Rivers/" ===`)
const needles = ['%Zambia_Rivers.zip%', '%datasets/Rivers/%']
for (const t of TABLES) {
  for (const col of COLS) {
    for (const n of needles) {
      const { data, error } = await sb.from(t).select('*').like(col, n)
      if (!error && data && data.length > 0) {
        console.log(`HIT in ${t}.${col} (needle=${n}) — ${data.length} rows:`)
        for (const row of data) console.log('  ', JSON.stringify(row))
      }
    }
  }
}
console.log('done.')
