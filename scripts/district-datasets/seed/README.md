# Seeds for the 2026-10 datasets

Apply a file only after its R2 upload is verified (every key it lists exists), so every row is downloadable.

| File | Table | R2 folder |
|---|---|---|
| crop_production, forest_loss, soil_fertility, geology, mineral_industries, solar, wind, population | catalog_files | datasets/<iso3>/<folder>/ |
| soil_classification | soil_layers | datasets/<iso3>/soil_classification/ |
| temperature | rainfall_climate_layers (replaces the WorldClim rows) | datasets/<iso3>/temperature/ |

Then make the dataset live: add its id to LIVE_DATASET_ROUTES (src/lib/supabase.ts) and its slug to
ALL_DATASETS and FREE_PICKABLE (src/lib/pricing.ts). Soil Classification is id 11 / slug soil. Temperature
needs the text in src/lib/supabase.ts (id 16), the dashboard subtitle and BUNDLE_DATASETS (the Africa-wide
temperature bundle is still WorldClim) updated. Solar, wind and population sizes come from this session's
build; a rebuild gives the same files.
