/**
 * GET /api/ops/status — public site notice: the announcement banner and
 * whether maintenance mode is on. Read by every page (cached 30 s).
 */
import { NextResponse } from 'next/server'
import { opsDb } from '@/lib/ops/log'

export const dynamic = 'force-dynamic'

let cache: { at: number; body: unknown } | null = null

export async function GET() {
  if (cache && Date.now() - cache.at < 30_000) return NextResponse.json(cache.body)
  try {
    const { data } = await opsDb().from('ops_settings').select('key, value').in('key', ['banner', 'maintenance'])
    const m = new Map((data ?? []).map((r) => [r.key as string, r.value as Record<string, unknown>]))
    const body = {
      banner: (m.get('banner')?.text as string | undefined) || null,
      maintenance: m.get('maintenance')?.on === true ? { on: true, message: (m.get('maintenance')?.message as string | undefined) || null } : { on: false },
    }
    cache = { at: Date.now(), body }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=30' } })
  } catch {
    return NextResponse.json({ banner: null, maintenance: { on: false } })
  }
}
