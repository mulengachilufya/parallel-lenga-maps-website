"""
prepare-watersheds.py

Downloads HydroBASINS Level 6 for Africa, clips to each of the 54 African
countries, and saves a per-country GeoPackage under output/Watersheds/.

Source: HydroSHEDS / WWF HydroBASINS v1c
  https://www.hydrosheds.org/products/hydrobasins
License: Free for scientific, educational, and commercial use with attribution.
  Cite: Lehner, B., Grill G. (2013). Global river hydrography and network
  routing: baseline data and new approaches to study the world's large river
  systems. Hydrological Processes, 27(15): 2171–2186.

Attributes preserved per polygon:
  HYBAS_ID, PFAF_ID, NEXT_DOWN, MAIN_BAS, DIST_SINK, DIST_MAIN,
  SUB_AREA, UP_AREA, ENDO, COAST, ORDER_, SORT, iso3, country

Why Level 6?
  Level 6 basins range from ~2,000–10,000 km². That is the canonical
  "watershed" scale — large enough to be meaningful and small enough for
  users to see individual river basins. Levels 7–12 are too granular for
  country-scale analysis.

Run:
  python scripts/prepare-watersheds.py            # all 54 countries
  python scripts/prepare-watersheds.py --country ZMB   # single country
  python scripts/prepare-watersheds.py --skip-download # reuse existing zip
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import requests  # pip install requests (already installed)

import geopandas as gpd
import pandas as pd

# ── Config ──────────────────────────────────────────────────────────────────

# Parametrised by --level. Level 8 = detailed sub-catchments (~100–1,000 km²),
# the "detailed watershed map" scale; Level 6 = coarse main catchments.
HYDROBASINS_URL_TMPL = (
    "https://data.hydrosheds.org/file/HydroBASINS/standard/"
    "hybas_af_lev{lvl:02d}_v1c.zip"
)

# Country admin-0 centroids to clip — we download via Natural Earth
ADMIN0_URL = (
    "https://naciscdn.org/naturalearth/10m/cultural/"
    "ne_10m_admin_0_countries.zip"
)

ROOT       = Path(__file__).resolve().parent.parent
OUT_DIR    = ROOT / "output" / "Watersheds"
CACHE_DIR  = ROOT / "output" / ".cache"

AFRICA = [
    ("DZA", "Algeria"),               ("AGO", "Angola"),
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

# Columns to keep in the output GeoPackage. Using only what HydroBASINS
# actually has (names from the shapefile, trimmed to 10-char DBF limit).
KEEP_COLS = [
    "HYBAS_ID",   # unique basin ID
    "PFAF_ID",    # Pfafstetter hierarchical code
    "NEXT_DOWN",  # downstream basin ID (0 = coast/lake outlet)
    "MAIN_BAS",   # ID of the most-downstream basin
    "DIST_SINK",  # km to downstream sink
    "DIST_MAIN",  # km to upstream headwaters
    "SUB_AREA",   # area of this sub-basin (km²)
    "UP_AREA",    # total upstream drainage area (km²)
    "ENDO",       # 0=exorheic, 1=endorheic, 2=sink
    "COAST",      # 0=non-coastal, 1=coastal sub-basin
    "ORDER_",     # Strahler stream order
    "SORT",       # sort index for rendering
]

# ── Download helpers ─────────────────────────────────────────────────────────

HEADERS = {"User-Agent": "lenga-maps-gis-pipeline/1.0 (contact: lengamaps@gmail.com)"}

def download(url: str, dest: Path) -> None:
    """Download url to dest if not already cached."""
    if dest.exists():
        print(f"  [cache] {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url} → {dest.name}")
    r = requests.get(url, headers=HEADERS, stream=True, timeout=300)
    r.raise_for_status()
    with dest.open("wb") as f:
        for chunk in r.iter_content(chunk_size=1 << 20):
            f.write(chunk)
    print(f"  → {dest.stat().st_size / 1_048_576:.1f} MB saved")


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
    parser.add_argument("--level", type=int, default=6,
                        help="HydroBASINS level (6=coarse main catchments, "
                             "8=detailed sub-catchments). Default 6.")
    parser.add_argument("--skip-download", action="store_true",
                        help="Reuse already-cached zip files")
    args = parser.parse_args()

    lvl = args.level

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    basin_zip = CACHE_DIR / f"hybas_af_lev{lvl:02d}_v1c.zip"
    admin_zip = CACHE_DIR / "ne_10m_admin_0_countries.zip"

    if not args.skip_download:
        download(HYDROBASINS_URL_TMPL.format(lvl=lvl), basin_zip)
        download(ADMIN0_URL, admin_zip)

    # ── Load global data ─────────────────────────────────────────────────────
    print(f"\nLoading HydroBASINS Level {lvl} Africa…")
    basins = load_shapefile_from_zip(basin_zip, "*.shp")
    if basins is None:
        print("ERROR: could not find .shp inside the HydroBASINS zip")
        return 1
    basins = basins.to_crs(4326)
    print(f"  {len(basins):,} sub-basins loaded")

    print("Loading Natural Earth country polygons…")
    countries_raw = load_shapefile_from_zip(admin_zip, "*.shp")
    if countries_raw is None:
        print("ERROR: could not load country polygons")
        return 1
    countries_raw = countries_raw.to_crs(4326)

    # Build a lookup: ISO-3 → country polygon
    iso_col = next(
        c for c in ["ISO_A3", "ADM0_A3", "SOV_A3", "iso_a3"] if c in countries_raw.columns
    )
    country_map: dict[str, gpd.GeoDataFrame] = {}
    for iso3, _ in AFRICA:
        row = countries_raw[countries_raw[iso_col] == iso3]
        if row.empty:
            # Some countries use -99; try name match
            continue
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
        out_gpkg = OUT_DIR / f"{iso3}_Watersheds_L{lvl}.gpkg"

        ctry = country_map.get(iso3)
        if ctry is None:
            print(f"  [{iso3}] no country polygon found — skipping")
            skipped += 1
            continue

        # Clip basins to country bounding box first (fast), then precise clip
        bbox = ctry.total_bounds  # (minx, miny, maxx, maxy)
        basins_bbox = basins.cx[bbox[0]:bbox[2], bbox[1]:bbox[3]]
        if basins_bbox.empty:
            print(f"  [{iso3}] no basins in bounding box — skipping (island nation?)")
            skipped += 1
            continue

        try:
            clipped = gpd.clip(basins_bbox, ctry.union_all())
        except Exception as err:
            print(f"  [{iso3}] clip failed: {err}")
            skipped += 1
            continue

        if clipped.empty:
            print(f"  [{iso3}] no basins after clipping — skipping")
            skipped += 1
            continue

        # Select + rename columns that actually exist
        present = [c for c in KEEP_COLS if c in clipped.columns]
        out = clipped[present + ["geometry"]].copy()
        out["iso3"]    = iso3
        out["country"] = country

        # Compute areas in case SUB_AREA is unreliable post-clip
        equal_area = out.to_crs("ESRI:54034")
        out["area_km2"] = (equal_area.geometry.area / 1_000_000).round(2)

        out.to_file(out_gpkg, driver="GPKG", layer=f"{iso3}_watersheds_L{lvl}")

        n          = len(out)
        total_km2  = round(float(out.get("SUB_AREA", out["area_km2"]).sum()), 1)
        size_mb    = round(out_gpkg.stat().st_size / 1_048_576, 2)
        print(f"  ✓ {n} basins · {total_km2:,.0f} km² · {size_mb} MB")

        manifest[iso3] = {
            "filename":     out_gpkg.name,
            "country":      country,
            "iso3":         iso3,
            "basin_count":  n,
            "total_area_km2": total_km2,
            "source":       f"HydroSHEDS / WWF HydroBASINS Level {lvl} v1c",
            "license":      "Free for commercial use — cite HydroSHEDS",
            "source_version": "v1c",
        }
        manifest_path.write_text(json.dumps(list(manifest.values()), indent=2))
        ok += 1

    print(f"\nDone. {ok} packaged, {skipped} skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
