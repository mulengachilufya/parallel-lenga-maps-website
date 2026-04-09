#!/usr/bin/env python3
"""
Africa Hydrology Gap-Fill Pipeline
-----------------------------------
Fills in the countries missing from the primary hydrology dataset by clipping
Natural Earth global vector data to each country boundary.

Data source: Natural Earth (https://www.naturalearthdata.com)
Licence: Public Domain (CC0) — more permissive than CC BY 4.0.
  "All versions of Natural Earth raster + vector map data found on this website
   are in the public domain. You may use the data in any manner, including
   modifying the content and design, electronic dissemination, and offset
   printing. The Natural Earth project is operated by the NACIS."

Layers used:
  - ne_10m_rivers_lake_centerlines  (rivers)
  - ne_10m_lakes                    (lakes)
  - ne_10m_admin_0_countries        (clip masks)

R2 output follows the same convention as africa_hydrology_pipeline.py:
  datasets/hydrology/{Country}/rivers/{Country}_rivers.gpkg
  datasets/hydrology/{Country}/lakes/{Country}_lakes.gpkg

Usage:
  pip install geopandas boto3 python-dotenv supabase requests
  python africa_hydrology_gapfill.py
  python africa_hydrology_gapfill.py --dry-run
  python africa_hydrology_gapfill.py --layer rivers
  python africa_hydrology_gapfill.py --layer lakes
  python africa_hydrology_gapfill.py --country Tunisia
"""

import argparse
import io
import os
import zipfile
from pathlib import Path

import boto3
import geopandas as gpd
import requests
from botocore.config import Config
from dotenv import load_dotenv

# ── Env ──────────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env.local")

R2_ACCOUNT_ID = os.environ["CLOUDFLARE_R2_ACCOUNT_ID"]
R2_ACCESS_KEY = os.environ["CLOUDFLARE_R2_ACCESS_KEY_ID"]
R2_SECRET_KEY = os.environ["CLOUDFLARE_R2_SECRET_ACCESS_KEY"]
R2_BUCKET     = os.environ["CLOUDFLARE_R2_BUCKET_NAME"]
SUPABASE_URL  = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

SUPABASE_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates",
}

# ── Natural Earth download URLs ───────────────────────────────────────────────
NE_URLS = {
    "rivers":    "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_rivers_lake_centerlines.zip",
    "lakes":     "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_lakes.zip",
    "countries": "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries.zip",
}

# Countries with no data in the primary dataset, by layer type
MISSING = {
    "rivers": [
        "Algeria", "Cabo Verde", "Comoros", "Djibouti",
        "Eswatini", "Libya", "Mauritius", "Sao Tome and Principe",
        "Seychelles", "Tunisia",
    ],
    "lakes": [
        "Botswana", "Burkina Faso", "Burundi", "Cabo Verde", "Cameroon",
        "Central African Republic", "Chad", "Comoros", "Congo",
        "Cote dIvoire", "Democratic Republic of the Congo",
        "Equatorial Guinea", "Eswatini", "Gambia", "Guinea", "Guinea-Bissau",
        "Kenya", "Lesotho", "Liberia", "Libya", "Morocco", "Namibia",
        "Niger", "Nigeria", "Rwanda", "Sao Tome and Principe", "Senegal",
        "Seychelles", "Sierra Leone", "Somalia", "South Sudan", "Sudan",
        "Tanzania", "Togo", "Tunisia", "Uganda",
    ],
}

# Natural Earth name → our standard name  (NE uses slightly different spellings)
NE_NAME_MAP = {
    "Côte d'Ivoire":              "Cote dIvoire",
    "Republic of the Congo":      "Congo",
    "Democratic Republic of the Congo": "Democratic Republic of the Congo",
    "Dem. Rep. Congo":            "Democratic Republic of the Congo",
    "United Republic of Tanzania":"Tanzania",
    "Swaziland":                  "Eswatini",
    "São Tomé and Principe":      "Sao Tome and Principe",
    "Cape Verde":                 "Cabo Verde",
}

# ── R2 client ─────────────────────────────────────────────────────────────────
r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def download_ne(layer: str) -> gpd.GeoDataFrame:
    """Download a Natural Earth layer entirely in memory (no disk writes)."""
    url = NE_URLS[layer]
    print(f"  Downloading {layer} from Natural Earth...")
    r = requests.get(url, timeout=180)
    r.raise_for_status()

    # Extract shapefile components into a virtual filesystem in memory
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        names = z.namelist()
        shp_name = next(n for n in names if n.endswith(".shp"))
        base = shp_name[:-4]  # strip .shp

        # Read all sidecar files into BytesIO objects keyed by extension
        vfs = {}
        for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
            candidate = base + ext
            if candidate in names:
                vfs[ext] = io.BytesIO(z.read(candidate))

    # Write sidecar files to a temp dir on the smallest available drive
    import tempfile, shutil
    tmp_dir = Path(tempfile.mkdtemp(prefix="ne_"))
    try:
        stem = Path(shp_name).stem
        for ext, buf in vfs.items():
            (tmp_dir / (stem + ext)).write_bytes(buf.read())
        gdf = gpd.read_file(tmp_dir / (stem + ".shp"))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    print(f"  Loaded {len(gdf)} features for {layer}")
    return gdf


def ne_name_to_standard(ne_name: str) -> str:
    return NE_NAME_MAP.get(ne_name, ne_name)


def r2_key(country: str, layer_type: str, filename: str) -> str:
    return f"datasets/hydrology/{country.replace(' ', '_')}/{layer_type}/{filename}"


def gdf_to_gpkg_bytes(gdf: gpd.GeoDataFrame) -> bytes:
    """Serialise a GeoDataFrame to GeoPackage bytes via a temp file."""
    import tempfile, shutil
    tmp = Path(tempfile.mktemp(suffix=".gpkg"))
    try:
        gdf.to_file(tmp, driver="GPKG")
        return tmp.read_bytes()
    finally:
        tmp.unlink(missing_ok=True)


def upload(key: str, data: bytes, dry_run: bool) -> float:
    size_mb = len(data) / 1024 / 1024
    if dry_run:
        print(f"    [dry-run] {size_mb:.3f} MB → {key}")
    else:
        r2.put_object(Bucket=R2_BUCKET, Key=key,
                      Body=data, ContentType="application/geopackage+sqlite3")
        print(f"    ✓ uploaded {size_mb:.3f} MB → {key}")
    return size_mb


def upsert(country: str, layer_type: str, key: str,
           size_mb: float, feat_count: int, dry_run: bool):
    row = {
        "country":      country,
        "layer_type":   layer_type,
        "r2_key":       key,
        "file_size_mb": round(size_mb, 3),
        "file_format":  "GeoPackage",
        "source":       "Natural Earth (Public Domain / CC0)",
    }
    if dry_run:
        print(f"    [dry-run] upsert {country}/{layer_type} ({feat_count} features)")
    else:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/hydrology_layers",
            headers=SUPABASE_HEADERS,
            json=row,
            timeout=30,
        )
        if not resp.ok:
            print(f"    ⚠ DB upsert failed ({resp.status_code}): {resp.text[:200]}")
        else:
            print(f"    ✓ DB row: {country} / {layer_type} ({feat_count} features)")


# ── Main processing ───────────────────────────────────────────────────────────

def process_layer(layer_type: str, countries_gdf: gpd.GeoDataFrame,
                  features_gdf: gpd.GeoDataFrame,
                  target_countries: list[str], dry_run: bool) -> int:
    processed = 0

    for country in target_countries:
        print(f"\n  [{layer_type}] {country}")

        # Find the country boundary — try multiple NE name fields
        mask = None
        for col in ("NAME", "ADMIN", "NAME_LONG", "SOVEREIGNT"):
            if col not in countries_gdf.columns:
                continue
            # Check standard name and NE variants
            ne_variants = [country] + [k for k, v in NE_NAME_MAP.items() if v == country]
            match = countries_gdf[countries_gdf[col].isin(ne_variants)]
            if not match.empty:
                mask = match
                break

        if mask is None or mask.empty:
            print(f"    ⚠ No boundary found in Natural Earth for '{country}' — skipping")
            continue

        # Dissolve to single geometry (handles multi-part countries)
        boundary = mask.dissolve().geometry.iloc[0]

        # Clip features to country boundary
        try:
            clipped = features_gdf.clip(boundary)
        except Exception as e:
            print(f"    ⚠ Clip failed: {e} — skipping")
            continue

        if clipped.empty:
            print(f"    ℹ No {layer_type} features within {country} boundary — uploading empty layer")

        # Export to GeoPackage bytes
        # Ensure CRS is set
        if clipped.crs is None:
            clipped = clipped.set_crs("EPSG:4326")
        else:
            clipped = clipped.to_crs("EPSG:4326")

        data = gdf_to_gpkg_bytes(clipped)
        filename = f"{country.replace(' ', '_')}_{layer_type}.gpkg"
        key = r2_key(country, layer_type, filename)
        size_mb = upload(key, data, dry_run)
        upsert(country, layer_type, key, size_mb, len(clipped), dry_run)
        processed += 1

    return processed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--layer", choices=["rivers", "lakes"])
    parser.add_argument("--country", help="Process only this country")
    args = parser.parse_args()

    print("Downloading Natural Earth reference layers...")
    countries_gdf = download_ne("countries")

    layers_to_run = ["rivers", "lakes"] if not args.layer else [args.layer]
    total = 0

    for layer_type in layers_to_run:
        print(f"\n{'='*50}")
        print(f"Processing: {layer_type.upper()}")
        print(f"Source: Natural Earth (Public Domain / CC0)")
        print(f"{'='*50}")

        features_gdf = download_ne(layer_type)

        targets = MISSING[layer_type]
        if args.country:
            targets = [c for c in targets if args.country.lower() in c.lower()]

        n = process_layer(layer_type, countries_gdf, features_gdf, targets, args.dry_run)
        total += n
        print(f"\n  → {n} {layer_type} files {'would be ' if args.dry_run else ''}processed")

    print(f"\n{'='*50}")
    print(f"{'[dry-run] ' if args.dry_run else ''}Done — {total} total files processed.")


if __name__ == "__main__":
    main()
