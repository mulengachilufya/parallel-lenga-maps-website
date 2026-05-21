"""
prepare-roads.py

Downloads Natural Earth 1:10m Roads (global) and the Africa country
boundaries, spatial-joins each road to its country, then saves a
per-country GeoPackage under output/Roads/.

Source: Natural Earth 1:10m Cultural Vectors — Roads
  https://www.naturalearthdata.com/downloads/10m-cultural-vectors/roads/
License: PUBLIC DOMAIN — no attribution required, but we credit it anyway.

Why Natural Earth roads?
  • Only major / significant roads — no micro-detail noise.
  • Global coverage → Africa roads included.
  • Relatively small file (8.65 MB).
  • Pre-classified (Freeway, Primary, Secondary, etc.)
  • Updates follow NE releases (~2–3 per year).

Attributes preserved per feature (all original Natural Earth fields):
  scalerank, featurecla, name, name_alt, natscale, labelrank,
  TYPE, CLASS, NUMBER, DIVIDED, iso3 (added by us), country (added by us)

Run:
  python scripts/prepare-roads.py
  python scripts/prepare-roads.py --country ZMB    # single country
  python scripts/prepare-roads.py --skip-download  # reuse cached zip
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import geopandas as gpd
import requests

# ── Config ──────────────────────────────────────────────────────────────────

ROADS_URL  = (
    "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_roads.zip"
)
ADMIN0_URL = (
    "https://naciscdn.org/naturalearth/10m/cultural/"
    "ne_10m_admin_0_countries.zip"
)

ROOT      = Path(__file__).resolve().parent.parent
OUT_DIR   = ROOT / "output" / "Roads"
CACHE_DIR = ROOT / "output" / ".cache"

HEADERS = {"User-Agent": "lenga-maps-gis-pipeline/1.0 (contact: lengamaps@gmail.com)"}

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

# Original NE roads columns that carry useful information
KEEP_COLS = [
    "scalerank", "featurecla", "name", "name_alt", "natscale",
    "labelrank", "type", "class", "number", "divided",
]

# ── Helpers ──────────────────────────────────────────────────────────────────

def download(url: str, dest: Path) -> None:
    if dest.exists():
        print(f"  [cache] {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {dest.name} …")
    r = requests.get(url, headers=HEADERS, stream=True, timeout=300)
    r.raise_for_status()
    with dest.open("wb") as f:
        for chunk in r.iter_content(1 << 20):
            f.write(chunk)
    print(f"  → {dest.stat().st_size / 1_048_576:.1f} MB")


def load_shp_from_zip(zip_path: Path) -> Optional[gpd.GeoDataFrame]:
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp)
        shps = list(Path(tmp).rglob("*.shp"))
        if not shps:
            return None
        return gpd.read_file(shps[0])


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser()
    parser.add_argument("--country", help="ISO-3 (e.g. ZMB)")
    parser.add_argument("--skip-download", action="store_true")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    roads_zip  = CACHE_DIR / "ne_10m_roads.zip"
    admin_zip  = CACHE_DIR / "ne_10m_admin_0_countries.zip"

    if not args.skip_download:
        download(ROADS_URL,  roads_zip)
        download(ADMIN0_URL, admin_zip)

    print("\nLoading Natural Earth roads…")
    roads = load_shp_from_zip(roads_zip)
    if roads is None:
        print("ERROR: no shapefile found in roads zip"); return 1
    roads = roads.to_crs(4326)
    # Normalise column names to lower-case (NE uses mixed case)
    roads.columns = [c.lower() for c in roads.columns]
    present_keep = [c for c in KEEP_COLS if c in roads.columns]
    roads = roads[present_keep + ["geometry"]]
    print(f"  {len(roads):,} road features loaded globally")

    print("Loading country polygons…")
    countries_raw = load_shp_from_zip(admin_zip)
    if countries_raw is None:
        print("ERROR: no shapefile found in admin zip"); return 1
    countries_raw = countries_raw.to_crs(4326)
    iso_col = next(
        c for c in ["ISO_A3", "ADM0_A3", "SOV_A3", "iso_a3"]
        if c in countries_raw.columns
    )

    # Clip roads to Africa bounding box first (fast rough cut)
    AFRICA_BBOX = (-25, -35, 52, 38)   # lon_min, lat_min, lon_max, lat_max
    roads_africa = roads.cx[AFRICA_BBOX[0]:AFRICA_BBOX[2], AFRICA_BBOX[1]:AFRICA_BBOX[3]]
    print(f"  {len(roads_africa):,} road features in Africa bbox")

    targets = [(i, n) for (i, n) in AFRICA if not args.country or i == args.country.upper()]

    manifest_path = OUT_DIR / "manifest.json"
    manifest: dict = {}
    if manifest_path.exists():
        try:
            manifest = {m["iso3"]: m for m in json.loads(manifest_path.read_text())}
        except Exception:
            manifest = {}

    ok, skipped = 0, 0
    for iso3, country in targets:
        print(f"\n{country} ({iso3})")
        out_gpkg = OUT_DIR / f"{iso3}_Roads.gpkg"

        ctry = countries_raw[countries_raw[iso_col] == iso3]
        if ctry.empty:
            print(f"  [{iso3}] no country polygon — skipping")
            skipped += 1
            continue

        try:
            clipped = gpd.clip(roads_africa, ctry.union_all())
        except Exception as e:
            print(f"  [{iso3}] clip error: {e}")
            skipped += 1
            continue

        if clipped.empty:
            print(f"  [{iso3}] no roads in country — skipping (not unusual for small/island nations)")
            skipped += 1
            continue

        out = clipped.copy()
        out["iso3"]    = iso3
        out["country"] = country

        # Compute length in km using equal-area projection
        equal_area     = out.to_crs("ESRI:54034")
        out["length_km"] = (equal_area.geometry.length / 1000).round(2)

        out.to_file(out_gpkg, driver="GPKG", layer=f"{iso3}_roads")

        n          = len(out)
        total_km   = round(float(out["length_km"].sum()), 1)
        size_mb    = round(out_gpkg.stat().st_size / 1_048_576, 2)
        print(f"  ok — {n} features · {total_km:,.0f} km total · {size_mb} MB")

        manifest[iso3] = {
            "filename":     out_gpkg.name,
            "country":      country,
            "iso3":         iso3,
            "feature_count": n,
            "total_km":     total_km,
            "source":       "Natural Earth 1:10m Roads",
            "license":      "Public Domain",
            "source_version": "5.1.2",
        }
        manifest_path.write_text(json.dumps(list(manifest.values()), indent=2))
        ok += 1

    print(f"\nDone. {ok} packaged, {skipped} skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
