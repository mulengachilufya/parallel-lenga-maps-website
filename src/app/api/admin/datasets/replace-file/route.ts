/**
 * Admin: replace a catalogue file in R2 with a corrected copy.
 *
 * POST { key, size }              presigned PUT for exactly `size` bytes
 * POST { key, size, done: true }  after the upload: checks the stored size
 *                                 and updates catalog_files.file_size_mb
 *
 * Only keys already listed in catalog_files can be written, so this can fix
 * a file but never add one or touch anything else in the bucket.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSizedUploadUrl, objectSize } from '@/lib/r2'
import { datasetAdmin, service } from '@/lib/datasets/job-auth'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 2 * 1024 ** 3

export async function POST(req: NextRequest) {
  if (!(await datasetAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const key = typeof body.key === 'string' ? body.key : ''
  const size = Number(body.size)
  if (!key || !Number.isInteger(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'key and size (bytes) required' }, { status: 400 })
  }

  const { data: rows, error } = await service.from('catalog_files').select('id').eq('r2_key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ error: 'not a catalogue file' }, { status: 404 })

  if (!body.done) return NextResponse.json({ url: await getSizedUploadUrl(key, size, 900) })

  const stored = await objectSize(key)
  if (stored !== size) return NextResponse.json({ error: `stored size ${stored} does not match ${size}` }, { status: 409 })
  const mb = Math.round((size / 1048576) * 100) / 100
  const { error: upErr } = await service.from('catalog_files').update({ file_size_mb: mb }).eq('r2_key', key)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, file_size_mb: mb })
}
