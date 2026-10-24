// Datasets added from 2026-10. Their per-country files live in one table,
// catalog_files (migration 054), served by /api/catalog/[slug] and listed by
// CatalogList. Each entry here is what the dashboard shows above the files.

import type { DatasetSlug } from './pricing'

export interface CatalogFacts {
  title:    string
  facts:    { label: string; value: string }[]
  note?:    string
  credit:   string
  accent:   string
}

export const CATALOG: Partial<Record<DatasetSlug, CatalogFacts>> = {
  'crop-production': {
    title: 'Crop area, production & yield by district',
    facts: [
      { label: 'Source', value: 'MapSPAM SPAM 2020 v2r2' },
      { label: 'Crops', value: '46 crops in 15 groups' },
      { label: 'Unit', value: 'District (ADM2)' },
    ],
    note: 'Modelled estimates for 2020, not official statistics. District totals add up exactly to SPAM national figures. Each GeoPackage has a crops_long table (every crop) and a columns table explaining each field.',
    credit: 'IFPRI MapSPAM · CC BY 4.0',
    accent: '#4D7C0F',
  },
  'tree-cover-loss': {
    title: 'Tree cover loss by district, 2001–2025',
    facts: [
      { label: 'Source', value: 'Hansen / UMD Global Forest Change v1.13' },
      { label: 'Years', value: '2001–2025, per year' },
      { label: 'Unit', value: 'District (ADM2), hectares' },
    ],
    note: 'Tree cover means vegetation taller than 5 m, so plantations count as well as natural forest. Includes tree cover in 2000 and loss per year.',
    credit: 'Hansen et al. 2013, UMD / Google · CC BY 4.0',
    accent: '#166534',
  },
  'soil-nutrients': {
    title: 'Soil nutrients & pH by district (0–20 cm)',
    facts: [
      { label: 'Source', value: 'iSDAsoil, 30 m modelled' },
      { label: 'Properties', value: 'N, P, K, pH, organic carbon, eCEC, bulk density' },
      { label: 'Unit', value: 'District averages' },
    ],
    note: 'Modelled topsoil properties averaged per district. Good for screening and planning; sample the soil before site-level decisions.',
    credit: 'iSDA / Hengl et al. 2021 · CC BY 4.0',
    accent: '#92400E',
  },
  'mining-geology': {
    title: 'Mines, minerals & geology',
    facts: [
      { label: 'Mining', value: 'USGS mineral industries of Africa (2018 reference)' },
      { label: 'Geology', value: 'USGS geologic map of Africa, 1:5M' },
      { label: 'Format', value: 'GeoPackage per country' },
    ],
    note: 'Mines, deposits, exploration sites, power stations, pipelines, ports and railways, plus surface geology with legend text. The geology map is regional (1:5,000,000), not site-level. Cabo Verde has no geology in the source map.',
    credit: 'U.S. Geological Survey · public domain',
    accent: '#7C2D12',
  },
  'solar-wind': {
    title: 'Solar & wind resource',
    facts: [
      { label: 'Solar', value: 'Global Solar Atlas, April 2026 (GHI 250 m, PV output 1 km)' },
      { label: 'Wind', value: 'Global Wind Atlas 4.0 (speed & power density at 100 m)' },
      { label: 'Format', value: 'GeoTIFF per country' },
    ],
    note: 'Long-term averages, clipped to the country outline. Solar values are daily totals: multiply by 365 for a year.',
    credit: 'Solargis / World Bank ESMAP · DTU · CC BY 4.0',
    accent: '#B45309',
  },
  'population': {
    title: 'Population 2026 by district (WorldPop, 100 m)',
    facts: [
      { label: 'Source', value: 'WorldPop Global2 R2025A' },
      { label: 'Year', value: '2026 estimate' },
      { label: 'Files', value: '100 m raster + district totals' },
    ],
    note: 'Modelled estimates, not a census count. District totals sum the 100 m cells inside each district.',
    credit: 'WorldPop, University of Southampton · CC BY 4.0',
    accent: '#9D174D',
  },
}
