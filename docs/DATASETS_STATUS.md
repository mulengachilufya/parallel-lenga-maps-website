# Datasets added October 2026: status and how they were made

Everything below is live on lengamaps.com, stored in R2 bucket `gis-data-lenga-maps`
(account `2d7d8cc536086b35e2800be940b02d62`) and listed in Supabase.

## Where things are

| Dataset (site slug) | Table | R2 folder under `datasets/<iso3>/` | Files | Build script |
|---|---|---|---|---|
| Crop Production by District (`crop-production`) | catalog_files | `crop_production/` | 54 | `crops_zonal.py` + `build_gpkg.py crops` |
| Tree Cover Loss by District (`tree-cover-loss`) | catalog_files | `forest_loss/` | 54 | `forest_tiles.py` + `build_gpkg.py forest` |
| Soil Nutrients & pH by District (`soil-nutrients`) | catalog_files | `soil_fertility/` | 54 | `soil_fetch.py`, `soil_zonal.py`, `build_gpkg.py soil` |
| Mines, Minerals & Geology (`mining-geology`) | catalog_files | `mineral_industries/`, `geology/` | 107 | `usgs_build.py minerals|geology` |
| Solar & Wind Resource (`solar-wind`) | catalog_files | `solar/`, `wind/`, `solar_wind_screening/` | 270 | `solar_build.py`, `wind_build.py`, `energy_screening.py` |
| Existing Power Plants (`power-plants`) | catalog_files | `power_plants/` | 54 | `power_plants.py` |
| Population 2026, WorldPop (`population`) | catalog_files | `population/` | 108 | `worldpop_build.py` |
| Rainfall 1981-2025, CHIRPS v3 (`rainfall`) | catalog_files | `rainfall_chirps3/` | 102 (51 countries) | `chirps_build.py` |
| Road surface, paved/unpaved (`roads`) | catalog_files | `road_surface/` | 49 (all FRST countries, live) | `road_surface.py` |
| Crop Suitability, GAEZ v5 (`crop-suitability`) | catalog_files | `crop_suitability/` | 162 | `gaez_build.py fetch` + `build` |
| Built-up Area Growth, GHSL (`built-up`) | catalog_files | `built_up/` | 108 | `ghsl_build.py` |
| Country Data Profiles, PDF (`country-profiles`) | catalog_files | `reports/` | 54 | `country_profile.py` (run after all the above) |
| Soil Classification, WRB (`soil`) | soil_layers | `soil_classification/` | 54 | `soil_wrb.py` |
| Temperature, CHELSA 1981-2010 (`temperature`) | rainfall_climate_layers | `temperature/` | 54 | `chelsa_temp.py` |

Scripts: `scripts/district-datasets/` (README lists the order). Per-folder manifests: `datasets/_manifests/<folder>.json`.

The site reads catalog_files through `/api/catalog/[slug]` and `src/components/CatalogList.tsx`; dataset text lives in
`src/lib/catalog.ts` (facts shown above the files) and `src/lib/supabase.ts` (catalogue cards).

## Catalogue navigation

- Industry filter: `src/lib/industries.tsx` maps catalogue ids to industries (catalogue page and dashboard rail).
- Product types: the catalogue page switches between GIS data and Ready-made reports (PDF). Reports are
  free-pickable but not in `ALL_DATASETS`, so they do not count as GIS datasets.

## Making a new dataset live

1. Build and QA (`qa_new.py` or the checks in each script). Every GeoPackage carries `about` and `columns` tables.
2. Upload to R2 at `datasets/<iso3 lowercase>/<folder>/<file>` and check each object's size.
3. Insert catalog_files rows (slug, iso3, country, label, file_name, r2_key, file_format, file_size_mb) only for
   keys that exist in R2.
4. New slug: add it to `DatasetSlug`, `ALL_DATASETS`, `DATASET_ADDED`, `FREE_PICKABLE` (`src/lib/pricing.ts`),
   `DATASET_META` (`src/lib/teams.ts`), `CATALOG` (`src/lib/catalog.ts`), a card + `LIVE_DATASET_ROUTES` entry
   (`src/lib/supabase.ts`) and a dashboard section (`src/app/dashboard/page.tsx`). Update the "N datasets" text.

## Known gaps (documented in the files too)

- Geology: no Cabo Verde (not in the USGS map).
- Rainfall v3: Cabo Verde, Mauritius, Seychelles are outside the CHIRPS Africa grid (their v2.0 files remain).
- Road surface: source does not cover Cabo Verde, Comoros, Mauritius, Sao Tome and Principe, Seychelles.
- Seychelles tree cover loss columns are empty (no Hansen loss layer there), not zero.
- Power plants: OpenStreetMap coverage varies; capacity sums are tag totals, not official installed capacity.
- Temperature: WorldClim rows kept as `layer_type = 'temperature_worldclim_retired'` (hidden) for rollback;
  `rainfall_climate_layers_worldclim_backup` holds a copy.

## Access notes

- R2 uploads use the S3 endpoint `https://2d7d8cc536086b35e2800be940b02d62.r2.cloudflarestorage.com` with an R2
  API token's Access Key ID and Secret. The account ID `0557df59…` used in older notes is wrong.
- The keys used in October 2026 were pasted in chat: roll them in Cloudflare (R2 > Manage API tokens) and store
  the new pair as environment secrets for future sessions, never in chat or the repo.
- The CHIRPS server (data.chc.ucsb.edu) bans parallel downloads; fetch one file at a time.

## Next datasets worth building

Ranked by expected demand: building counts and heights (Google Open Buildings 2.5D Temporal, 2016-2023), GAEZ v5
future-climate suitability (not yet in the public bucket), more report types (district, sector), global field boundaries 2024-2025 (Fields of The World,
check licence), canopy height v2 (Meta/WRI, 2026) for carbon projects, Global Energy Monitor power trackers
(capacity and status per plant; download needs their form).
