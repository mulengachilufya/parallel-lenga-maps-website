/**
 * PUT /api/admin/sales/settings — { focus_countries?: string[] (ISO3),
 * signature?: string, my_name?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSettings, jsonError, requireFullAdmin, saveSettings, validCountry } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  // The signature and name go on the owners' outgoing email, so only they change them.
  const gate = await requireFullAdmin()
  if ('denied' in gate) return gate.denied
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const next: Parameters<typeof saveSettings>[0] = {}
  if (Array.isArray(body.focus_countries)) {
    next.focus_countries = [...new Set(body.focus_countries.map(validCountry).filter((c): c is string => !!c))].slice(0, 20)
  }
  if (typeof body.signature === 'string') next.signature = body.signature.slice(0, 1000)
  if (typeof body.my_name === 'string' && body.my_name.trim()) next.my_name = body.my_name.trim().slice(0, 80)
  if (!Object.keys(next).length) return jsonError('validation', 400, 'Nothing to save.')

  await saveSettings(next, gate.email)
  return NextResponse.json({ ok: true, settings: await getSettings() })
}
