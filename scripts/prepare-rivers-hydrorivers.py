"""
prepare-rivers-hydrorivers.py

Replaces the coarse Natural Earth rivers layer with HydroSHEDS HydroRIVERS —
the full vectorised river network. Clips to each of the 54 African countries
and writes a per-country GeoPackage under output/Rivers/.

"Balanced" detail: HydroRIVERS' complete network includes every 1st-order
headwater trickle, which bloats files and clutters the map. We drop the
smallest streams by Strahler order (default: keep ORD_STRA >= 2) — still
dramatically richer than Natural Earth (thousands of reaches per country vs
~8), while keeping downloads fast.

Source: HydroSHEDS HydroRIVERS v1.0
  https://www.hydrosheds.org/products/hydrorivers
License: Free for scientific, educational, and commercial use with attribution.
  Cite: Lehner, B., Grill G. (2013). Global river hydrography and network
  routing. Hydrological Processes, 27(15): 2171-2186.

Attributes preserved per reach:
  HYRIV_ID, NEXT_DOWN, MAIN_RIV, LENGTH_KM, DIST_DN_KM, DIST_UP_KM,
  CATCH_SKM, UPLAND_SKM, ENDORHEIC, DIS_AV_CMS, ORD_STRA, ORD_CLAS, ORD_FLOW
  + iso3, country

Run (download the ~500 MB af shapefile zip first, then):
  python scripts/prepare-rivers-hydrorivers.py --skip-download
  python scripts/prepare-rivers-hydrorivers.py --country ZMB --skip-download
  python scripts/prepare-rivers-hydrorivers.py --min-strahler 3 --skip-download
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

HYDRORIVERS_URL = (
    "https://data.hydrosheds.org/file/hydrorivers/"
    "HydroRIVERS_v10_af_shp.zip"
)
ADMIN0_URL = (
    "https://naciscdn.org/naturalearth/10m/cultural/"
    "ne_10m_admin_0_countries.zip"
)

ROOT      = Path(__file__).resolve().parent.parent
OUT_DIR   = ROOT / "output" / "Rivers"
CACHE_DIR = ROOT / "output" / ".cache"

# Same canonical 54-country list as the other pipelines.
AFRICA = [
    ("DZA", "Algeria"), ("AGO", "Angola"), ("BEN", "Benin"), ("BWA", "Botswana"),
    ("BFA", "Burkina Faso"), ("BDI", "Burundi"), ("CPV", "Cabo Verde"),
    ("CMR", "Cameroon"), ("CAF", "Central African Republic"), ("TCD", "Chad"),
    ("COM", "Comoros"), ("COG", "Congo"), ("COD", "Democratic Republic of the Congo"),
    ("CIV", "Cote d'Ivoire"), ("DJI", "Djibouti"), ("EGY", "Egypt"),
    ("GNQ", "Equatorial Guinea"), ("ERI", "Eritrea"), ("SWZ", "Eswatini"),
    ("ETH", "Ethiopia"), ("GAB", "Gabon"), ("GMB", "Gambia"), ("GHA", "Ghana"),
    ("GIN", "Guinea"), ("GNB", "Guinea-Bissau"), ("KEN", "Kenya"), ("LSO", "Lesotho"),
    ("LBR", "Liberia"), ("LBY", "Libya"), ("MDG", "Madagascar"), ("MWI", "Malawi"),
    ("MLI", "Mali"), ("MRT", "Mauritania"), ("MUS", "Mauritius"), ("MAR", "Morocco"),
    ("MOZ", "Mozambique"), ("NAM", "Namibia"), ("NER", "Niger"), ("NGA", "Nigeria"),
    ("RWA", "Rwanda"), ("STP", "Sao Tome and Principe"), ("SEN", "Senegal"),
    ("SYC", "Seychelles"), ("SLE", "Sierra Leone"), ("SOM", "Somalia"),
    ("ZAF", "South Africa"), ("SSD", "South Sudan"), ("SDN", "Sudan"),
    ("TZA", "Tanzania"), ("TGO", "Togo"), ("TUN", "Tunisia"), ("UGA", "Uganda"),
    ("ZMB", "Zambia"), ("ZWE", "Zimbabwe"),
]

KEEP_COLS = [
    "HYRIV_ID", "NEXT_DOWN", "MAIN_RIV", "LENGTH_KM", "DIST_DN_KM",
    "DIST_UP_KM", "CATCH_SKM", "UPLAND_SKM", "ENDORHEIC", "DIS_AV_CMS",
    "ORD_STRA", "ORD_CLAS", "ORD_FLOW",
]

HEADERS = {"User-Agent": "lenga-maps-gis-pipeline/1.0 (contact: lengamaps@gmail.com)"}


def download(url: str, dest: Path) -> None:
    if dest.exists():
        print(f"  [cache] {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url} → {dest.name}")
    r = requests.get(url, headers=HEADERS, stream=True, timeout=600)
    r.raise_for_status()
    with dest.open("wb") as f:
        for chunk in r.iter_content(chunk_size=1 << 20):
            f.write(chunk)
    print(f"  → {dest.stat().st_size / 1_048_576:.1f} MB saved")


def load_shapefile_from_zip(zip_path: Path, pattern: str, tmp: str) -> Optional[gpd.GeoDataFrame]:
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(tmp)
    shps = list(Path(tmp).rglob(pattern))
    if not shps:
        return None
    return gpd.read_file(shps[0])


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser()
    ap.add_argument("--country", help="ISO-3 to process (e.g. ZMB)")
    ap.add_argument("--min-strahler", type=int, default=2,
                    help="Drop reaches below this Strahler order (default 2 = "
                         "keep everything except 1st-order headwater trickles).")
    ap.add_argument("--skip-download", action="store_true")
    args = ap.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    rivers_zip = CACHE_DIR / "HydroRIVERS_v10_af_shp.zip"
    admin_zip  = CACHE_DIR / "ne_10m_admin_0_countries.zip"
    if not args.skip_download:
        download(HYDRORIVERS_URL, rivers_zip)
        download(ADMIN0_URL, admin_zip)

    with tempfile.TemporaryDirectory() as tmp_r, tempfile.TemporaryDirectory() as tmp_c:
        print("\nLoading HydroRIVERS Africa (large — a minute or two)…")
        rivers = load_shapefile_from_zip(rivers_zip, "*.shp", tmp_r)
        if rivers is None:
            print("ERROR: no .shp inside HydroRIVERS zip"); return 1
        rivers = rivers.to_crs(4326)
        print(f"  {len(rivers):,} reaches loaded")

        if "ORD_STRA" in rivers.columns and args.min_strahler > 1:
            before = len(rivers)
            rivers = rivers[rivers["ORD_STRA"] >= args.min_strahler]
            print(f"  filtered to Strahler >= {args.min_strahler}: "
                  f"{len(rivers):,} reaches ({before - len(rivers):,} tiny streams dropped)")

        # spatial index for fast per-country bbox slicing
        rivers.sindex

        print("Loading Natural Earth country polygons…")
        countries_raw = load_shapefile_from_zip(admin_zip, "*.shp", tmp_c)
        if countries_raw is None:
            print("ERROR: could not load country polygons"); return 1
        countries_raw = countries_raw.to_crs(4326)
        iso_col = next(c for c in ["ISO_A3", "ADM0_A3", "SOV_A3", "iso_a3"] if c in countries_raw.columns)

        source_label = (f"HydroSHEDS HydroRIVERS v1.0 (Strahler ≥ {args.min_strahler})"
                        if args.min_strahler > 1 else "HydroSHEDS HydroRIVERS v1.0")

        manifest_path = OUT_DIR / "manifest.json"
        manifest: dict[str, dict] = {}
        if manifest_path.exists():
            try:
                manifest = {m["iso3"]: m for m in json.loads(manifest_path.read_text())}
            except Exception:
                manifest = {}

        targets = [(i, n) for (i, n) in AFRICA if not args.country or i == args.country.upper()]
        ok, skipped = 0, 0
        for iso3, country in targets:
            print(f"\n{country} ({iso3})")
            row = countries_raw[countries_raw[iso_col] == iso3]
            if row.empty:
                print(f"  [{iso3}] no country polygon — skipping"); skipped += 1; continue

            bbox = row.total_bounds
            sub = rivers.cx[bbox[0]:bbox[2], bbox[1]:bbox[3]]
            if sub.empty:
                print(f"  [{iso3}] no reaches in bbox — skipping"); skipped += 1; continue
            try:
                clipped = gpd.clip(sub, row.union_all())
            except Exception as err:
                print(f"  [{iso3}] clip failed: {err}"); skipped += 1; continue
            if clipped.empty:
                print(f"  [{iso3}] empty after clip — skipping"); skipped += 1; continue

            present = [c for c in KEEP_COLS if c in clipped.columns]
            out = clipped[present + ["geometry"]].copy()
            out["iso3"] = iso3
            out["country"] = country

            out_gpkg = OUT_DIR / f"{iso3}_Rivers.gpkg"
            out.to_file(out_gpkg, driver="GPKG", layer=f"{iso3}_rivers")

            n = len(out)
            total_km = round(float(out.get("LENGTH_KM").sum()), 1) if "LENGTH_KM" in out else None
            size_mb = round(out_gpkg.stat().st_size / 1_048_576, 2)
            print(f"  ✓ {n:,} reaches · {total_km:,} km · {size_mb} MB" if total_km
                  else f"  ✓ {n:,} reaches · {size_mb} MB")

            manifest[iso3] = {
                "filename": out_gpkg.name, "country": country, "iso3": iso3,
                "reach_count": n, "total_length_km": total_km,
                "source": source_label,
                "license": "Free for commercial use — cite HydroSHEDS",
                "source_version": "v1.0",
            }
            manifest_path.write_text(json.dumps(list(manifest.values()), indent=2))
            ok += 1

        print(f"\nDone. {ok} packaged, {skipped} skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
