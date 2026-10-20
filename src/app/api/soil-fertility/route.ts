import { districtStatsRoute } from '@/lib/district-stats'

export const dynamic = 'force-dynamic'

/**
 * GET /api/soil-fertility
 * Topsoil Fertility by District (iSDAsoil 30 m): one GeoPackage per country.
 * Query params: country, iso3, includeUrl (see src/lib/district-stats.ts).
 */
export const GET = districtStatsRoute('soil-fertility', 'soil_fertility_layers')
