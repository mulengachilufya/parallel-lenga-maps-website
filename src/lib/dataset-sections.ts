// Shared labels for the dashboard and the QGIS catalog.
export const DATASET_SECTIONS = {
  'admin-boundaries': { icon: '🗺️', name: 'Administrative Boundaries', description: 'geoBoundaries · ZIP archives · Available administrative levels vary by country' },
  'rivers': { icon: '🌊', name: 'River Networks', description: 'HydroSHEDS HydroRIVERS v1.0 · full network or main rivers · GeoPackage per country' },
  'rainfall': { icon: '🌧️', name: 'Rainfall Data', description: 'CHIRPS v3.0 1981–2025 + yearly GeoTIFF · CHIRPS v2.0 archive below' },
  'temperature': { icon: '🌡️', name: 'Temperature Data', description: 'CHELSA v2.1 · 1981–2010 annual + monthly · GeoTIFF · ~1 km' },
  'drought-index': { icon: '🔥', name: 'Drought Index (SPI-12)', description: 'CHIRPS-derived SPI · GeoTIFF (ZIP) · 0.05° (~5 km)' },
  'aquifer': { icon: '💧', name: 'Transboundary Aquifers', description: 'IGRAC GGIS · Transboundary aquifers · GeoPackage per available country' },
  'protected-areas': { icon: '🐘', name: 'Protected Areas & Wildlife', description: 'OpenStreetMap · ODbL · Shapefile (ZIP) per country' },
  'watersheds': { icon: '🗺️', name: 'Watersheds & Catchments', description: 'WWF / HydroSHEDS HydroBASINS Level 8 · detailed sub-catchments · GeoPackage per country' },
  'population': { icon: '🏘️', name: 'Population & Settlements', description: 'WorldPop 2026 · 100 m raster and district totals · HDX COD-PS census boundaries (ADM1/ADM2)' },
  'roads': { icon: '🛣️', name: 'Roads & Infrastructure', description: 'Paved / unpaved road surface (FRST 2025) with district summary · Natural Earth main roads below' },
  'lulc': { icon: '🌿', name: 'Land Use / Land Cover', description: 'ESA WorldCover 2021 · GeoTIFF (10m) per country' },
  'lakes': { icon: '🏞️', name: 'Lakes', description: 'HydroLAKES · GeoPackage per country' },
  'soil': { icon: '🌾', name: 'Soil Classification', description: 'ISRIC SoilGrids v2.0 · GeoTIFF (250m) per country' },
  'crop-production': { icon: '🌽', name: 'Crop Production', description: 'MapSPAM SPAM 2020 v2r2 · 46 crops · GeoPackage per country' },
  'tree-cover-loss': { icon: '🌳', name: 'Tree Cover Loss', description: 'UMD / Google Global Forest Change v1.13 · 2001–2025 · GeoPackage per country' },
  'soil-nutrients': { icon: '🧪', name: 'Soil Nutrients & pH', description: 'iSDAsoil · topsoil 0–20 cm · GeoPackage per country' },
  'mining-geology': { icon: '⛏️', name: 'Mines & Geology', description: 'USGS · mineral industries & infrastructure, surface geology · GeoPackage per country' },
  'solar-wind': { icon: '☀️', name: 'Solar & Wind', description: 'Global Solar Atlas 2026 · Global Wind Atlas 4.0 · GeoTIFF and district summaries' },
  'crop-suitability': { icon: '🌱', name: 'Crop Suitability', description: 'FAO / IIASA GAEZ v5 · 29 crops · low and high input (maize: high only) · GeoTIFF + GeoPackage' },
  'built-up': { icon: '🏙️', name: 'Built-up Area', description: 'EU JRC GHSL · 1975–2020 observed, 2025 projected · GeoTIFF + GeoPackage' },
  'country-profiles': { icon: '📄', name: 'Country Data Profiles (PDF)', description: 'Ready-made reports, no GIS software needed · one PDF per country' },
  'power-plants': { icon: '🏭', name: 'Power Plants', description: 'OpenStreetMap via Overture Maps · energy source, capacity, operator · GeoPackage per country' },
  'rivers-hydro': { icon: '🌊', name: 'HydroRIVERS', description: 'WWF / HydroSHEDS · GeoPackage, GeoJSON per country' },
} as const

export type DatasetSectionId = keyof typeof DATASET_SECTIONS

export const BUNDLE_DATASETS = new Set<string>([
  'admin-boundaries', 'aquifer', 'population', 'protected-areas',
  'rivers', 'roads', 'watersheds', 'lakes',
  'rainfall', 'drought-index',
])
