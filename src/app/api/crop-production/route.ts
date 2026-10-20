import { districtStatsRoute } from '@/lib/district-stats'

export const dynamic = 'force-dynamic'

/**
 * GET /api/crop-production
 * Crop Production by District (MapSPAM 2020): one GeoPackage per country.
 * Query params: country, iso3, includeUrl (see src/lib/district-stats.ts).
 */
export const GET = districtStatsRoute('crop-production', 'crop_production_layers')
