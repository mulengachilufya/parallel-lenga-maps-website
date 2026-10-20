import { districtStatsRoute } from '@/lib/district-stats'

export const dynamic = 'force-dynamic'

/**
 * GET /api/forest-loss
 * Forest Cover and Tree Cover Loss by District (EUDR-ready): one GeoPackage
 * per country. Query params: country, iso3, includeUrl (see src/lib/district-stats.ts).
 */
export const GET = districtStatsRoute('forest-loss', 'forest_loss_layers')
