/**
 * One place that writes download_events rows, for every way a file leaves
 * Lenga (see migration 046 for the sources). Best-effort: a failed log is
 * reported to the server log and never blocks or fails the download.
 *
 * The website's per-country button logs through /api/usage/consume-download
 * (source 'website'); the bundle and API routes call logDownload directly.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { datasetMeta } from '@/lib/teams'

export type DownloadSource = 'website' | 'bundle' | 'api' | 'api_bundle'

export async function logDownload(
  service: SupabaseClient,
  e: { userId: string; dataset: string; country?: string | null; source: DownloadSource; bytes?: number | null; format?: string | null },
): Promise<void> {
  try {
    const { data: profile } = await service
      .from('profiles').select('full_name, email, org_id').eq('id', e.userId).maybeSingle()
    const meta = datasetMeta(e.dataset)
    const { error } = await service.from('download_events').insert({
      user_id:      e.userId,
      org_id:       profile?.org_id ?? null,
      user_name:    profile?.full_name ?? null,
      user_email:   profile?.email ?? null,
      dataset_slug: e.dataset,
      dataset_name: meta?.name ?? null,
      country:      e.country || null,
      epsg:         meta?.epsg ?? null,
      file_format:  e.format ?? meta?.formats ?? null,
      source:       e.source,
      bytes:        e.bytes ?? null,
    })
    if (error) console.error('[download-log] insert failed:', { source: e.source, error })
  } catch (err) {
    console.error('[download-log] insert threw:', { source: e.source, err })
  }
}
