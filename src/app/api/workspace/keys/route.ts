/**
 * The caller's end-to-end encryption identity for direct messages.
 *
 * GET  → { key: WrappedKey | null }  their active key, still wrapped with
 *        their passphrase (the server can't unwrap it).
 * POST → create one: { key_id, public_jwk, wrapped_private, salt, iv,
 *        iterations, reset? }. With reset: true an existing key is retired
 *        first; messages sent to it can no longer be read by anyone.
 * PUT  → passphrase change: the same key re-wrapped. key_id and public_jwk
 *        must match the active key.
 */
import { NextRequest, NextResponse } from 'next/server'
import { jsonError, readJson, requireWorkspace, service } from '@/lib/workspace/server'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

function parseWrapped(input: Record<string, unknown>) {
  const s = (k: string, max: number) => (typeof input[k] === 'string' && (input[k] as string).length <= max ? input[k] as string : '')
  const jwk = input.public_jwk as Record<string, unknown> | undefined
  const key_id = s('key_id', 36)
  const wrapped_private = s('wrapped_private', 4000), salt = s('salt', 64), iv = s('iv', 64)
  const iterations = Number(input.iterations)
  const okJwk = !!jwk && jwk.kty === 'EC' && jwk.crv === 'P-256' && typeof jwk.x === 'string' && typeof jwk.y === 'string'
    && (jwk.x as string).length <= 64 && (jwk.y as string).length <= 64 && !('d' in jwk)
  if (!UUID.test(key_id) || !okJwk || !B64.test(wrapped_private) || !B64.test(salt) || !B64.test(iv)
      || !Number.isInteger(iterations) || iterations < 100000 || iterations > 5_000_000) return null
  return { key_id, public_jwk: { kty: 'EC', crv: 'P-256', x: jwk!.x as string, y: jwk!.y as string }, wrapped_private, salt, iv, iterations }
}

async function active(userId: string) {
  const { data } = await service.from('workspace_user_keys')
    .select('key_id, public_jwk, wrapped_private, salt, iv, iterations, created_at')
    .eq('user_id', userId).is('retired_at', null).maybeSingle()
  return data
}

export async function GET() {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  return NextResponse.json({ key: await active(gate.user.id) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const input = await readJson(req)
  const w = parseWrapped(input)
  if (!w) return jsonError('bad_key', 400)
  const current = await active(gate.user.id)
  if (current && input.reset !== true) return jsonError('key_exists', 409)
  if (current) {
    await service.from('workspace_user_keys').update({ retired_at: new Date().toISOString() })
      .eq('key_id', current.key_id).eq('user_id', gate.user.id)
  }
  const { error } = await service.from('workspace_user_keys').insert({ ...w, user_id: gate.user.id })
  if (error) return jsonError('save_failed', 500)
  return NextResponse.json({ key: w }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const w = parseWrapped(await readJson(req))
  if (!w) return jsonError('bad_key', 400)
  const current = await active(gate.user.id)
  const pub = current?.public_jwk as { x?: string; y?: string } | undefined
  if (!current || current.key_id !== w.key_id || pub?.x !== w.public_jwk.x || pub?.y !== w.public_jwk.y) {
    return jsonError('key_mismatch', 409)
  }
  const { error } = await service.from('workspace_user_keys')
    .update({ wrapped_private: w.wrapped_private, salt: w.salt, iv: w.iv, iterations: w.iterations })
    .eq('key_id', w.key_id).eq('user_id', gate.user.id)
  if (error) return jsonError('save_failed', 500)
  return NextResponse.json({ key: w })
}
