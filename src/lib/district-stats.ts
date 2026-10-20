// src/lib/district-stats.ts
//
// Server side of the district-statistics datasets (crop-production,
// forest-loss, soil-fertility). Each one has its own table with one row per
// country GeoPackage; the list routes are identical apart from the slug and
// table, so they share this handler. Download URLs go through the same
// access check as every other dataset (callerCanDownloadDataset), and the
// client logs the download through /api/usage/consume-download.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadDataset } from '@/lib/dataset-access'
import type { DatasetSlug } from '@/lib/pricing'

export interface DistrictStatsLayer {
  id:               number
  country:          string
  iso3:             string
  district_count:   number
  admin_level:      number
  source:           string
  source_version:   string
  license:          string
  boundary_license: string | null
  r2_key:           string
  file_size_mb:     number
  file_format:      string
  epsg:             number
  created_at:       string
  download_url?:    string
  /** Dataset-specific national totals (total_phys_ha, tc2000_ha, …). */
  [stat: string]:   unknown
}

/**
 * GET handler for /api/<slug>.
 * Query params:
 *   - country:    case-insensitive substring filter on country name
 *   - iso3:       exact ISO-3 match (e.g. ZMB)
 *   - includeUrl: include presigned download URL (default: true)
 * The list is public; `download_url` is only signed for callers who can
 * download this dataset (paid plan or one of their free picks).
 */
export function districtStatsRoute(slug: DatasetSlug, table: string) {
  return async function GET(request: NextRequest) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    try {
      const params     = request.nextUrl.searchParams
      const country    = params.get('country')
      const iso3       = params.get('iso3')
      const includeUrl = params.get('includeUrl') !== 'false'

      let query = supabase.from(table).select('*')
      if (country) query = query.ilike('country', `%${country}%`)
      if (iso3)    query = query.eq('iso3', iso3.toUpperCase())
      query = query.order('country', { ascending: true })

      const { data, error } = await query
      if (error) {
        console.error(`[${slug}] database error:`, error)
        return NextResponse.json({ error: `Failed to fetch ${slug} layers`, details: error.message }, { status: 500 })
      }

      let layers: DistrictStatsLayer[] = data || []
      const allowed = includeUrl ? await callerCanDownloadDataset(slug) : false
      if (allowed && layers.length > 0) {
        layers = await Promise.all(layers.map(async (layer) => {
          try {
            return { ...layer, download_url: await getDownloadUrl(layer.r2_key, 3600) }
          } catch {
            return layer
          }
        }))
      }
      return NextResponse.json({ count: layers.length, layers })
    } catch (err) {
      console.error(`[${slug}] API error:`, err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
