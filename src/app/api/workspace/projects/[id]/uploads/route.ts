/**
 * GET  /api/workspace/projects/:id/uploads
 *   → { used, limit, max_file } bytes of the project's storage allowance
 * POST /api/workspace/projects/:id/uploads — { files: [{ name, size }] } (editor)
 *   → { uploads: [{ key, url }], used, limit } one presigned R2 PUT per file.
 *
 * Team uploads live in R2 under workspace-uploads/<org>/<project>/. Each URL
 * is signed for the exact byte size approved here, so the allowance holds.
 * The layers route checks the stored size again when the file is attached.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSizedUploadUrl } from '@/lib/r2'
import { jsonError, loadProject, needRole, projectUploadBytes, readJson, requireWorkspace, str } from '@/lib/workspace/server'
import { MAX_UPLOAD_BYTES, PROJECT_QUOTA_BYTES, UPLOAD_PREFIX } from '@/lib/workspace/upload-limits'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)
  return NextResponse.json({ used: await projectUploadBytes(id), limit: PROJECT_QUOTA_BYTES, max_file: MAX_UPLOAD_BYTES })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const { id } = await params
  const project = await loadProject(gate, id)
  if (!project) return jsonError('not_found', 404)
  { const denied = needRole(project, 'editor'); if (denied) return denied }

  const body = await readJson(req)
  const files: Record<string, unknown>[] = Array.isArray(body.files) ? body.files.slice(0, 41) : []
  if (!files.length || files.length > 40) return jsonError('bad_request', 400)

  const wanted = files.map((f) => ({
    name: str(f.name, 200).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'file',
    size: Number(f.size),
  }))
  if (wanted.some((f) => !Number.isInteger(f.size) || f.size <= 0)) return jsonError('bad_request', 400)
  if (wanted.some((f) => f.size > MAX_UPLOAD_BYTES)) return jsonError('file_too_large', 413)

  const used = await projectUploadBytes(id)
  const adding = wanted.reduce((n, f) => n + f.size, 0)
  if (used + adding > PROJECT_QUOTA_BYTES) {
    return NextResponse.json({ error: 'project_full', used, limit: PROJECT_QUOTA_BYTES }, { status: 413 })
  }

  try {
    const uploads = await Promise.all(wanted.map(async (f) => {
      const key = `${UPLOAD_PREFIX}/${gate.membership.org_id}/${id}/${crypto.randomUUID().slice(0, 8)}-${f.name}`
      return { key, url: await getSizedUploadUrl(key, f.size, 3600) }
    }))
    return NextResponse.json({ uploads, used, limit: PROJECT_QUOTA_BYTES })
  } catch (err) {
    console.error('[workspace/uploads] sign failed', err)
    return jsonError('sign_failed', 500)
  }
}
