#!/usr/bin/env python3
"""
Africa LULC Pipeline — ESA WorldCover 2021 (v200)
===================================================
Downloads ESA WorldCover 2021 10m land-use/land-cover GeoTIFF tiles from the
AWS S3 public bucket (s3://esa-worldcover), clips each to its country boundary,
and produces one per-country GeoTIFF for all 54 African countries.

Output files : output/LULC/{Country_safe}_LULC.tif  (local, on your PC)
Tile cache   : data/lulc_tiles/{tile}.tif            (reused across countries)
State log    : logs/lulc/state_{RUN_TS}.csv
R2 key       : lulc/{Country_safe}/{Country_safe}_LULC.tif
Supabase     : lulc_layers table

ESA WorldCover 2021 v200 class values (uint8)
─────────────────────────────────────────────
  10  Tree cover             60  Bare / sparse vegetation
  20  Shrubland              70  Snow and ice
  30  Grassland              80  Permanent water bodies
  40  Cropland               90  Herbaceous wetland
  50  Built-up               95  Mangroves
                            100  Moss and lichen
                            255  No data

Tile grid : 3°×3° tiles identified by upper-left (NW) corner
Source    : s3://esa-worldcover (AWS eu-central-1, public — no auth required)
Tile URL  : https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/
            ESA_WorldCover_10m_2021_v200_{tile}_Map.tif

Processing order  : smallest country → largest (quick wins on island states first)
R2 / Supabase     : country name stored as-is → alphabetical in any ORDER BY query
Vercel (Next.js)  : served via /api/lulc route (add after running this script)

Run the Supabase migration first:
  psql "$SUPABASE_DB_URL" -f scripts/lulc_migration.sql

Usage
─────
  python africa_lulc_pipeline.py                    # all 54 countries
  python africa_lulc_pipeline.py --dry-run          # preview, no uploads
  python africa_lulc_pipeline.py --country Zambia   # single country
  python africa_lulc_pipeline.py --resume           # skip already-done

Requirements (all already in requirements.txt):
  numpy, requests, geopandas, rasterio, boto3, python-dotenv
"""

import argparse
import csv
import io
import math
import os
import shutil
import sys
import tempfile
import time
import traceback
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Guard: fail early with a clear message if deps are missing ─────────────
try:
    import boto3
    import geopandas as gpd
    import numpy as np
    import requests
    import rasterio
    import rasterio.merge
    import rasterio.mask
    from botocore.config import Config
    from dotenv import load_dotenv
    from rasterio.crs import CRS
    from rasterio.io import MemoryFile
    from shapely.geometry import mapping
    from shapely.ops import unary_union
except ImportError as e:
    sys.exit(f"Missing dependency: {e}\nRun: python -m pip install -r requirements.txt")

# ── UTF-8 stdout on Windows ────────────────────────────────────────────────────
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ── Environment ────────────────────────────────────────────────────────────────
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

# ── Directories ────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
TILES_DIR  = BASE_DIR / "data"   / "lulc_tiles"  # cached raw ESA tiles
OUTPUT_DIR = BASE_DIR / "output" / "LULC"         # per-country output GeoTIFFs
BOUNDS_DIR = BASE_DIR / "boundaries"              # shared Natural Earth cache
LOG_DIR    = BASE_DIR / "logs"   / "lulc"

for _d in [TILES_DIR, OUTPUT_DIR, BOUNDS_DIR, LOG_DIR]:
    _d.mkdir(parents=True, exist_ok=True)

RUN_TS = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

# ── ESA WorldCover source ──────────────────────────────────────────────────────
ESA_BASE_URL = (
    "https://esa-worldcover.s3.eu-central-1.amazonaws.com"
    "/v200/2021/map"
)
ESA_NODATA = 255     # ESA WorldCover no-data / void value
ESA_DTYPE  = "uint8"

# ── Natural Earth boundaries ───────────────────────────────────────────────────
NE_COUNTRIES_URL = (
    "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries.zip"
)


# ══════════════════════════════════════════════════════════════════════════════
# AFRICA COUNTRY REFERENCE
# ══════════════════════════════════════════════════════════════════════════════

# Lenga Maps standard names — must match exactly what other pipelines use
AFRICA_COUNTRIES: set[str] = {
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
    "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
    "Congo", "Democratic Republic of the Congo", "Djibouti", "Egypt",
    "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon",
    "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Ivory Coast", "Kenya",
    "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali",
    "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger",
    "Nigeria", "Rwanda", "Sao Tome and Principe", "Senegal", "Seychelles",
    "Sierra Leone", "Somalia", "South Africa", "South Sudan", "Sudan",
    "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
}

# Natural Earth name → Lenga Maps standard name (same mapping as other pipelines)
NE_NAME_MAP: dict[str, Optional[str]] = {
    "Côte d'Ivoire":                    "Ivory Coast",
    "Republic of the Congo":            "Congo",
    "Dem. Rep. Congo":                  "Democratic Republic of the Congo",
    "Democratic Republic of the Congo": "Democratic Republic of the Congo",
    "United Republic of Tanzania":      "Tanzania",
    "Swaziland":                        "Eswatini",
    "São Tomé and Principe":            "Sao Tome and Principe",
    "Cape Verde":                       "Cabo Verde",
    "Western Sahara":                   None,   # disputed — excluded
    "Somaliland":                       None,   # unrecognised — excluded
}

# ── Processing order: smallest → largest by approximate area (km²) ─────────────
# R2 / Supabase / Vercel use the country name as-is → alphabetical in queries.
# This list controls download scheduling only: small island states first so you
# can verify results quickly before multi-hour jobs run for large countries.
PROCESSING_ORDER: list[str] = [
    # ── Micro-states & island nations ─────────────────────────────────────────
    "Seychelles",               # ~457 km²
    "Sao Tome and Principe",    # ~964 km²
    "Comoros",                  # ~1,862 km²
    "Mauritius",                # ~2,040 km²
    "Cabo Verde",               # ~4,033 km²
    # ── Small mainland ────────────────────────────────────────────────────────
    "Gambia",                   # ~11,295 km²
    "Eswatini",                 # ~17,364 km²
    "Djibouti",                 # ~23,200 km²
    "Rwanda",                   # ~26,338 km²
    "Burundi",                  # ~27,834 km²
    "Equatorial Guinea",        # ~28,051 km²
    "Lesotho",                  # ~30,355 km²
    "Guinea-Bissau",            # ~36,125 km²
    "Togo",                     # ~56,785 km²
    "Sierra Leone",             # ~71,740 km²
    "Liberia",                  # ~111,369 km²
    "Benin",                    # ~114,763 km²
    "Eritrea",                  # ~117,600 km²
    "Malawi",                   # ~118,484 km²
    "Tunisia",                  # ~163,610 km²
    "Senegal",                  # ~196,722 km²
    # ── Mid-sized ─────────────────────────────────────────────────────────────
    "Ghana",                    # ~238,533 km²
    "Uganda",                   # ~241,038 km²
    "Guinea",                   # ~245,857 km²
    "Gabon",                    # ~267,668 km²
    "Burkina Faso",             # ~274,222 km²
    "Ivory Coast",              # ~322,463 km²
    "Congo",                    # ~342,000 km²
    "Zimbabwe",                 # ~390,757 km²
    "Morocco",                  # ~446,550 km²
    "Cameroon",                 # ~475,442 km²
    "Kenya",                    # ~580,367 km²
    "Botswana",                 # ~581,730 km²
    "Madagascar",               # ~587,041 km²
    "Central African Republic", # ~622,984 km²
    "Somalia",                  # ~637,657 km²
    "South Sudan",              # ~644,329 km²
    "Zambia",                   # ~752,618 km²
    "Mozambique",               # ~801,590 km²
    "Namibia",                  # ~824,292 km²
    # ── Large ─────────────────────────────────────────────────────────────────
    "Nigeria",                  # ~923,768 km²
    "Tanzania",                 # ~945,087 km²
    "Egypt",                    # ~1,002,450 km²
    "Mauritania",               # ~1,030,700 km²
    "Ethiopia",                 # ~1,104,300 km²
    "South Africa",             # ~1,219,090 km²
    "Mali",                     # ~1,240,192 km²
    "Angola",                   # ~1,246,700 km²
    "Niger",                    # ~1,267,000 km²
    "Chad",                     # ~1,284,000 km²
    "Libya",                    # ~1,759,540 km²
    "Sudan",                    # ~1,886,068 km²
    # ── Giant ─────────────────────────────────────────────────────────────────
    "Democratic Republic of the Congo",  # ~2,344,858 km²
    "Algeria",                           # ~2,381,741 km²
]

# Integrity checks — caught at import time so mistakes surface immediately
assert len(PROCESSING_ORDER) == len(AFRICA_COUNTRIES), (
    f"PROCESSING_ORDER has {len(PROCESSING_ORDER)} entries, "
    f"AFRICA_COUNTRIES has {len(AFRICA_COUNTRIES)}"
)
assert set(PROCESSING_ORDER) == AFRICA_COUNTRIES, (
    "Mismatch between PROCESSING_ORDER and AFRICA_COUNTRIES:\n"
    f"  Extra in order   : {set(PROCESSING_ORDER) - AFRICA_COUNTRIES}\n"
    f"  Missing from order: {AFRICA_COUNTRIES - set(PROCESSING_ORDER)}"
)


# ══════════════════════════════════════════════════════════════════════════════
# LOGGING
# ══════════════════════════════════════════════════════════════════════════════

def log(msg: str, indent: int = 0) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {'  ' * indent}{msg}", flush=True)


# ══════════════════════════════════════════════════════════════════════════════
# STATE TRACKING
# ══════════════════════════════════════════════════════════════════════════════
# Every country run is appended to a timestamped CSV so you can see at a glance
# what finished, what failed, and why — without re-reading all log output.

STATE_LOG_PATH = LOG_DIR / f"state_{RUN_TS}.csv"
_STATE_FIELDS  = [
    "country", "status", "tiles_downloaded",
    "output_file", "r2_key", "size_mb", "error", "timestamp",
]


def _init_state_log() -> None:
    with open(STATE_LOG_PATH, "w", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, fieldnames=_STATE_FIELDS).writeheader()


def _write_state(
    country:          str,
    status:           str,   # "done" | "failed" | "skipped" | "in_progress"
    tiles_downloaded: int   = 0,
    output_file:      str   = "",
    r2key:            str   = "",
    size_mb:          float = 0.0,
    error:            str   = "",
) -> None:
    with open(STATE_LOG_PATH, "a", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, fieldnames=_STATE_FIELDS).writerow({
            "country":          country,
            "status":           status,
            "tiles_downloaded": tiles_downloaded,
            "output_file":      output_file,
            "r2_key":           r2key,
            "size_mb":          round(size_mb, 4),
            "error":            error,
            "timestamp":        datetime.now(timezone.utc).isoformat(),
        })


# ══════════════════════════════════════════════════════════════════════════════
# R2 CLIENT
# ══════════════════════════════════════════════════════════════════════════════

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)


def r2_safe(country: str) -> str:
    """Filesystem / URL-safe variant of a country name (spaces → underscores)."""
    return (
        country
        .replace(" ", "_")
        .replace("'", "")
        .replace(",", "")
        .replace("&", "and")
    )


def build_r2_key(country: str) -> str:
    safe = r2_safe(country)
    return f"lulc/{safe}/{safe}_LULC.tif"


# ══════════════════════════════════════════════════════════════════════════════
# ESA WorldCover TILE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def tile_stem(lat_ul: int, lon_ul: int) -> str:
    """
    ESA WorldCover tile identifier for the tile whose upper-left (NW) corner
    is at (lat_ul°, lon_ul°).  Both must be integer multiples of 3.

    The tile covers lat [lat_ul − 3, lat_ul], lon [lon_ul, lon_ul + 3].

    Examples
    --------
    tile_stem( 6, -6) → "N06W006"  (lat 3–6 N, lon 6–3 W)
    tile_stem( 0,  3) → "N00E003"  (lat 3 S–0,  lon 3–6 E)
    tile_stem(-3, 36) → "S03E036"  (lat 6–3 S,  lon 36–39 E)
    """
    ns = "N" if lat_ul >= 0 else "S"
    ew = "E" if lon_ul >= 0 else "W"
    return f"{ns}{abs(lat_ul):02d}{ew}{abs(lon_ul):03d}"


def tile_url(stem: str) -> str:
    return f"{ESA_BASE_URL}/ESA_WorldCover_10m_2021_v200_{stem}_Map.tif"


def tiles_for_bbox(
    minx: float, miny: float, maxx: float, maxy: float
) -> list[tuple[int, int]]:
    """
    Return all (lat_ul, lon_ul) tile upper-left corners (multiples of 3) for
    ESA WorldCover tiles that overlap the bounding box [minx, miny, maxx, maxy].

    Tile (lat_ul, lon_ul) covers:
      lat [lat_ul − 3, lat_ul],  lon [lon_ul, lon_ul + 3]

    Overlap requires:
      lat_ul  > miny    AND  lat_ul − 3 < maxy   (lat overlap)
      lon_ul  < maxx    AND  lon_ul + 3 > minx    (lon overlap)
    """
    # Smallest multiple of 3 that is strictly > miny
    first_lat = int(math.floor(miny / 3.0)) * 3 + 3
    # Largest multiple of 3 where lat_ul − 3 < maxy  →  lat_ul < maxy + 3
    # i.e. the ceil of maxy rounded to the next 3-multiple
    last_lat  = int(math.ceil(maxy / 3.0)) * 3

    # Smallest multiple of 3 where lon_ul + 3 > minx  →  lon_ul > minx − 3
    first_lon = int(math.floor(minx / 3.0)) * 3
    # Largest multiple of 3 where lon_ul < maxx
    last_lon  = int(math.floor(maxx / 3.0)) * 3
    # Edge case: if maxx is an exact multiple of 3, the tile whose lon_ul=maxx
    # starts right at the eastern edge — it does NOT overlap (lon_ul >= maxx).
    # The floor above handles this correctly.

    tiles = []
    for lat_ul in range(first_lat, last_lat + 1, 3):
        for lon_ul in range(first_lon, last_lon + 1, 3):
            tiles.append((lat_ul, lon_ul))
    return tiles


def download_tile(lat_ul: int, lon_ul: int, retries: int = 3) -> Optional[Path]:
    """
    Download one ESA WorldCover 3°×3° tile and cache it locally.

    Returns the cached .tif path, or None if the tile is ocean / does not exist.

    Retry strategy
    --------------
    Up to `retries` attempts with exponential back-off: 2 s, 4 s, 8 s.
    A zero-byte .null marker is written for confirmed 404 tiles so subsequent
    runs skip the HTTP request entirely.
    """
    stem      = tile_stem(lat_ul, lon_ul)
    tif_path  = TILES_DIR / f"{stem}.tif"
    null_path = TILES_DIR / f"{stem}.null"

    if tif_path.exists():
        return tif_path    # already cached
    if null_path.exists():
        return None        # confirmed ocean / no-data — skip

    url     = tile_url(stem)
    tmp     = TILES_DIR / f"{stem}.tmp"

    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, timeout=120, stream=True)
            if resp.status_code == 404:
                null_path.touch()
                log(f"tile {stem}: ocean/no-data (404) — .null cached", indent=3)
                return None
            resp.raise_for_status()

            with open(tmp, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=1 << 20):  # 1 MB chunks
                    fh.write(chunk)
            tmp.rename(tif_path)
            size_mb = tif_path.stat().st_size / 1_048_576
            log(f"tile {stem}: downloaded ({size_mb:.1f} MB)", indent=3)
            return tif_path

        except Exception as exc:
            tmp.unlink(missing_ok=True)
            if attempt < retries:
                wait = 2 ** attempt
                log(
                    f"tile {stem}: attempt {attempt} failed "
                    f"({type(exc).__name__}: {exc}) — retry in {wait}s",
                    indent=3,
                )
                time.sleep(wait)
            else:
                log(
                    f"WARNING: tile {stem} failed after {retries} attempts — {exc}",
                    indent=3,
                )
                return None

    return None  # unreachable, but satisfies type checker


# ══════════════════════════════════════════════════════════════════════════════
# NATURAL EARTH — AFRICA COUNTRY BOUNDARIES
# ══════════════════════════════════════════════════════════════════════════════

def load_africa_countries() -> gpd.GeoDataFrame:
    """
    Download Natural Earth 10m admin-0 countries (cached to boundaries/) and
    return a GeoDataFrame of African countries with a 'lenga_name' column set
    to the Lenga Maps standard name.
    """
    cache = BOUNDS_DIR / "ne_countries_lulc.zip"
    if cache.exists():
        data = cache.read_bytes()
        log("  [cache hit] Natural Earth countries")
    else:
        log("  Downloading Natural Earth 10m Admin-0 countries ...")
        resp = requests.get(NE_COUNTRIES_URL, timeout=180)
        resp.raise_for_status()
        data = resp.content
        cache.write_bytes(data)
        log(f"  Downloaded {len(data) / 1e6:.1f} MB → {cache.name}")

    tmp_dir = Path(tempfile.mkdtemp(prefix="ne_lulc_"))
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            z.extractall(tmp_dir)
        shp = next(tmp_dir.rglob("*.shp"))
        countries = gpd.read_file(shp).to_crs("EPSG:4326")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    def resolve_name(row) -> Optional[str]:
        for col in ("ADMIN", "NAME", "NAME_LONG", "SOVEREIGNT"):
            raw = str(row.get(col, "") or "").strip()
            if not raw:
                continue
            if raw in NE_NAME_MAP:
                return NE_NAME_MAP[raw]   # may be None (excluded territory)
            if raw in AFRICA_COUNTRIES:
                return raw
        return None

    countries["lenga_name"] = countries.apply(resolve_name, axis=1)
    africa = countries[
        countries["lenga_name"].notna() &
        countries["lenga_name"].isin(AFRICA_COUNTRIES)
    ].copy()
    log(
        f"  Resolved {len(africa)} of {len(AFRICA_COUNTRIES)} "
        "African countries from Natural Earth"
    )
    return africa


# ══════════════════════════════════════════════════════════════════════════════
# PER-COUNTRY PROCESSING
# ══════════════════════════════════════════════════════════════════════════════

def process_country(
    country:  str,
    geom,             # Shapely geometry (EPSG:4326)
    dry_run:  bool = False,
    resume:   bool = False,
) -> bool:
    """
    Full pipeline for one country:

      1. Identify the ESA WorldCover 3°×3° tiles that overlap the country bbox
      2. Download missing tiles — 3 retries, exponential back-off
      3. Mosaic tiles in memory, bounded to country bbox (+ 0.1° buffer)
      4. Clip mosaic to exact country boundary
      5. Write output/{safe}_LULC.tif  (uint8, LZW compressed, 256×256 tiles)
      6. Upload to Cloudflare R2
      7. Upsert row to Supabase lulc_layers

    Returns True on success (including graceful skips), False on hard failure.
    """
    safe     = r2_safe(country)
    out_path = OUTPUT_DIR / f"{safe}_LULC.tif"
    key      = build_r2_key(country)

    # ── Resume mode: skip if output already exists ───────────────────────────
    if resume and out_path.exists():
        log(f"  SKIP (resume): {out_path.name} already exists", indent=1)
        _write_state(country, "skipped", output_file=str(out_path))
        return True

    _write_state(country, "in_progress")

    # ── Country bounding box ─────────────────────────────────────────────────
    minx, miny, maxx, maxy = geom.bounds
    log(f"  bbox [{minx:.2f}, {miny:.2f}, {maxx:.2f}, {maxy:.2f}]", indent=1)

    # ── Tile discovery ───────────────────────────────────────────────────────
    tile_coords = tiles_for_bbox(minx, miny, maxx, maxy)
    log(f"  tiles to check: {len(tile_coords)}", indent=1)

    # ── Tile download ────────────────────────────────────────────────────────
    tile_paths: list[Path] = []
    for lat_ul, lon_ul in tile_coords:
        tp = download_tile(lat_ul, lon_ul, retries=3)
        if tp is not None:
            tile_paths.append(tp)

    if not tile_paths:
        log(
            f"  NOTE: no ESA tile data for {country} "
            "(may be a very small island without land-cover tile coverage) — skipping",
            indent=1,
        )
        _write_state(country, "skipped", error="no tile data found")
        return True   # graceful skip, not a failure

    log(f"  tiles with data: {len(tile_paths)}", indent=1)

    # ── Mosaic tiles (bounded to country bbox + small buffer) ────────────────
    # Using MemoryFile to avoid writing temporary mosaic files to disk.
    buf = 0.15   # degrees — prevents edge artefacts after clip
    try:
        datasets = [rasterio.open(p) for p in tile_paths]
        try:
            mosaic_bounds = (minx - buf, miny - buf, maxx + buf, maxy + buf)
            mosaic_data, mosaic_transform = rasterio.merge.merge(
                datasets,
                bounds=mosaic_bounds,
                nodata=ESA_NODATA,
                method="first",
            )
            mosaic_crs = datasets[0].crs
        finally:
            for ds in datasets:
                ds.close()
    except Exception as exc:
        log(f"  ERROR: mosaic failed — {exc}", indent=1)
        _write_state(country, "failed", len(tile_paths), error=f"mosaic: {exc}")
        return False

    # ── Clip to exact country boundary via MemoryFile ────────────────────────
    mosaic_profile = {
        "driver":    "GTiff",
        "dtype":     ESA_DTYPE,
        "count":     1,
        "crs":       mosaic_crs,
        "transform": mosaic_transform,
        "height":    mosaic_data.shape[1],
        "width":     mosaic_data.shape[2],
        "nodata":    ESA_NODATA,
    }
    try:
        with MemoryFile() as memfile:
            with memfile.open(**mosaic_profile) as mem_ds:
                mem_ds.write(mosaic_data)
            with memfile.open() as mem_ds:
                clipped, clipped_transform = rasterio.mask.mask(
                    mem_ds,
                    [mapping(geom)],
                    crop=True,
                    nodata=ESA_NODATA,
                )
                clipped_meta = mem_ds.meta.copy()
    except Exception as exc:
        log(f"  ERROR: clip failed — {exc}", indent=1)
        _write_state(country, "failed", len(tile_paths), error=f"clip: {exc}")
        return False

    # ── Write output GeoTIFF ─────────────────────────────────────────────────
    clipped_meta.update({
        "driver":     "GTiff",
        "dtype":      ESA_DTYPE,
        "count":      1,
        "height":     clipped.shape[1],
        "width":      clipped.shape[2],
        "transform":  clipped_transform,
        "crs":        CRS.from_epsg(4326),
        "nodata":     ESA_NODATA,
        "compress":   "lzw",
        "tiled":      True,
        "blockxsize": 256,
        "blockysize": 256,
        "interleave": "band",
    })
    try:
        with rasterio.open(out_path, "w", **clipped_meta) as dst:
            dst.write(clipped[0], 1)
            dst.update_tags(
                source="ESA WorldCover 2021 v200",
                country=country,
                pipeline="africa_lulc_pipeline.py",
                created=RUN_TS,
                classes=(
                    "10=Tree cover, 20=Shrubland, 30=Grassland, 40=Cropland, "
                    "50=Built-up, 60=Bare/sparse, 70=Snow/ice, "
                    "80=Permanent water, 90=Herbaceous wetland, "
                    "95=Mangroves, 100=Moss/lichen, 255=NoData"
                ),
            )
    except Exception as exc:
        out_path.unlink(missing_ok=True)
        log(f"  ERROR: write failed — {exc}", indent=1)
        _write_state(country, "failed", len(tile_paths), error=f"write: {exc}")
        return False

    size_mb = out_path.stat().st_size / 1_048_576
    log(f"  output: {out_path.name}  ({size_mb:.2f} MB)", indent=1)

    # ── Upload to Cloudflare R2 ──────────────────────────────────────────────
    if not dry_run:
        try:
            with open(out_path, "rb") as fh:
                r2.put_object(
                    Bucket=R2_BUCKET,
                    Key=key,
                    Body=fh,
                    ContentType="image/tiff",
                )
            log(f"  R2 upload: {key}", indent=1)
        except Exception as exc:
            log(f"  ERROR: R2 upload failed — {exc}", indent=1)
            _write_state(
                country, "failed", len(tile_paths), str(out_path), key, size_mb,
                error=f"r2_upload: {exc}",
            )
            return False
    else:
        log(f"  [dry-run] R2 would write → {key}", indent=1)

    # ── Upsert to Supabase ───────────────────────────────────────────────────
    upsert_supabase(country, key, size_mb, dry_run)

    _write_state(country, "done", len(tile_paths), str(out_path), key, size_mb)
    return True


# ══════════════════════════════════════════════════════════════════════════════
# SUPABASE UPSERT
# ══════════════════════════════════════════════════════════════════════════════

def upsert_supabase(
    country: str, key: str, size_mb: float, dry_run: bool
) -> None:
    """Insert or update one row in the lulc_layers Supabase table."""
    row = {
        "country":      country,
        "layer_type":   "lulc",
        "r2_key":       key,
        "file_size_mb": round(size_mb, 4),
        "file_format":  "GeoTIFF",
        "source":       "ESA WorldCover 2021 v200",
        "resolution":   "10m",
        "epsg":         4326,
    }
    if dry_run:
        log(f"  [dry-run] Supabase: {country}", indent=1)
        return
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/lulc_layers",
        headers=SUPABASE_HEADERS,
        json=row,
        timeout=30,
    )
    if not resp.ok:
        log(
            f"  WARNING: Supabase upsert failed "
            f"({resp.status_code}): {resp.text[:200]}",
            indent=1,
        )
    else:
        log(f"  Supabase: {country} → lulc_layers", indent=1)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Africa LULC Pipeline — ESA WorldCover 2021 (v200)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Output files are saved to output/LULC/ on this machine.\n"
            "Tile cache lives in data/lulc_tiles/ (safe to delete after run).\n"
            "Run scripts/lulc_migration.sql in Supabase before first run."
        ),
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Preview tiles and output sizes — no R2 uploads, no DB writes",
    )
    parser.add_argument(
        "--country", metavar="NAME",
        help="Process only this country (use Lenga Maps standard name, e.g. 'Zambia')",
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Skip countries whose output .tif already exists in output/LULC/",
    )
    args = parser.parse_args()

    log("=" * 65)
    log("  Africa LULC Pipeline — ESA WorldCover 2021 v200 (10m)")
    log("  54 African countries | processing order: smallest → largest")
    log("=" * 65)
    if args.dry_run:
        log("  *** DRY RUN — no uploads or DB writes ***")
    log(f"  Tile cache : {TILES_DIR.resolve()}")
    log(f"  Output dir : {OUTPUT_DIR.resolve()}")

    # ── Step 1: Load Africa country boundaries ───────────────────────────────
    log("\nStep 1: Loading Africa country boundaries (Natural Earth 10m) ...")
    africa = load_africa_countries()

    # Build country-name → dissolved geometry map
    country_geoms: dict[str, object] = {}
    for _, row in africa.iterrows():
        name = row["lenga_name"]
        geom = row.geometry
        if not name or geom is None:
            continue
        if name in country_geoms:
            # Island nations may appear as multiple rows — dissolve them
            country_geoms[name] = unary_union([country_geoms[name], geom])
        else:
            country_geoms[name] = geom

    # ── Step 2: Determine target list ────────────────────────────────────────
    if args.country:
        if args.country not in AFRICA_COUNTRIES:
            log(
                f"ERROR: '{args.country}' is not a valid Lenga Maps country name.\n"
                f"Valid names: {sorted(AFRICA_COUNTRIES)}"
            )
            sys.exit(1)
        targets = [args.country]
    else:
        targets = PROCESSING_ORDER   # smallest → largest

    log(f"\nStep 2: Processing {len(targets)} countries (smallest → largest) ...")
    log(f"  State log: {STATE_LOG_PATH}")
    log("-" * 65)

    _init_state_log()

    success = failed = skipped = 0
    for idx, country in enumerate(targets, 1):
        geom = country_geoms.get(country)
        if geom is None:
            log(
                f"\n[{idx:02d}/{len(targets)}] {country} "
                "— NOT FOUND in Natural Earth boundaries, skipping"
            )
            _write_state(country, "skipped", error="not in Natural Earth")
            skipped += 1
            continue

        log(f"\n[{idx:02d}/{len(targets)}] {country}")
        try:
            ok = process_country(
                country, geom,
                dry_run=args.dry_run,
                resume=args.resume,
            )
            if ok:
                success += 1
            else:
                failed += 1
        except Exception:
            err_text = traceback.format_exc()
            log(f"  ERROR (unhandled):\n{err_text}", indent=1)
            _write_state(country, "failed", error=err_text[:500])
            failed += 1

    # ── Summary ──────────────────────────────────────────────────────────────
    tifs = sorted(OUTPUT_DIR.glob("*.tif"))
    log("\n" + "=" * 65)
    log("  Pipeline complete!")
    log(f"  Success  : {success}")
    log(f"  Skipped  : {skipped}  (ocean-only islands or --resume)")
    log(f"  Failed   : {failed}")
    log(f"  GeoTIFFs : {len(tifs)} files in {OUTPUT_DIR.resolve()}")
    log(f"  State log: {STATE_LOG_PATH}")
    if failed:
        log(f"  Re-run with --resume to retry only the {failed} failed countries.")
    log("=" * 65)


if __name__ == "__main__":
    main()
