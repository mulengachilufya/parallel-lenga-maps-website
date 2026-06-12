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
// Pricing model (locked 2026-06-12 exec meeting, decision D2):
//   flat $45/seat, two named bundles each carrying a $20/mo discount shown
//   against the crossed-out per-seat original. Custom stays full rate.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DatasetSlug } from './pricing'

export const TEAM_TIER_TITLE   = 'For Project Teams and Businesses'
export const TEAM_PRODUCT_NAME = 'Lenga for Projects'
export const TEAM_SEAT_PRICE   = 45 // USD / seat / month

export interface TeamBlock {
  id:         'team-3' | 'team-10' | 'custom'
  label:      string
  seats:      number | null   // null = custom
  price:      string          // what they pay
  original:   string | null   // crossed-out "(instead of $X)" anchor; bundles only
  perSeat:    string | null   // shown ONLY on the custom block
  blurb:      string
}

// The two bundles deliberately do NOT show a per-seat rate — the visible
// price is the bundle price with its saving. $45/seat appears only on Custom
// so the page never contradicts itself.
export const TEAM_BLOCKS: TeamBlock[] = [
  {
    id: 'team-3', label: '3 seats', seats: 3,
    price: '$115/mo', original: '$135', perSeat: null,
    blurb: 'For small project teams getting a shared workspace for the first time.',
  },
  {
    id: 'team-10', label: '10 seats', seats: 10,
    price: '$430/mo', original: '$450', perSeat: null,
    blurb: 'For departments and multi-project teams that live in GIS data.',
  },
  {
    id: 'custom', label: 'Custom', seats: null,
    price: '$45/seat', original: null, perSeat: '$45',
    blurb: 'Any team size. Tell us your seat count and we will quote it.',
  },
]

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
    created_at:          string
  }
}

/**
 * Resolve a user's org membership. MUST be called with the service-role
 * client (membership reads in API routes happen before/independent of RLS).
 * Returns null for users who belong to no organization.
 */
export async function getMembership(
  service: SupabaseClient,
  userId: string,
): Promise<Membership | null> {
  const { data, error } = await service
    .from('organization_members')
    .select('org_id, role, organizations!inner(id, name, sector, region, operating_countries, seat_count, status, contact_email, promo_emails, api_rate_per_min, created_at)')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null
  // supabase-js types embedded relations loosely; normalise to one object.
  const orgRaw = (data as { organizations: unknown }).organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as Membership['org']
  if (!org) return null
  return { org_id: data.org_id, role: data.role as 'owner' | 'member', org }
}

/** Active = the org pays the bills and members keep access. */
export function isOrgActive(m: Membership | null): m is Membership {
  return !!m && m.org.status === 'active'
}
