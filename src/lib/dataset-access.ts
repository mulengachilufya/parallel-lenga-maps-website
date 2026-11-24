// src/lib/dataset-access.ts
// Server-side gate for all dataset download API routes.
//
// Paid accounts (individual or team plan) download everything. Free
// accounts download their own three selected datasets (src/lib/entitlements.ts).

import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from './supabase-server'
import { accessFor, canDownload, type Access } from './entitlements'
import { getDownloadUrl } from './r2'
import type { DatasetSlug } from './pricing'

export type { DatasetSlug }

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

/** The signed-in caller's access, or null when signed out. */
export async function callerAccess(verifiedUserId?: string): Promise<Access | null> {
  if (verifiedUserId) return accessFor(service, verifiedUserId)
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return accessFor(service, user.id)
}

/** Does the caller have a paid plan (every dataset)? */
export async function callerCanAccessFiles(): Promise<boolean> {
  return (await callerAccess())?.paid ?? false
}

/** Can the caller download files of this dataset? */
export async function callerCanDownloadDataset(slug: DatasetSlug): Promise<boolean> {
  const a = await callerAccess()
  return !!a && canDownload(a, slug)
}

export const DATASET_DOWNLOAD_TTL = 3600

export function signDatasetFile(key: string, options: { expiresIn?: number; fileName?: string } = {}) {
  return getDownloadUrl(key, options.expiresIn ?? DATASET_DOWNLOAD_TTL, options.fileName)
}

/** Preserve each legacy listing's metadata and response shape. */
export async function withDatasetDownloads<T extends { r2_key: string }>(
  rows: T[],
  enabled: boolean,
  dataset: DatasetSlug | ((row: T) => DatasetSlug | undefined),
  options: { fileName?: (row: T) => string; sidecar?: (row: T) => string } = {},
): Promise<Array<T & { download_url?: string; sidecar_url?: string }>> {
  if (!enabled || !rows.length) return rows
  const access = await callerAccess()
  if (!access) return rows
  return Promise.all(rows.map(async (row) => {
    const slug = typeof dataset === 'function' ? dataset(row) : dataset
    if (!slug || !canDownload(access, slug)) return row
    try {
      const download_url = await signDatasetFile(row.r2_key, { fileName: options.fileName?.(row) })
      if (!options.sidecar) return { ...row, download_url }
      const sidecar_url = await signDatasetFile(options.sidecar(row)).catch(() => undefined)
      return { ...row, download_url, sidecar_url }
    } catch (error) {
      console.warn('[datasets] signing failed', { key: row.r2_key, error })
      return row
    }
  }))
}
