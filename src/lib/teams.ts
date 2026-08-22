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
// Pricing model (updated 2026-08, once-off migration):
//   flat $45/seat, once-off, 2-seat minimum. No bundles, no discount framing —
//   $45 is already $5 below the $50 Individual plan per seat, and that's the
//   whole story. Team size is always confirmed on the quote.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DatasetSlug } from './pricing'

export const TEAM_TIER_TITLE   = 'For Project Teams and Businesses'
export const TEAM_PRODUCT_NAME = 'Lenga for Projects'
export const TEAM_SEAT_PRICE   = 45 // USD / seat, once-off
export const TEAM_MIN_SEATS    = 2

export interface TeamBlock {
  id:      'custom'
  label:   string
  blurb:   string
}

export const TEAM_BLOCKS: TeamBlock[] = [
  {
    id: 'custom', label: 'Team plan',
    blurb: `Once-off, per seat. ${TEAM_MIN_SEATS}-seat minimum. Tell us your seat count and we'll confirm the total.`,
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
