"""
add-climate-raster-metadata.py

Each rainfall / drought / temperature GeoTIFF on R2 ships as a zip with the
.tif alone — no band description, no units. QGIS opens them as raw float
pixels (rainfall pixel = 1247.5 with no hint that it's mm/year, SPI pixel =
-1.8 with no hint that negative = drought).

Fix: open each .tif and embed the metadata directly into the GeoTIFF tags
(rasterio `descriptions`, `units`, dataset+band `tags`). The metadata
becomes part of the file itself — every GIS reader (QGIS, ArcGIS, GDAL
CLI, rasterio, geopandas) surfaces it. No sidecar to lose track of.

The TIFFs are small (200–500 KB), so the path is:
  download zip → extract .tif → set tags via rasterio → re-zip → upload.

Total network spend across 162 layers: ~50 MB down + ~50 MB up.

Idempotent: re-running rewrites the same tags and overwrites the R2 key.

Usage:
  python scripts/add-climate-raster-metadata.py --country Zambia
  python scripts/add-climate-raster-metadata.py --layer-type rainfall
  python scripts/add-climate-raster-metadata.py --all
  python scripts/add-climate-raster-metadata.py --all --dry-run
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

try:
    import boto3
    import rasterio
    import requests
    from botocore.config import Config
    from dotenv import load_dotenv
except ImportError as e:
    sys.exit(f"Missing dep: {e}\nRun: python -m pip install boto3 rasterio requests python-dotenv")

# ── Env / clients ─────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

R2_ACCOUNT_ID = os.environ["CLOUDFLARE_R2_ACCOUNT_ID"]
R2_ACCESS_KEY = os.environ["CLOUDFLARE_R2_ACCESS_KEY_ID"]
R2_SECRET_KEY = os.environ["CLOUDFLARE_R2_SECRET_ACCESS_KEY"]
R2_BUCKET     = os.environ["CLOUDFLARE_R2_BUCKET_NAME"]

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto",
    config=Config(s3={"addressing_style": "virtual"}, retries={"max_attempts": 5}),
)


# ── Per-layer-type sidecar metadata ───────────────────────────────────────────
# All numeric tiffs are float32 with -9999 nodata. The sidecar carries the
# semantic context QGIS / ArcGIS surface in the layer properties + identify tool.

SIDECAR_META: dict[str, dict[str, str]] = {
    "rainfall": {
        "TITLE":       "Annual rainfall total (1981–2023 mean)",
        "UNITS":       "mm/year",
        "SOURCE":      "CHIRPS v2.0 (Funk et al. 2015) — climhazards.org/chirps",
        "DESCRIPTION": (
            "Mean annual precipitation total derived from CHIRPS v2.0 daily "
            "rainfall, averaged over 1981–2023. Each pixel value is the long-"
            "term annual rainfall total in millimetres."
        ),
        "BAND_DESC":   "Mean annual rainfall total (1981–2023)",
        "BAND_UNIT":   "mm",
    },
    "temperature": {
        "TITLE":       "Mean air temperature (1970–2000 climatology)",
        "UNITS":       "degree_Celsius",
        "SOURCE":      "WorldClim v2.1 (Fick & Hijmans 2017) — worldclim.org",
        "DESCRIPTION": (
            "Mean air temperature climatology from WorldClim v2.1, derived "
            "from 1970–2000 monthly means averaged to an annual mean. "
            "Each pixel value is in degrees Celsius."
        ),
        "BAND_DESC":   "Mean air temperature (1970–2000)",
        "BAND_UNIT":   "Celsius",
    },
    "drought_index": {
        "TITLE":       "Standardized Precipitation Index, 12-month (SPI-12)",
        "UNITS":       "dimensionless (z-score)",
        "SOURCE":      "Computed from CHIRPS v2.0 by Lenga Maps",
        "DESCRIPTION": (
            "12-month Standardized Precipitation Index, derived from CHIRPS "
            "v2.0 monthly rainfall, baseline 2014–2023. Negative values = "
            "drier than normal; positive = wetter. |z| < 1 = near-normal, "
            "|z| 1–2 = moderate, |z| ≥ 2 = severe."
        ),
        "BAND_DESC":   "SPI-12 z-score",
        "BAND_UNIT":   "1",
    },
}


def embed_metadata(tif_path: Path, layer_type: str) -> None:
    """
    Open the GeoTIFF in update mode and embed dataset + band metadata so
    QGIS, ArcGIS, GDAL CLI and rasterio all surface it without needing a
    sidecar. Modifies the file in place.
    """
    m = SIDECAR_META[layer_type]
    with rasterio.open(tif_path, "r+") as src:
        src.descriptions = (m["BAND_DESC"],)
        src.units        = (m["BAND_UNIT"],)
        src.update_tags(
            TITLE       = m["TITLE"],
            SOURCE      = m["SOURCE"],
            UNITS       = m["UNITS"],
            DESCRIPTION = m["DESCRIPTION"],
            LICENSE     = "CC BY 4.0 — attribute the original dataset listed under SOURCE.",
        )


# ── Supabase ─────────────────────────────────────────────────────────────────

def list_layers(country: Optional[str], layer_type: Optional[str]) -> list[dict]:
    params = {"select": "id,country,layer_type,r2_key", "order": "country.asc"}
    if country:
        params["country"] = f"eq.{country}"
    if layer_type:
        params["layer_type"] = f"eq.{layer_type}"
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/rainfall_climate_layers",
        headers={**SUPABASE_HEADERS, "Content-Type": "application/json"},
        params=params,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


# ── R2 ───────────────────────────────────────────────────────────────────────

def r2_download(key: str, dest: Path) -> None:
    r2.download_file(Bucket=R2_BUCKET, Key=key, Filename=str(dest))


def r2_upload(src: Path, key: str, content_type: str) -> None:
    r2.upload_file(
        Filename=str(src), Bucket=R2_BUCKET, Key=key,
        ExtraArgs={"ContentType": content_type},
    )


# ── Per-layer worker ─────────────────────────────────────────────────────────

def process(layer: dict, *, dry_run: bool) -> str:
    country    = layer["country"]
    layer_type = layer["layer_type"]
    r2_key     = layer["r2_key"]

    if layer_type not in SIDECAR_META:
        print(f"  [{country}/{layer_type}] no metadata template — skip")
        return "skipped"

    if not r2_key.endswith(".zip"):
        print(f"  [{country}/{layer_type}] r2_key not a .zip ({r2_key}) — skip")
        return "skipped"

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        zip_in = td / "in.zip"
        r2_download(r2_key, zip_in)

        # Find the .tif inside the zip and extract it to disk so rasterio
        # can open it in r+ mode (it can't update inside a zip).
        with zipfile.ZipFile(zip_in, "r") as zf:
            tif_names = [n for n in zf.namelist() if n.lower().endswith(".tif")]
            if not tif_names:
                print(f"  [{country}/{layer_type}] no .tif in zip — skip")
                return "skipped"
            tif_name = tif_names[0]
            zf.extract(tif_name, td)
        tif_path = td / tif_name

        # Embed metadata directly into the GeoTIFF — every GIS reader sees it.
        try:
            embed_metadata(tif_path, layer_type)
        except Exception as e:
            print(f"  [{country}/{layer_type}] embed FAILED: {e}")
            return "failed"

        zip_out = td / "out.zip"
        with zipfile.ZipFile(zip_out, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
            zf.write(tif_path, arcname=tif_name)

        size_kb = zip_out.stat().st_size / 1024
        print(f"  [{country}/{layer_type}] embedded metadata into {tif_name} ({size_kb:.0f} KB)")

        if dry_run:
            return "ok"

        try:
            r2_upload(zip_out, r2_key, "application/zip")
        except Exception as e:
            print(f"  [{country}/{layer_type}] upload FAILED: {e}")
            return "failed"
    return "ok"


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--country")
    p.add_argument("--layer-type", choices=list(SIDECAR_META.keys()))
    p.add_argument("--all", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if not (args.country or args.layer_type or args.all):
        p.error("pass --country / --layer-type / --all")

    layers = list_layers(args.country, args.layer_type)
    if not layers:
        sys.exit("no matching layers")

    print(f"Processing {len(layers)} layer(s)" + ("  [DRY-RUN]" if args.dry_run else ""))
    summary: dict[str, int] = {}
    for layer in layers:
        try:
            outcome = process(layer, dry_run=args.dry_run)
        except Exception as e:
            print(f"  [{layer.get('country')}/{layer.get('layer_type')}] CRASHED: {e}")
            outcome = "failed"
        summary[outcome] = summary.get(outcome, 0) + 1

    print()
    for k, v in summary.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
