// src/lib/dataset-access.ts
// Server-side gate for all dataset download API routes.
//
// Paid accounts (individual or team plan) download everything. Free
// accounts download the 3 datasets they picked, plus the 3 their free team
// picked (src/lib/entitlements.ts).

import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from './supabase-server'
import { accessFor, canDownload, type Access } from './entitlements'
import type { DatasetSlug } from './pricing'

export type { DatasetSlug }

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

/** The signed-in caller's access, or null when signed out. */
export async function callerAccess(): Promise<Access | null> {
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
