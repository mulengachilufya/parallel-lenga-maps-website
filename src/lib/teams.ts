// src/lib/teams.ts
//
// Shared logic for "For Project Teams and Businesses" (internal name:
// Lenga for Projects; route /projects; plan slug 'team').
//
// Naming is intentional and must not be conflated:
//   customer-facing title  →  "For Project Teams and Businesses"
//   internal/product name  →  "Lenga for Projects"
//   page route             →  /projects
//
// Pricing model (updated 2026-09): fixed 3-month packages, not per seat —
//   up to 4 seats for $350, up to 12 seats for $1,000, per 3 months.
//   organizations.access_expires_at ends the period (null = permanent). Defined in
//   TEAM_PACKAGES (src/lib/pricing.ts). Larger teams are quoted.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isExpired, type DatasetSlug } from './pricing'

export const TEAM_TIER_TITLE   = 'For Project Teams and Businesses'
export const TEAM_PRODUCT_NAME = 'Lenga for Projects'

export const QUOTE_SECTORS = [
  { value: 'mining',   label: 'Mining' },
  { value: 'water',    label: 'Water & Hydrogeology' },
  { value: 'ngo',      label: 'NGO / Development' },
  { value: 'gov',      label: 'Government' },
  { value: 'research', label: 'Research & Academia' },
  { value: 'other',    label: 'Other' },
] as const

// ── Dataset metadata for download events + team dashboard ──────────────────
// CRS / format facts as DELIVERED, verified against the catalogue
// (src/lib/supabase.ts). Every layer ships EPSG:4326; LULC carries the
// reprojection note because its source grid is Goode Homolosine — exactly
// the kind of detail that prevents a teammate re-pulling or mis-projecting.

export interface DatasetMeta {
  name:    string
  epsg:    string
  formats: string
  raster:  boolean
}

export const DATASET_META: Record<DatasetSlug, DatasetMeta> = {
  'admin-boundaries': { name: 'Administrative Boundaries',         epsg: 'EPSG:4326', formats: 'Shapefile · GeoJSON · KML', raster: false },
  'aquifer':          { name: 'Transboundary Aquifers',            epsg: 'EPSG:4326', formats: 'Shapefile · GeoJSON',       raster: false },
  'drought-index':    { name: 'Drought Index (SPI-12)',            epsg: 'EPSG:4326', formats: 'GeoTIFF',                   raster: true  },
  'rainfall':         { name: 'Rainfall & Climate',                epsg: 'EPSG:4326', formats: 'GeoTIFF',                   raster: true  },
  'protected-areas':  { name: 'Protected Areas & Wildlife',        epsg: 'EPSG:4326', formats: 'Shapefile · GeoJSON',       raster: false },
  'watersheds':       { name: 'Watershed Boundaries (HydroBASINS)',epsg: 'EPSG:4326', formats: 'Shapefile · GeoJSON',       raster: false },
  'population':       { name: 'Population & Settlements',          epsg: 'EPSG:4326', formats: 'Shapefile · GeoJSON',       raster: false },
  'rivers':           { name: 'River Networks',                    epsg: 'EPSG:4326', formats: 'Shapefile · GeoJSON',       raster: false },
  'roads':            { name: 'Roads & Infrastructure',            epsg: 'EPSG:4326', formats: 'Shapefile · GeoJSON',       raster: false },
  'temperature':      { name: 'Temperature',                       epsg: 'EPSG:4326', formats: 'GeoTIFF',                   raster: true  },
  'hydrorivers':      { name: 'HydroRIVERS',                       epsg: 'EPSG:4326', formats: 'Shapefile · GeoJSON',       raster: false },
  'lulc':             { name: 'Land Use / Land Cover',             epsg: 'EPSG:4326 (reprojected from Homolosine)', formats: 'GeoTIFF', raster: true },
  'lakes':            { name: 'Lakes',                             epsg: 'EPSG:4326', formats: 'Shapefile · GeoJSON',       raster: false },
  'soil':             { name: 'Soil Classification (WRB)',         epsg: 'EPSG:4326', formats: 'GeoTIFF',                   raster: true  },
  'wetlands':         { name: 'Wetlands & Floodplains',            epsg: 'EPSG:4326', formats: 'GeoTIFF',                   raster: true  },
}

export function datasetMeta(slug: string): DatasetMeta | null {
  return (DATASET_META as Record<string, DatasetMeta>)[slug] ?? null
}

// ── Membership lookup (service-role only) ──────────────────────────────────

export interface Membership {
  org_id:       string
  role:         'owner' | 'member'
  org: {
    id:                  string
    name:                string
    sector:              string | null
    region:              string | null
    operating_countries: string[]
    seat_count:          number
    status:              'active' | 'suspended' | 'cancelled'
    contact_email:       string | null
    promo_emails:        boolean
    api_rate_per_min:    number
    access_expires_at:   string | null   // null = permanent (grandfathered, or a free team)
    created_at:          string
    plan:                'paid' | 'free'  // 'free' = the 2-seat free team (migration 041)
    free_datasets:       string[] | null  // a free team's 3 chosen datasets
  }
}

const MEMBERSHIP_SELECT =
  'org_id, role, joined_at, organizations!inner(id, name, sector, region, operating_countries, seat_count, status, contact_email, promo_emails, api_rate_per_min, access_expires_at, created_at, plan, free_datasets)'

/**
 * Every team the user is on, earliest joined first (migration 044: one
 * person can be on many teams). Service-role client only.
 */
export async function listMemberships(service: SupabaseClient, userId: string): Promise<Membership[]> {
  const { data, error } = await service
    .from('organization_members')
    .select(MEMBERSHIP_SELECT)
    .eq('user_id', userId)
    .order('joined_at', { ascending: true, nullsFirst: false })
  if (error || !data) return []
  return data.flatMap((row) => {
    // supabase-js types embedded relations loosely; normalise to one object.
    const orgRaw = (row as { organizations: unknown }).organizations
    const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as Membership['org'] | undefined
    return org ? [{ org_id: row.org_id as string, role: row.role as 'owner' | 'member', org }] : []
  })
}

/**
 * The team the user has open: profiles.org_id when it is still one of their
 * teams, else the first team they joined. Every team-scoped route (team
 * page, workspace, entitlements) works on this one. MUST be called with the
 * service-role client. Returns null for users on no team.
 */
export async function getMembership(
  service: SupabaseClient,
  userId: string,
): Promise<Membership | null> {
  const [all, { data: profile }] = await Promise.all([
    listMemberships(service, userId),
    service.from('profiles').select('org_id').eq('id', userId).maybeSingle(),
  ])
  if (!all.length) return null
  return all.find((m) => m.org_id === profile?.org_id) ?? all[0]
}

/** Open another of the user's teams. False when they are not on it. */
export async function openTeam(service: SupabaseClient, userId: string, orgId: string): Promise<boolean> {
  const all = await listMemberships(service, userId)
  if (!all.some((m) => m.org_id === orgId)) return false
  const { error } = await service.from('profiles').update({ org_id: orgId }).eq('id', userId)
  return !error
}

/** Is the user on any active, paid team? (A paid team carries every dataset.) */
export async function hasActivePaidTeam(service: SupabaseClient, userId: string): Promise<boolean> {
  return (await listMemberships(service, userId)).some((m) => m.org.plan !== 'free' && isOrgActive(m))
}

/** Active = the org is in good standing and its paid period hasn't ended. */
export function isOrgActive(m: Membership | null): m is Membership {
  return !!m && m.org.status === 'active' && !isExpired(m.org.access_expires_at)
}
