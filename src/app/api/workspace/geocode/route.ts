/**
 * GET /api/workspace/geocode?lat=-12.97&lng=28.64   — what place is here?
 * GET /api/workspace/geocode?q=Ndola                — find places by name
 *
 * Proxies OpenStreetMap Nominatim (reverse + search) with an identifying
 * User-Agent and a per-instance cache, per the Nominatim usage policy.
 * Results are limited to Africa and carry the ISO-3 code Lenga files use.
 */
import { NextRequest, NextResponse } from 'next/server'
import { AFRICA_ISO2, AFRICA_ISO2_TO_ISO3 } from '@/lib/workspace/africa'
import { jsonError, requireWorkspace } from '@/lib/workspace/server'
import type { WsPlace } from '@/lib/workspace/types'

export const dynamic = 'force-dynamic'

const UA = 'LengaMaps-Workspace/1.0 (+https://www.lengamaps.com; lengamaps@gmail.com)'
const cache = new Map<string, { at: number; body: unknown }>()
const TTL = 24 * 3600_000

interface NominatimResult {
  lat: string; lon: string; display_name: string; name?: string
  boundingbox?: [string, string, string, string]
  address?: Record<string, string>
}

function toPlace(r: NominatimResult): WsPlace | null {
  const a = r.address ?? {}
  const iso2 = (a.country_code ?? '').toLowerCase()
  const iso3 = AFRICA_ISO2_TO_ISO3[iso2]
  if (!iso3) return null
  const name = r.name || a.city || a.town || a.village || a.municipality || a.county || a.state_district || a.state || a.country || r.display_name
  const bb = r.boundingbox?.map(Number)
  return {
    name,
    region:  a.state || a.region || a.province || '',
    country: a.country ?? '',
    iso3,
    lng: Number(r.lon), lat: Number(r.lat),
    bbox: bb && bb.every(Number.isFinite) ? [bb[2], bb[0], bb[3], bb[1]] : null,
  }
}

async function nominatim(path: string): Promise<unknown> {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL) return hit.body
  const res = await fetch(`https://nominatim.openstreetmap.org${path}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`nominatim ${res.status}`)
  const body = await res.json()
  cache.set(path, { at: Date.now(), body })
  return body
}

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace()
  if ('denied' in gate) return gate.denied
  const sp = req.nextUrl.searchParams

  try {
    const q = (sp.get('q') ?? '').trim().slice(0, 120)
    if (q) {
      const path = `/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=${AFRICA_ISO2.join(',')}&q=${encodeURIComponent(q)}`
      const rows = (await nominatim(path)) as NominatimResult[]
      return NextResponse.json({ places: rows.map(toPlace).filter(Boolean) })
    }
    const lat = Number(sp.get('lat')), lng = Number(sp.get('lng'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return jsonError('bad_request', 400)
    // Round to ~100 m so nearby clicks share a cache entry.
    const path = `/reverse?format=jsonv2&addressdetails=1&zoom=10&lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}`
    const row = (await nominatim(path)) as NominatimResult & { error?: string }
    const place = row && !row.error ? toPlace(row) : null
    return NextResponse.json({ place })
  } catch (err) {
    console.error('[workspace/geocode]', err)
    return jsonError('geocode_failed', 502)
  }
}
