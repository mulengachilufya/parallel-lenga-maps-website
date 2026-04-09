#!/usr/bin/env python3
"""
Africa Hydrology Pipeline
Extracts Hydrology-20260404T140548Z-1-001.zip, organises files by country/layer,
uploads to Cloudflare R2, and inserts metadata rows into Supabase.

R2 structure:
  datasets/hydrology/{Country}/rivers/{Country}_rivers.gpkg
  datasets/hydrology/{Country}/lakes/{Country}_lakes.zip
  datasets/hydrology/All Africa/lakes/All_Africa_Lakes.zip
  datasets/hydrology/World/rivers/World_Main_River_Systems.zip

Usage:
  python africa_hydrology_pipeline.py
  python africa_hydrology_pipeline.py --dry-run
  python africa_hydrology_pipeline.py --country Zambia
  python africa_hydrology_pipeline.py --layer rivers
  python africa_hydrology_pipeline.py --layer lakes
"""

import argparse
import io
import os
import re
import zipfile
from pathlib import Path

import boto3
import requests as _requests
from botocore.config import Config
from dotenv import load_dotenv

# ── Env ──────────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env.local")

R2_ACCOUNT_ID   = os.environ["CLOUDFLARE_R2_ACCOUNT_ID"]
R2_ACCESS_KEY   = os.environ["CLOUDFLARE_R2_ACCESS_KEY_ID"]
R2_SECRET_KEY   = os.environ["CLOUDFLARE_R2_SECRET_ACCESS_KEY"]
R2_BUCKET       = os.environ["CLOUDFLARE_R2_BUCKET_NAME"]
SUPABASE_URL    = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY    = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

SUPABASE_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates",
}

SOURCE_ZIP = Path.home() / "Downloads" / "Hydrology-20260404T140548Z-1-001.zip"

# ── R2 client ─────────────────────────────────────────────────────────────────
r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)


def country_from_river_name(filename: str) -> str:
    """Angola_rivers.gpkg → Angola"""
    return filename.replace("_rivers.gpkg", "").replace("_", " ")


def country_from_lake_name(filename: str) -> str:
    """'Zambia Lakes.zip' → 'Zambia'"""
    return re.sub(r"\s*Lakes?\.zip$", "", filename, flags=re.IGNORECASE).strip()


def r2_key(country: str, layer_type: str, filename: str) -> str:
    safe_country = country.replace(" ", "_")
    return f"datasets/hydrology/{safe_country}/{layer_type}/{filename}"


def upload_bytes(key: str, data: bytes, content_type: str, dry_run: bool) -> float:
    size_mb = len(data) / 1024 / 1024
    if dry_run:
        print(f"  [dry-run] would upload {size_mb:.2f} MB → {key}")
        return size_mb
    r2.put_object(Bucket=R2_BUCKET, Key=key, Body=data, ContentType=content_type)
    print(f"  ✓ uploaded {size_mb:.2f} MB → {key}")
    return size_mb


def upsert_row(country: str, layer_type: str, key: str, size_mb: float,
               file_format: str, source: str, dry_run: bool):
    row = {
        "country": country,
        "layer_type": layer_type,
        "r2_key": key,
        "file_size_mb": round(size_mb, 3),
        "file_format": file_format,
        "source": source,
    }
    if dry_run:
        print(f"  [dry-run] would upsert: {row}")
        return
    resp = _requests.post(
        f"{SUPABASE_URL}/rest/v1/hydrology_layers",
        headers=SUPABASE_HEADERS,
        json=row,
        timeout=30,
    )
    if not resp.ok:
        print(f"  ⚠ DB upsert failed ({resp.status_code}): {resp.text[:200]}")
    else:
        print(f"  ✓ upserted DB row for {country} / {layer_type}")


def process_zip(outer: zipfile.ZipFile, args):
    names = outer.namelist()
    processed = 0

    for name in sorted(names):
        basename = Path(name).name
        if not basename:
            continue

        # ── Rivers (.gpkg) ────────────────────────────────────────────────────
        if "Rivers/" in name and name.endswith(".gpkg"):
            country = country_from_river_name(basename)
            if args.layer and args.layer != "rivers":
                continue
            if args.country and args.country.lower() not in country.lower():
                continue

            print(f"\n[river] {country}")
            data = outer.read(name)
            key = r2_key(country, "rivers", basename)
            size_mb = upload_bytes(key, data, "application/geopackage+sqlite3", args.dry_run)
            upsert_row(country, "rivers", key, size_mb, "GeoPackage", "HydroSHEDS", args.dry_run)
            processed += 1

        # ── World Main River Systems (zip inside zip) ─────────────────────────
        elif "Rivers/" in name and basename == "World Main River Systems.zip":
            if args.layer and args.layer != "rivers":
                continue
            if args.country:
                continue  # skip world files when filtering by country

            print(f"\n[river] World")
            data = outer.read(name)
            key = r2_key("World", "rivers", "World_Main_River_Systems.zip")
            size_mb = upload_bytes(key, data, "application/zip", args.dry_run)
            upsert_row("World", "rivers", key, size_mb, "Shapefile (ZIP)", "HydroSHEDS", args.dry_run)
            processed += 1

        # ── Lakes (zip files) ─────────────────────────────────────────────────
        elif "Lakes/" in name and name.endswith(".zip"):
            if args.layer and args.layer != "lakes":
                continue

            if basename == "All Africa Lakes.zip":
                if args.country:
                    continue
                country = "All Africa"
            else:
                country = country_from_lake_name(basename)
                if args.country and args.country.lower() not in country.lower():
                    continue

            print(f"\n[lake] {country}")
            data = outer.read(name)
            safe_name = basename.replace(" ", "_")
            key = r2_key(country, "lakes", safe_name)
            size_mb = upload_bytes(key, data, "application/zip", args.dry_run)
            upsert_row(country, "lakes", key, size_mb, "Shapefile (ZIP)", "HydroLAKES", args.dry_run)
            processed += 1

    return processed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="List what would be uploaded, don't actually upload")
    parser.add_argument("--country", help="Process only this country (e.g. Zambia)")
    parser.add_argument("--layer", choices=["rivers", "lakes"], help="Process only this layer type")
    args = parser.parse_args()

    if not SOURCE_ZIP.exists():
        print(f"ERROR: Source zip not found at {SOURCE_ZIP}")
        return

    print(f"Opening {SOURCE_ZIP.name} ({SOURCE_ZIP.stat().st_size / 1024 / 1024:.1f} MB)...")

    with zipfile.ZipFile(SOURCE_ZIP) as z:
        n = process_zip(z, args)

    print(f"\n{'[dry-run] ' if args.dry_run else ''}Done — {n} files processed.")


if __name__ == "__main__":
    main()
