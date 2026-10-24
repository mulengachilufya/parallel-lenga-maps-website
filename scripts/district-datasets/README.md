# Country and district datasets

Per-country GeoPackages of district (geoBoundaries ADM2) statistics. Run from a
work folder (outputs go to `bnd/`, `forest/`, `soil/`, `out/` under the current
directory); requires `pip install geopandas pyogrio rasterio exactextract`.
Set `SSL_CERT_FILE` to the proxy CA bundle if downloads fail TLS.

1. `get_boundaries.py`  geoBoundaries gbOpen ADM2 (ADM1 fallback) for the 54 countries
2. `forest_tiles.py 3`  Hansen GFC v1.13 per-district tree cover 2000 / loss 2001-2025 (resumable)
3. `soil_fetch.py <var> <band>` then `soil_zonal.py <var> <band>`  iSDAsoil 240 m, back-transformed before averaging
4. `build_gpkg.py forest|soil`  final GeoPackages + about/columns tables + manifest.json
5. `qa.py Forest_Loss|Soil_Fertility`  PASS / FAIL report

More sets, all run from the same work folder after step 1 (each writes `out/<Set>/` and a manifest.json):

| Script | Output | Source (latest release) |
|---|---|---|
| `crops_zonal.py` then `build_gpkg.py crops` | Crop_Production | MapSPAM SPAM 2020 v2r2 rasters (mapspam.info); district values reconcile exactly to SPAM national totals |
| `soil_wrb.py [ISO ...]` | Soil_Classification | ISRIC SoilGrids 2.0 WRB most probable group, 250 m |
| `chelsa_temp.py` | Temperature_CHELSA | CHELSA v2.1 1981-2010 annual + monthly mean temperature (CC BY 4.0) |
| `usgs_build.py geology` | Geology | USGS OFR 97-470A geology of Africa; legend text from the source metadata |
| `usgs_build.py minerals` | Mineral_Industries | USGS mineral industries & infrastructure of Africa, 2021 (doi:10.5066/P97EQWXP) |
| `solar_build.py` | Solar_Potential | Global Solar Atlas v2, April 2026 release (GHI 250 m, PVOUT 1 km); needs `solar/raw/GHI.tif` and `PVOUT.tif` unzipped from the World GeoTIFF downloads |
| `wind_build.py` | Wind_Potential | Global Wind Atlas 4.0 country GeoTIFFs, 100 m wind speed and power density |
| `worldpop_build.py [ISO ...]` | Population_WorldPop | WorldPop Global2 R2025A constrained 2026, 100 m raster + district totals |
| `energy_screening.py [ISO ...]` | Energy_Screening | District solar & wind screening from the solar, wind, WorldPop and USGS outputs (run those first) |
| `power_plants.py` | Power_Plants | Existing power plants from OpenStreetMap via Overture Maps base/infrastructure (needs `plants/africa_power.parquet` extracted with DuckDB) |
| `chirps_build.py [ISO ...]` | Rainfall_CHIRPSv3 | CHIRPS v3.0 annual 1981-2025 (Africa tifs in chirps/raw; download slowly, the CHC server bans parallel requests) |
| `road_surface.py [ISO ...]` | Road_Surface | FRST paved/unpaved roads (figshare 29424107, RAR5: needs bsdtar from libarchive-tools); lengths recomputed geodesically |
| `country_profile.py [ISO ...]` | Country_Profiles | Ready-made PDF report per country from the district datasets above (needs reportlab, matplotlib) |
| `gaez_build.py fetch` then `gaez_build.py build` | Crop_Suitability_GAEZv5 | FAO/IIASA GAEZ v5 suitability, 29 crops, low/high input rain-fed (public GCS bucket fao-gismgr-gaez-v5-data) |

`raster_clip.py` is the shared clip: cells whose centre is outside the geoBoundaries outline become NoData, and
it raises if a read came back as fill. `qa_new.py` checks coverage, embedded about/columns tables, column
descriptions and raster tags for these sets.
