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
}

export const previewFor = (id: number): string | null => DATASET_PREVIEW[id] ?? null
