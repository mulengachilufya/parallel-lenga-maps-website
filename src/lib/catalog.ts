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
    title: 'Crop area, production & yield',
    facts: [
      { label: 'Source', value: 'MapSPAM SPAM 2020 v2r2' },
      { label: 'Crops', value: '46 crops in 15 groups' },
      { label: 'Unit', value: 'District (ADM2)' },
    ],
    note: 'Modelled estimates for 2020, not official statistics. District totals add up exactly to SPAM national figures. Each GeoPackage has a crops_long table (every crop) and a columns table explaining each field. Not available for Cabo Verde, Comoros and Seychelles, which SPAM 2020 does not cover. This data was provided by the International Food Policy Research Institute (IFPRI). IFPRI bears no responsibility for the analyses or interpretations of the data presented here.',
    credit: 'IFPRI MapSPAM · CC BY 4.0',
    accent: '#4D7C0F',
  },
  'tree-cover-loss': {
    title: 'Tree cover loss, 2001–2025',
    facts: [
      { label: 'Source', value: 'Hansen / UMD Global Forest Change v1.13' },
      { label: 'Years', value: '2001–2025, per year' },
      { label: 'Unit', value: 'District (ADM2), hectares' },
    ],
    note: 'Tree cover means vegetation taller than 5 m, so plantations count as well as natural forest. Includes tree cover in 2000 and loss per year. Not available for Seychelles, where the Hansen loss layer has no data.',
    credit: 'Hansen et al. 2013, UMD / Google · CC BY 4.0',
    accent: '#166534',
  },
  'soil-nutrients': {
    title: 'Soil nutrients & pH (0–20 cm)',
    facts: [
      { label: 'Source', value: 'iSDAsoil, 30 m modelled' },
      { label: 'Properties', value: 'N, P, K, pH, organic carbon, eCEC, bulk density' },
      { label: 'Unit', value: 'District averages' },
    ],
    note: 'Modelled topsoil properties averaged per district. Good for screening and planning; sample the soil before site-level decisions. Not available for Cabo Verde, Mauritius and Seychelles, which iSDAsoil does not cover.',
    credit: 'iSDA / Hengl et al. 2021 · CC BY 4.0',
    accent: '#92400E',
  },
  'mining-geology': {
    title: 'Mines & geology',
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
    title: 'Solar & wind',
    facts: [
      { label: 'Solar', value: 'Global Solar Atlas, April 2026 (GHI 250 m, PV output 1 km)' },
      { label: 'Wind', value: 'Global Wind Atlas 4.0 (speed & power density at 100 m)' },
      { label: 'Format', value: 'GeoTIFF + district GeoPackage' },
    ],
    note: 'Includes a district screening GeoPackage per country: average, 10th and 90th percentile solar and wind values, 2026 population, and the share of each district within 10 km of a mapped transmission line. The GeoTIFFs are long-term averages clipped to the country outline; solar values are daily totals (multiply by 365 for a year). Screening data, not a site assessment.',
    credit: 'Solargis / World Bank ESMAP · DTU · CC BY 4.0',
    accent: '#B45309',
  },
  'rainfall': {
    title: 'Rainfall 1981–2025 (CHIRPS v3.0)',
    facts: [
      { label: 'Source', value: 'CHIRPS v3.0, Climate Hazards Center (2025)' },
      { label: 'Years', value: '1981–2025, one band per year' },
      { label: 'District stats', value: '1991–2020 normal, 2025 anomaly, driest/wettest year, trend' },
    ],
    note: 'District values are area-weighted, so small districts get the share of each 5 km cell they cover. Each GeoPackage also has a rainfall_by_year table (every district, every year). Cabo Verde, Mauritius and Seychelles lie outside the CHIRPS Africa grid and use the v2.0 files below.',
    credit: 'CHC, UC Santa Barbara · public domain',
    accent: '#1F3A8A',
  },
  'roads': {
    title: 'Paved & unpaved roads (FRST 2025)',
    facts: [
      { label: 'Source', value: 'FRST road surface dataset, 50 African countries (ESSD 2026)' },
      { label: 'Per road', value: 'paved / unpaved, district, length (km)' },
      { label: 'District summary', value: 'paved km, unpaved km, paved %, road density' },
    ],
    note: 'Roads from OpenStreetMap classified by surface (reported accuracy 77–96% by country). Lengths are recomputed on the ellipsoid; the source lengths are Web Mercator and overstate distance. Not covered by the source: Cabo Verde, Comoros, Mauritius, São Tomé and Príncipe, Seychelles. Large countries are big files (Nigeria and South Africa are about 1–1.2 GB).',
    credit: 'Zhou et al. 2026 (CC BY 4.0) · © OpenStreetMap contributors (ODbL)',
    accent: '#A16207',
  },
  'power-plants': {
    title: 'Power plants',
    facts: [
      { label: 'Source', value: 'OpenStreetMap via Overture Maps (release 2026-10-21)' },
      { label: 'Attributes', value: 'Energy source, method, capacity (MW), operator, start date' },
      { label: 'Format', value: 'GeoPackage per country' },
    ],
    note: 'Solar farms, hydro, gas, oil, coal, geothermal and biomass plants mapped in OpenStreetMap, with a summary by energy source. Community-mapped and updated continuously, so coverage varies by country. Capacity totals add up the tagged values only; they are not official installed capacity.',
    credit: '© OpenStreetMap contributors · ODbL',
    accent: '#0E7490',
  },
  'crop-suitability': {
    title: 'Crop suitability: 29 crops (GAEZ v5)',
    facts: [
      { label: 'Source', value: 'FAO / IIASA GAEZ v5 (2025), climate 2001–2020' },
      { label: 'Crops', value: 'Maize, cassava, sorghum, millets, rice, beans, soy, coffee, tea, cocoa, cashew, sugarcane and more' },
      { label: 'Management', value: 'Rain-fed, low input and high input (maize: high input only)' },
    ],
    note: 'Per country: a district GeoPackage (share of each district rated medium or better for every crop, plus its best crops) and two 29-band GeoTIFFs at about 1 km (index 0–100). Suitability describes climate, soil and terrain under the stated management, not what is grown today: pair it with Crop Production. Low-input maize is withheld because the FAO source layer has no value for about half of the land; high-input maize is included.',
    credit: 'FAO & IIASA GAEZ v5 · CC BY 4.0',
    accent: '#15803D',
  },
  'built-up': {
    title: 'Built-up area, 1975–2025',
    facts: [
      { label: 'Source', value: 'EU JRC Global Human Settlement Layer, GHS-BUILT-S R2023A' },
      { label: 'Years', value: '1975, 1990, 2000, 2010, 2020 observed · 2025 projected' },
      { label: 'Per district', value: 'built-up km², growth 2000–2020, share of area, m² per person' },
    ],
    note: 'Where towns and settlements have grown: useful for utilities, telecoms, real estate, planning and market sizing. Built-up surface is roofed area from Sentinel-2 and Landsat at about 1 km; 2025 is the GHSL projection.',
    credit: 'European Commission JRC · CC BY 4.0',
    accent: '#B91C1C',
  },
  'country-profiles': {
    title: 'Country Data Profiles: ready-made PDF reports',
    facts: [
      { label: 'For', value: 'Anyone without GIS software: managers, investors, students, NGOs' },
      { label: 'Inside', value: 'Key figures, 4 district maps, crops, power plants, every district' },
      { label: 'Format', value: 'PDF, 4–8 pages per country' },
    ],
    note: 'Built only from the GIS datasets in this catalogue (WorldPop 2026, CHIRPS v3, Solar & Wind Atlas, Hansen tree cover, MapSPAM crops, iSDA soils, FRST roads, OpenStreetMap power plants), with sources on the last page. Need the underlying data for your own maps? Every figure has a GIS dataset.',
    credit: 'Lenga Maps · sources listed in each report',
    accent: '#7C3AED',
  },
  'population': {
    title: 'Population 2026 (WorldPop, 100 m)',
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
