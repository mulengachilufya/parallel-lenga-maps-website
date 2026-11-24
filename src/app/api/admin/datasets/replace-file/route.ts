import { NextRequest, NextResponse } from 'next/server'
import { copyObject, getSizedUploadUrl, objectMetadata } from '@/lib/r2'
import { datasetAdmin, service } from '@/lib/datasets/job-auth'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 2 * 1024 ** 3

/** Stages a size-limited upload, then freezes a copy for GIS validation. */
export async function POST(req: NextRequest) {
  if (!(await datasetAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (body?.done === true) return finalizeUpload(body.replacement_id)

  const key = typeof body?.key === 'string' ? body.key : ''
  const size = Number(body?.size)
  if (!key || !Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'key and size (bytes) required' }, { status: 400 })
  }
  const { data: file, error } = await service.from('catalog_files').select('id, file_name').eq('r2_key', key).maybeSingle()
  if (error) return NextResponse.json({ error: 'catalogue lookup failed' }, { status: 500 })
  if (!file) return NextResponse.json({ error: 'not a catalogue file' }, { status: 404 })

  const id = crypto.randomUUID()
  const name = (file.file_name || key.split('/').pop() || 'file').replace(/[^-._a-zA-Z0-9]/g, '_')
  const stageKey = `staging/catalog/${id}/${name}`
  const { error: createError } = await service.from('catalog_file_replacements').insert({
    id, catalog_file_id: file.id, previous_key: key, stage_key: stageKey, size_bytes: size,
  })
  if (createError) return NextResponse.json({ error: 'could not stage replacement' }, { status: 500 })

  return NextResponse.json({ replacement_id: id, url: await getSizedUploadUrl(stageKey, size, 900) })
}

async function finalizeUpload(id: unknown) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'replacement_id required' }, { status: 400 })
  }
  const { data: replacement, error } = await service.from('catalog_file_replacements').select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'replacement lookup failed' }, { status: 500 })
  if (!replacement) return NextResponse.json({ error: 'replacement not found' }, { status: 404 })
  if (replacement.status !== 'awaiting_upload') {
    return NextResponse.json({ replacement_id: id, status: replacement.status })
  }

  try {
    const staged = await objectMetadata(replacement.stage_key)
    if (!staged?.ETag || staged.ContentLength !== Number(replacement.size_bytes)) {
      return NextResponse.json({ error: 'staged upload is missing or has the wrong size' }, { status: 409 })
    }
    // Separate attempts use distinct immutable keys, so a losing concurrent
    // request can never overwrite the version selected by another request.
    const oldPath = (replacement.previous_key as string).replace(/^versions\/[^/]+\//, '')
    const versionKey = `versions/${crypto.randomUUID()}/${oldPath}`
    await copyObject(replacement.stage_key, versionKey, staged.ETag)
    const { data: updated, error: updateError } = await service.from('catalog_file_replacements')
      .update({ status: 'ready', version_key: versionKey }).eq('id', id).eq('status', 'awaiting_upload')
      .select('id').maybeSingle()
    if (updateError) throw updateError
    if (!updated) return NextResponse.json({ error: 'replacement already finalized', replacement_id: id }, { status: 409 })
    return NextResponse.json({ replacement_id: id, status: 'ready' }, { status: 202 })
  } catch (error) {
    console.error('[catalogue replacement] staging failed', { id, error })
    return NextResponse.json({ error: 'could not finalize staged upload' }, { status: 502 })
  }
}
