// src/components/district-stats-config.ts
//
// What each district-statistics dataset shows on its dashboard page: the
// API route, the per-country facts on each card, and the source credits
// (CC BY 4.0 requires attribution wherever the data is offered).

import type { DatasetSlug } from '@/lib/pricing'
import type { DistrictStatsLayer } from '@/lib/district-stats'

export interface SourceCredit {
  name:       string
  by:         string
  url:        string
  licence:    string
  licenceUrl: string
}

export interface DistrictStatsConfig {
  slug:     DatasetSlug
  api:      string
  /** Loading / empty-state noun, e.g. "crop production data". */
  noun:     string
  /** Short source line in the banner and footer. */
  source:   string
  /** Full Tailwind class strings (kept literal so Tailwind sees them). */
  tone:     { banner: string; hover: string; button: string; ring: string; icon: string }
  credits:  SourceCredit[]
  /** Shown under the banner, e.g. caveats a buyer must know. */
  note?:    string
  /** Lines shown on each country card. */
  facts:    (l: DistrictStatsLayer) => string[]
}

const num = (v: unknown, digits = 0) =>
  v === null || v === undefined || v === '' ? '–' : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits })

export const GEOBOUNDARIES_CREDIT: SourceCredit = {
  name: 'geoBoundaries (district outlines)', by: 'William & Mary geoLab',
  url: 'https://www.geoboundaries.org', licence: 'CC BY 4.0 / per-country open licence',
  licenceUrl: 'https://www.geoboundaries.org/index.html#usage',
}

export const DISTRICT_STATS: Partial<Record<DatasetSlug, DistrictStatsConfig>> = {
  'crop-production': {
    slug: 'crop-production', api: '/api/crop-production', noun: 'crop production data',
    source: 'IFPRI MapSPAM 2020 v1.0 · CC BY 4.0',
    tone: { banner: 'bg-lime-50 border-lime-200', hover: 'hover:border-lime-300', button: 'bg-lime-700 hover:bg-lime-800 text-white', ring: 'focus:ring-lime-500/30 focus:border-lime-400', icon: 'text-lime-700' },
    credits: [{
      name: 'MapSPAM 2020 v1.0', by: 'International Food Policy Research Institute (IFPRI)',
      url: 'https://doi.org/10.7910/DVN/SWPENT', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    }],
    note: 'Physical area, harvested area, production (t) and yield (kg/ha) of 15 key crops per district, plus all 46 SPAM crops in the crops_long table. Modelled 2020 estimates on a 5 arc-minute grid.',
    facts: (l) => [
      `${num(l.total_phys_ha)} ha cropped (all crops)`,
      ...(l.top_crop ? [`Top crop: ${l.top_crop}`] : []),
    ],
  },
  'forest-loss': {
    slug: 'forest-loss', api: '/api/forest-loss', noun: 'forest cover and loss data',
    source: 'Hansen/UMD GFC + JRC GFC2020 · CC BY 4.0',
    tone: { banner: 'bg-green-50 border-green-200', hover: 'hover:border-green-300', button: 'bg-green-800 hover:bg-green-900 text-white', ring: 'focus:ring-green-600/30 focus:border-green-500', icon: 'text-green-800' },
    credits: [
      {
        name: 'Global Forest Change', by: 'Hansen / UMD / Google / USGS / NASA',
        url: 'https://glad.earthengine.app/view/global-forest-change', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      },
      {
        name: 'Global Forest Cover 2020 (GFC2020)', by: 'European Commission Joint Research Centre',
        url: 'https://forest-observatory.ec.europa.eu/', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      },
    ],
    note: 'Tree cover loss is not the same as deforestation: it includes plantation harvest and fire. GFC2020 overestimates forest in cocoa and coffee agroforestry. Loss counted inside ≥30% tree cover of 2000; "since 2021" = after the EUDR cut-off of 31 Dec 2020.',
    facts: (l) => [
      `Tree cover 2000: ${num(l.tc2000_ha)} ha`,
      `Loss ${l.year_start ?? 2001}–${l.year_end ?? ''}: ${num(l.loss_total_ha)} ha`,
      `Loss since 2021: ${num(l.loss_since_2021_ha)} ha`,
      ...(l.forest2020_ha !== null && l.forest2020_ha !== undefined ? [`JRC forest 2020: ${num(l.forest2020_ha)} ha`] : []),
    ],
  },
}
