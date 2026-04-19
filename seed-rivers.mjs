#!/usr/bin/env node
/**
 * Seed hydrology_layers table with river files from R2.
 * Run: node seed-rivers.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
)

// Exact R2 keys from bucket listing
const RIVERS = [
  { country: 'Algeria',                    r2_key: 'datasets/Rivers/Algeria/Algeria_Rivers.zip',                                       file_size_mb: 42.32 },
  { country: 'Angola',                     r2_key: 'datasets/Rivers/Angola/Angola_Rivers.zip',                                         file_size_mb: 23.95 },
  { country: 'Benin',                      r2_key: 'datasets/Rivers/Benin/Benin_Rivers.zip',                                           file_size_mb: 2.28  },
  { country: 'Botswana',                   r2_key: 'datasets/Rivers/Botswana/Botswana_Rivers.zip',                                     file_size_mb: 10.86 },
  { country: 'Burkina Faso',               r2_key: 'datasets/Rivers/Burkina Faso/Burkina_Faso_Rivers.zip',                             file_size_mb: 5.15  },
  { country: 'Burundi',                    r2_key: 'datasets/Rivers/Burundi/Burundi_Rivers.zip',                                       file_size_mb: 0.51  },
  { country: 'Cameroon',                   r2_key: 'datasets/Rivers/Cameroon/Cameroon_Rivers.zip',                                     file_size_mb: 13.79 },
  { country: 'Central African Republic',   r2_key: 'datasets/Rivers/Central African Republic/Central_African_Republic_Rivers.zip',     file_size_mb: 12.58 },
  { country: 'Chad',                       r2_key: 'datasets/Rivers/Chad/Chad_Rivers.zip',                                             file_size_mb: 22.69 },
  { country: 'Comoros',                    r2_key: 'datasets/Rivers/Comoros/Comoros_Rivers.zip',                                       file_size_mb: 0.06  },
  { country: "Cote d'Ivoire",              r2_key: 'datasets/Rivers/Cote dIvoire/Cote_dIvoire_Rivers.zip',                             file_size_mb: 7.44  },
  { country: 'Democratic Republic of Congo', r2_key: 'datasets/Rivers/Democratic Republic of Congo/Democratic_Republic_of_Congo_Rivers.zip', file_size_mb: 56.21 },
  { country: 'Djibouti',                   r2_key: 'datasets/Rivers/Djibouti/Djibouti_Rivers.zip',                                     file_size_mb: 0.41  },
  { country: 'Egypt',                      r2_key: 'datasets/Rivers/Egypt/Egypt_Rivers.zip',                                           file_size_mb: 17.15 },
  { country: 'Equatorial Guinea',          r2_key: 'datasets/Rivers/Equatorial Guinea/Equatorial_Guinea_Rivers.zip',                   file_size_mb: 1.53  },
  { country: 'Eritrea',                    r2_key: 'datasets/Rivers/Eritrea/Eritrea_Rivers.zip',                                       file_size_mb: 2.28  },
  { country: 'Eswatini',                   r2_key: 'datasets/Rivers/Eswatini/Eswatini_Rivers.zip',                                     file_size_mb: 0.34  },
  { country: 'Ethiopia',                   r2_key: 'datasets/Rivers/Ethiopia/Ethiopia_Rivers.zip',                                     file_size_mb: 21.56 },
  { country: 'Gabon',                      r2_key: 'datasets/Rivers/Gabon/Gabon_Rivers.zip',                                           file_size_mb: 9.90  },
  { country: 'Gambia',                     r2_key: 'datasets/Rivers/Gambia/Gambia_Rivers.zip',                                         file_size_mb: 0.19  },
  { country: 'Ghana',                      r2_key: 'datasets/Rivers/Ghana/Ghana_Rivers.zip',                                           file_size_mb: 4.74  },
  { country: 'Guinea',                     r2_key: 'datasets/Rivers/Guinea/Guinea_Rivers.zip',                                         file_size_mb: 8.35  },
  { country: 'Guinea-Bissau',              r2_key: 'datasets/Rivers/Guinea-Bissau/Guinea-Bissau_Rivers.zip',                           file_size_mb: 1.07  },
  { country: 'Kenya',                      r2_key: 'datasets/Rivers/Kenya/Kenya_Rivers.zip',                                           file_size_mb: 10.75 },
  { country: 'Lesotho',                    r2_key: 'datasets/Rivers/Lesotho/Lesotho_Rivers.zip',                                       file_size_mb: 0.61  },
  { country: 'Liberia',                    r2_key: 'datasets/Rivers/Liberia/Liberia_Rivers.zip',                                       file_size_mb: 5.86  },
  { country: 'Libya',                      r2_key: 'datasets/Rivers/Libya/Libya_Rivers.zip',                                           file_size_mb: 29.66 },
  { country: 'Madagascar',                 r2_key: 'datasets/Rivers/Madagascar/Madagascar_Rivers.zip',                                 file_size_mb: 20.86 },
  { country: 'Malawi',                     r2_key: 'datasets/Rivers/Malawi/Malawi_Rivers.zip',                                         file_size_mb: 2.28  },
  { country: 'Mali',                       r2_key: 'datasets/Rivers/Mali/Mali_Rivers.zip',                                             file_size_mb: 22.93 },
  { country: 'Mauritania',                 r2_key: 'datasets/Rivers/Mauritania/Mauritania_Rivers.zip',                                 file_size_mb: 18.91 },
  { country: 'Morocco',                    r2_key: 'datasets/Rivers/Morocco/Morocco_Rivers.zip',                                       file_size_mb: 11.37 },
  { country: 'Mozambique',                 r2_key: 'datasets/Rivers/Mozambique/Mozambique_Rivers.zip',                                 file_size_mb: 16.19 },
  { country: 'Namibia',                    r2_key: 'datasets/Rivers/Namibia/Namibia_Rivers.zip',                                       file_size_mb: 15.26 },
  { country: 'Niger',                      r2_key: 'datasets/Rivers/Niger/Niger_Rivers.zip',                                           file_size_mb: 21.34 },
  { country: 'Nigeria',                    r2_key: 'datasets/Rivers/Nigeria/Nigeria_Rivers.zip',                                       file_size_mb: 22.93 },
  { country: 'Republic of Congo',          r2_key: 'datasets/Rivers/Republic of Congo/Republic_of_Congo_Rivers.zip',                   file_size_mb: 9.02  },
  { country: 'Rwanda',                     r2_key: 'datasets/Rivers/Rwanda/Rwanda_Rivers.zip',                                         file_size_mb: 0.50  },
  { country: 'Senegal',                    r2_key: 'datasets/Rivers/Senegal/Senegal_Rivers.zip',                                       file_size_mb: 3.47  },
  { country: 'Sierra Leone',               r2_key: 'datasets/Rivers/Sierra Leone/Sierra_Leone_Rivers.zip',                             file_size_mb: 4.98  },
  { country: 'Somalia',                    r2_key: 'datasets/Rivers/Somalia/Somalia_Rivers.zip',                                       file_size_mb: 8.32  },
  { country: 'South Africa',               r2_key: 'datasets/Rivers/South Africa/South_Africa_Rivers.zip',                             file_size_mb: 23.73 },
  { country: 'South Sudan',                r2_key: 'datasets/Rivers/South Sudan/South_Sudan_Rivers.zip',                               file_size_mb: 11.40 },
  { country: 'Sudan',                      r2_key: 'datasets/Rivers/Sudan/Sudan_Rivers.zip',                                           file_size_mb: 33.99 },
  { country: 'Tanzania',                   r2_key: 'datasets/Rivers/Tanzania/Tanzania_Rivers.zip',                                     file_size_mb: 17.97 },
  { country: 'Togo',                       r2_key: 'datasets/Rivers/Togo/Togo_Rivers.zip',                                             file_size_mb: 1.22  },
  { country: 'Tunisia',                    r2_key: 'datasets/Rivers/Tunisia/Tunisia_Rivers.zip',                                       file_size_mb: 3.00  },
  { country: 'Uganda',                     r2_key: 'datasets/Rivers/Uganda/Uganda_Rivers.zip',                                         file_size_mb: 4.61  },
  { country: 'Zambia',                     r2_key: 'datasets/Rivers/Zambia/Zambia_Rivers.zip',                                         file_size_mb: 13.96 },
  { country: 'Zimbabwe',                   r2_key: 'datasets/Rivers/Zimbabwe/Zimbabwe_Rivers.zip',                                     file_size_mb: 7.46  },
]

const rows = RIVERS.map(r => ({
  country:      r.country,
  layer_type:   'rivers',
  r2_key:       r.r2_key,
  file_size_mb: r.file_size_mb,
  file_format:  'ZIP (Shapefile)',
  source:       'HydroSHEDS / FAO',
}))

console.log(`Seeding ${rows.length} river entries...`)

// Clear existing river rows then insert fresh
const { error: delErr } = await supabase
  .from('hydrology_layers')
  .delete()
  .eq('layer_type', 'rivers')

if (delErr) {
  console.error('Delete error:', delErr.message)
  process.exit(1)
}

const { data, error } = await supabase
  .from('hydrology_layers')
  .insert(rows)
  .select('id, country')

if (error) {
  console.error('Insert error:', error.message)
  process.exit(1)
}

console.log(`✅ Seeded ${data.length} river entries:`)
data.forEach(r => console.log(`   ${r.id}  ${r.country}`))
