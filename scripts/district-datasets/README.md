# District datasets (forest loss, soil fertility, crop production)

Per-country GeoPackages of district (geoBoundaries ADM2) statistics. Run from a
work folder (outputs go to `bnd/`, `forest/`, `soil/`, `out/` under the current
directory); requires `pip install geopandas pyogrio rasterio exactextract`.
Set `SSL_CERT_FILE` to the proxy CA bundle if downloads fail TLS.

1. `get_boundaries.py`  geoBoundaries gbOpen ADM2 (ADM1 fallback) for the 54 countries
2. `forest_tiles.py 3`  Hansen GFC v1.13 per-district tree cover 2000 / loss 2001-2025 (resumable)
3. `soil_fetch.py <var> <band>` then `soil_zonal.py <var> <band>`  iSDAsoil 240 m, back-transformed before averaging
4. `build_gpkg.py forest|soil`  final GeoPackages + about/columns tables + manifest.json
5. `qa.py Forest_Loss|Soil_Fertility`  PASS / FAIL report

Crop production (latest MapSPAM SPAM 2020 release) needs www.mapspam.info or
dataverse.harvard.edu reachable; not built until it is. No older fallbacks.
