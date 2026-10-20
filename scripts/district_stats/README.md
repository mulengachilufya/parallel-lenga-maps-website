# District-statistics datasets

Three datasets, same shape: one GeoPackage per country (54), EPSG:4326, one
polygon per district (geoBoundaries ADM2), statistics as columns.

| slug | script | output | table |
|---|---|---|---|
| `crop-production` | `crop_production.py` | `output/CropProduction/<ISO3>_CropProduction.gpkg` | `crop_production_layers` |
| `forest-loss` | `forest_loss.py` | `output/ForestLoss/<ISO3>_ForestLoss.gpkg` | `forest_loss_layers` |
| `soil-fertility` | `soil_fertility.py` | `output/SoilFertility/<ISO3>_SoilFertility.gpkg` | `soil_fertility_layers` |

## Run order

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/district_stats/requirements.txt
cd scripts/district_stats
../../.venv/bin/python boundaries.py            # districts + licence report
../../.venv/bin/python crop_production.py       # or --country ZMB,KEN
../../.venv/bin/python qa.py crop-production    # must PASS before seeding
cd ../.. && node scripts/seed-district-stats.mjs crop-production
```

Run `supabase/migrations/053_crop_production_layers.sql` (and 054/055 for the
other two) before seeding. The seeder refuses to run without a passing
`qa_report.json`.

## Network hosts used

geoBoundaries via `media.githubusercontent.com`; MapSPAM via
`dataverse.harvard.edu`; Hansen via `storage.googleapis.com`; JRC GFC2020 via
`jeodpp.jrc.ec.europa.eu` and `data.jrc.ec.europa.eu`; iSDAsoil via
`isdasoil.s3.amazonaws.com`; checks via `data-api.globalforestwatch.org`
(`GFW_API_KEY`) and `api.isda-africa.com` (`ISDA_USERNAME`/`ISDA_PASSWORD`).

## Boundaries and licences

geoBoundaries gbOpen licences differ by country (CC BY 4.0, CC BY 3.0 IGO,
Public Domain, and share-alike ODbL / CC BY-SA for a few). Each file stores
its country's boundary licence; `boundaries.py` prints the full list. Libya
and Mauritius have no ADM2 in gbOpen, so their ADM1 units are used
(`admin_level = 1`).

Statistics are computed on the full-detail outlines; the delivered outlines
are simplified (~50 m, shared borders kept) so the files stay small.
