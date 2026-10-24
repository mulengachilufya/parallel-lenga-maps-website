import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'
import { callerCanDownloadDataset } from '@/lib/dataset-access'
import { CATALOG } from '@/lib/catalog'
import type { DatasetSlug } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

export interface CatalogFile {
  id:            number
  slug:          string
  iso3:          string
  country:       string
  label:         string
  file_name:     string
  r2_key:        string
  file_format:   string
  file_size_mb:  number
  download_url?: string
}

/**
 * GET /api/catalog/:slug
 * Per-country files of a dataset in catalog_files (src/lib/catalog.ts).
 * Download links only for callers who may download the dataset.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!(slug in CATALOG)) return NextResponse.json({ error: 'unknown dataset' }, { status: 404 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await supabase.from('catalog_files').select('*').eq('slug', slug)
    .order('country', { ascending: true }).order('label', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let files: CatalogFile[] = data ?? []
  if (files.length && await callerCanDownloadDataset(slug as DatasetSlug)) {
    files = await Promise.all(files.map(async (f) => {
      try { return { ...f, download_url: await getDownloadUrl(f.r2_key, 3600) } } catch { return f }
    }))
  }
  return NextResponse.json({ count: files.length, files })
}
