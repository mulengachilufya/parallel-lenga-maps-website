// src/lib/dataset-previews.ts
//
// A real map of each dataset for the catalogue cards (homepage and /datasets).
// Only screenshots of the actual data: a dataset without one simply shows no
// picture. New previews go in public/images/previews/<slug>.webp, rendered from
// the real files, and get a line here. (gis-soil.webp is left out: it does not
// clearly show WRB soil classes.)

/** Keyed by the catalogue card id in src/lib/supabase.ts (DATASETS). */
export const DATASET_PREVIEW: Record<number, string> = {
  3:  '/images/mosaic/gis-hydrorivers.webp',     // River Networks
  4:  '/images/mosaic/gis-lulc.webp',            // Land Use / Land Cover
  9:  '/images/mosaic/gis-roads.webp',           // Roads & Infrastructure
  10: '/images/mosaic/gis-wetlands.webp',        // Wetlands & Floodplains
  12: '/images/mosaic/gis-protected-areas.webp', // Protected Areas
  13: '/images/mosaic/gis-hydrorivers.webp',     // HydroRIVERS
  14: '/images/mosaic/gis-watersheds.webp',      // Watersheds
  15: '/images/mosaic/gis-rainfall.webp',        // Rainfall
  16: '/images/mosaic/gis-temperature.webp',     // Temperature
  18: '/images/previews/crop-production.webp',   // Crop Production (maize per ha, log)
  19: '/images/previews/tree-cover-loss.webp',   // Tree Cover Loss (share of district lost)
  20: '/images/previews/soil-nutrients.webp',    // Soil Nutrients & pH (topsoil pH)
  21: '/images/previews/mining-geology.webp',    // Mines, Minerals & Geology (USGS facilities)
  23: '/images/previews/power-plants.webp',      // Existing Power Plants (OSM)
  24: '/images/previews/crop-suitability.webp',  // Crop Suitability (sorghum, low input)
  25: '/images/previews/built-up.webp',          // Built-up Area (share built, 2020)
}

export const previewFor = (id: number): string | null => DATASET_PREVIEW[id] ?? null
