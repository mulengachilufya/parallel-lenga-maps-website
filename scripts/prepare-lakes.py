"""
prepare-lakes.py

Downloads HydroLAKES v1.0 (global lake + reservoir polygons), clips to each of
the 54 African countries, and saves a per-country GeoPackage under output/Lakes/.

Lakes are NOT watersheds and NOT rivers — this is a distinct dataset of standing
water bodies (natural lakes + major reservoirs), with HydroLAKES' own limnology
attributes (area, shoreline, volume, depth, residence time, elevation).

Source: HydroLAKES v1.0 (HydroSHEDS)
  https://www.hydrosheds.org/products/hydrolakes
License: Free for non-commercial AND commercial use with attribution.
  Cite: Messager, M.L., Lehner, B., Grill, G., Nedeva, I., Schmitt, O. (2016).
  Estimating the volume and age of water stored in global lakes using a
  geo-statistical approach. Nature Communications, 7:13603.

Attributes preserved per lake (HydroLAKES field names, <=10 chars):
  Hylak_id, Lake_name, Lake_type, Grand_id, Lake_area, Shore_len, Vol_total,
  Depth_avg, Dis_avg, Res_time, Elevation, Wshd_area, Pour_long, Pour_lat
  + iso3, country (the Lenga country this file is served under)
  + area_km2 (per-country clipped surface area, recomputed on an equal-area CRS)

  Lake_type: 1 = lake, 2 = reservoir, 3 = lake-control (regulated lake).

Clipping: each lake is clipped to the country boundary, so a per-country file
contains exactly the water surface within that country. Transboundary lakes
(Victoria, Tanganyika, Malawi/Nyasa, Chad, Turkana, ...) therefore appear in
each bordering country as that country's portion. The original whole-lake
`Lake_area` is kept alongside the recomputed per-country `area_km2` so nothing
is misleading.

Run:
  python scripts/prepare-lakes.py                 # all 54 countries
  python scripts/prepare-lakes.py --country ZMB   # single country
  python scripts/prepare-lakes.py --skip-download  # reuse cached zips
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import requests

import geopandas as gpd

# ── Config ──────────────────────────────────────────────────────────────────

HYDROLAKES_URL = (
    "https://data.hydrosheds.org/file/hydrolakes/"
    "HydroLAKES_polys_v10_shp.zip"
)

# Country admin-0 polygons to clip against (Natural Earth 1:10m).
ADMIN0_URL = (
    "https://naciscdn.org/naturalearth/10m/cultural/"
    "ne_10m_admin_0_countries.zip"
)

ROOT      = Path(__file__).resolve().parent.parent
OUT_DIR   = ROOT / "output" / "Lakes"
CACHE_DIR = ROOT / "output" / ".cache"

# Same canonical 54-country list used by the other pipelines (prepare-watersheds.py).
AFRICA = [
    ("DZA", "Algeria"),                ("AGO", "Angola"),
    ("BEN", "Benin"),                  ("BWA", "Botswana"),
    ("BFA", "Burkina Faso"),           ("BDI", "Burundi"),
    ("CPV", "Cabo Verde"),             ("CMR", "Cameroon"),
    ("CAF", "Central African Republic"), ("TCD", "Chad"),
    ("COM", "Comoros"),                ("COG", "Congo"),
    ("COD", "Democratic Republic of the Congo"),
    ("CIV", "Cote d'Ivoire"),          ("DJI", "Djibouti"),
    ("EGY", "Egypt"),                  ("GNQ", "Equatorial Guinea"),
    ("ERI", "Eritrea"),                ("SWZ", "Eswatini"),
    ("ETH", "Ethiopia"),               ("GAB", "Gabon"),
    ("GMB", "Gambia"),                 ("GHA", "Ghana"),
    ("GIN", "Guinea"),                 ("GNB", "Guinea-Bissau"),
    ("KEN", "Kenya"),                  ("LSO", "Lesotho"),
    ("LBR", "Liberia"),                ("LBY", "Libya"),
    ("MDG", "Madagascar"),             ("MWI", "Malawi"),
    ("MLI", "Mali"),                   ("MRT", "Mauritania"),
    ("MUS", "Mauritius"),              ("MAR", "Morocco"),
    ("MOZ", "Mozambique"),             ("NAM", "Namibia"),
    ("NER", "Niger"),                  ("NGA", "Nigeria"),
    ("RWA", "Rwanda"),                 ("STP", "Sao Tome and Principe"),
    ("SEN", "Senegal"),                ("SYC", "Seychelles"),
    ("SLE", "Sierra Leone"),           ("SOM", "Somalia"),
    ("ZAF", "South Africa"),           ("SSD", "South Sudan"),
    ("SDN", "Sudan"),                  ("TZA", "Tanzania"),
    ("TGO", "Togo"),                   ("TUN", "Tunisia"),
    ("UGA", "Uganda"),                 ("ZMB", "Zambia"),
    ("ZWE", "Zimbabwe"),
]

# Meaningful HydroLAKES columns to carry through. We keep only the ones that
# actually exist in the source (resilient to schema variants).
KEEP_COLS = [
    "Hylak_id",   # unique lake identifier
    "Lake_name",  # name where available
    "Lake_type",  # 1=lake, 2=reservoir, 3=lake-control
    "Grand_id",   # GRanD reservoir id (0 if not a reservoir)
    "Lake_area",  # whole-lake surface area (km²)
    "Shore_len",  # shoreline length (km)
    "Vol_total",  # total lake/reservoir volume (million m³)
    "Depth_avg",  # average depth (m)
    "Dis_avg",    # average long-term discharge (m³/s)
    "Res_time",   # residence time (days)
    "Elevation",  # lake-surface elevation (m a.s.l.)
    "Wshd_area",  # contributing watershed area (km²)
    "Pour_long",  # pour-point longitude
    "Pour_lat",   # pour-point latitude
]

HEADERS = {"User-Agent": "lenga-maps-gis-pipeline/1.0 (contact: lengamaps@gmail.com)"}

SOURCE_LABEL    = "HydroLAKES v1.0 (HydroSHEDS)"
LICENSE_LABEL   = "Free for commercial use with attribution — cite Messager et al. 2016 / HydroLAKES"
SOURCE_VERSION  = "v1.0"


# ── Download helpers ─────────────────────────────────────────────────────────

def download(url: str, dest: Path) -> None:
    """Download url to dest if not already cached."""
    if dest.exists():
        print(f"  [cache] {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url} -> {dest.name}")
    r = requests.get(url, headers=HEADERS, stream=True, timeout=600)
    r.raise_for_status()
    with dest.open("wb") as f:
        for chunk in r.iter_content(chunk_size=1 << 20):
            f.write(chunk)
    print(f"  -> {dest.stat().st_size / 1_048_576:.1f} MB saved")


def load_shapefile_from_zip(zip_path: Path, pattern: str) -> Optional[gpd.GeoDataFrame]:
    """Unzip and read the first .shp inside a zip matching a glob pattern."""
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp)
        shps = list(Path(tmp).rglob(pattern))
        if not shps:
            return None
        return gpd.read_file(shps[0])


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser()
    parser.add_argument("--country", help="ISO-3 to process (e.g. ZMB)")
    parser.add_argument("--skip-download", action="store_true",
                        help="Reuse already-cached zip files")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    lakes_zip = CACHE_DIR / "HydroLAKES_polys_v10_shp.zip"
    admin_zip = CACHE_DIR / "ne_10m_admin_0_countries.zip"

    if not args.skip_download:
        download(HYDROLAKES_URL, lakes_zip)   # ~1.4 GB — first run is slow
        download(ADMIN0_URL, admin_zip)

    # ── Load global data ─────────────────────────────────────────────────────
    print("\nLoading HydroLAKES polygons (this is a large file)…")
    lakes = load_shapefile_from_zip(lakes_zip, "*.shp")
    if lakes is None:
        print("ERROR: could not find .shp inside the HydroLAKES zip")
        return 1
    lakes = lakes.to_crs(4326)
    print(f"  {len(lakes):,} lakes loaded globally")

    print("Loading Natural Earth country polygons…")
    countries_raw = load_shapefile_from_zip(admin_zip, "*.shp")
    if countries_raw is None:
        print("ERROR: could not load country polygons")
        return 1
    countries_raw = countries_raw.to_crs(4326)

    iso_col = next(
        c for c in ["ISO_A3", "ADM0_A3", "SOV_A3", "iso_a3"] if c in countries_raw.columns
    )
    country_map: dict[str, gpd.GeoDataFrame] = {}
    for iso3, _ in AFRICA:
        row = countries_raw[countries_raw[iso_col] == iso3]
        if not row.empty:
            country_map[iso3] = row

    targets = [(i, n) for (i, n) in AFRICA if not args.country or i == args.country.upper()]

    manifest_path = OUT_DIR / "manifest.json"
    manifest: dict[str, dict] = {}
    if manifest_path.exists():
        try:
            manifest = {m["iso3"]: m for m in json.loads(manifest_path.read_text())}
        except Exception:
            manifest = {}

    ok, skipped = 0, 0
    for iso3, country in targets:
        print(f"\n{country} ({iso3})")
        out_gpkg = OUT_DIR / f"{iso3}_Lakes.gpkg"

        ctry = country_map.get(iso3)
        if ctry is None:
            print(f"  [{iso3}] no country polygon found — skipping")
            skipped += 1
            continue

        # Fast bbox prefilter, then precise clip to the country boundary.
        bbox = ctry.total_bounds  # (minx, miny, maxx, maxy)
        lakes_bbox = lakes.cx[bbox[0]:bbox[2], bbox[1]:bbox[3]]
        if lakes_bbox.empty:
            print(f"  [{iso3}] no lakes in bounding box — skipping")
            skipped += 1
            continue

        try:
            clipped = gpd.clip(lakes_bbox, ctry.union_all())
        except Exception as err:
            print(f"  [{iso3}] clip failed: {err}")
            skipped += 1
            continue

        # Geometry hygiene: drop empties, repair invalid rings, keep polygons only.
        clipped = clipped[~clipped.geometry.is_empty & clipped.geometry.notna()]
        if not clipped.empty:
            invalid = ~clipped.geometry.is_valid
            if invalid.any():
                clipped.loc[invalid, "geometry"] = clipped.loc[invalid, "geometry"].make_valid()
            clipped = clipped[clipped.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]

        if clipped.empty:
            print(f"  [{iso3}] no lakes after clipping — skipping (arid / no standing water)")
            skipped += 1
            continue

        # Curated attribute table: keep only columns that exist in this source.
        present = [c for c in KEEP_COLS if c in clipped.columns]
        out = clipped[present + ["geometry"]].copy()
        out["iso3"]    = iso3
        out["country"] = country

        # Per-country clipped surface area on an equal-area CRS (World Cylindrical
        # Equal Area). Distinct from whole-lake `Lake_area`, which we also keep.
        equal_area = out.to_crs("ESRI:54034")
        out["area_km2"] = (equal_area.geometry.area / 1_000_000).round(4)

        out = out.set_crs(4326, allow_override=True)
        out.to_file(out_gpkg, driver="GPKG", layer=f"{iso3}_lakes")

        n         = len(out)
        total_km2 = round(float(out["area_km2"].sum()), 2)
        size_mb   = round(out_gpkg.stat().st_size / 1_048_576, 2)
        print(f"  ok  {n} lakes · {total_km2:,.1f} km² in-country · {size_mb} MB")

        manifest[iso3] = {
            "filename":       out_gpkg.name,
            "country":        country,
            "iso3":           iso3,
            "lake_count":     n,
            "total_area_km2": total_km2,
            "source":         SOURCE_LABEL,
            "license":        LICENSE_LABEL,
            "source_version": SOURCE_VERSION,
        }
        manifest_path.write_text(json.dumps(list(manifest.values()), indent=2))
        ok += 1

    print(f"\nDone. {ok} packaged, {skipped} skipped.")
    print(f"Manifest: {manifest_path}")
    print("Next: node scripts/seed-lakes.mjs   (uploads to R2 + seeds hydrology_layers)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
