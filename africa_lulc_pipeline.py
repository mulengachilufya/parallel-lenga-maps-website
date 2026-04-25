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
    from boto3.s3.transfer import TransferConfig
    from dotenv import load_dotenv
    from rasterio.crs import CRS
    from rasterio.enums import Resampling
    from rasterio.io import MemoryFile
    from rasterio.shutil import copy as rio_copy
    from shapely.geometry import mapping
    from shapely.ops import unary_union
except ImportError as e:
    sys.exit(f"Missing dependency: {e}\nRun: python -m pip install -r requirements.txt")

# osgeo (GDAL Python bindings) — optional, used only for the Raster Attribute
# Table (RAT).  The color table written by rasterio is sufficient for QGIS /
# ArcGIS rendering; the RAT adds named classes in the Properties panel.
try:
    from osgeo import gdal as _gdal
    _HAS_GDAL = True
except ImportError:
    _gdal = None
    _HAS_GDAL = False

# ── UTF-8 stdout on Windows ────────────────────────────────────────────────────
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ── Environment ────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env.local")

# GDAL over-estimates temporary disk space for overviews/mosaic operations.
# Disable the pre-check so we don't abort on false positives.
os.environ.setdefault("CHECK_DISK_FREE_SPACE", "NO")

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

# Official ESA WorldCover 2021 class table: (value, class_name, R, G, B)
# Colors match the ESA-published color scheme exactly.
ESA_CLASSES: list[tuple[int, str, int, int, int]] = [
    (10,  "Tree cover",              77,  139, 49 ),
    (20,  "Shrubland",               251, 185, 130),
    (30,  "Grassland",               253, 211, 39 ),
    (40,  "Cropland",                240, 150, 255),
    (50,  "Built-up",                250, 0,   0  ),
    (60,  "Bare / sparse vegetation",180, 180, 180),
    (70,  "Snow and ice",            240, 240, 240),
    (80,  "Permanent water bodies",  0,   100, 200),
    (90,  "Herbaceous wetland",      0,   150, 160),
    (95,  "Mangroves",               0,   207, 117),
    (100, "Moss and lichen",         250, 230, 160),
]

# Pre-built RGBA colormap for rasterio — written at file creation time so it
# survives COG conversion via rio_copy (no post-hoc r+ needed).
ESA_COLORMAP: dict[int, tuple[int, int, int, int]] = {
    value: (r, g, b, 255) for value, _, r, g, b in ESA_CLASSES
}
ESA_COLORMAP[ESA_NODATA] = (0, 0, 0, 0)  # nodata pixels fully transparent

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
    "Swaziland":                        "Eswatini",   # old NE name → new name
    "eSwatini":                         "Eswatini",
    "Eswatini":                         "Eswatini",
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
    # ── Southern Africa priority (user-requested: Zambia first) ───────────────
    "Zambia",                   # ~752,618 km²  ← priority start
    "Zimbabwe",                 # ~390,757 km²
    "Botswana",                 # ~581,730 km²
    "Madagascar",               # ~587,041 km²
    "Mozambique",               # ~801,590 km²
    "Namibia",                  # ~824,292 km²
    "Tanzania",                 # ~945,087 km²
    "South Africa",             # ~1,219,090 km²
    "Angola",                   # ~1,246,700 km²
    "Democratic Republic of the Congo",  # ~2,344,858 km²
    # ── Remaining mid-sized (West/Central/East Africa) ────────────────────────
    "Ivory Coast",              # ~322,463 km²
    "Congo",                    # ~342,000 km²
    "Morocco",                  # ~446,550 km²
    "Cameroon",                 # ~475,442 km²
    "Kenya",                    # ~580,367 km²
    "Central African Republic", # ~622,984 km²
    "Somalia",                  # ~637,657 km²
    "South Sudan",              # ~644,329 km²
    # ── Large (North/West/East Africa) ────────────────────────────────────────
    "Nigeria",                  # ~923,768 km²
    "Egypt",                    # ~1,002,450 km²
    "Mauritania",               # ~1,030,700 km²
    "Ethiopia",                 # ~1,104,300 km²
    "Mali",                     # ~1,240,192 km²
    "Niger",                    # ~1,267,000 km²
    "Chad",                     # ~1,284,000 km²
    "Libya",                    # ~1,759,540 km²
    "Sudan",                    # ~1,886,068 km²
    # ── Giant ─────────────────────────────────────────────────────────────────
    "Algeria",                  # ~2,381,741 km²
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

# 64 MB parts × 10 concurrent ≈ 640 MB in flight.  Bypasses the effective
# single-PUT failure ceiling (~300 MB) some networks hit against R2 and
# handles 1–2 GB rasters (Angola, Zambia, South Africa, Tanzania) reliably.
R2_MPU_CONFIG = TransferConfig(
    multipart_threshold=64 * 1024 * 1024,
    multipart_chunksize=64 * 1024 * 1024,
    max_concurrency=10,
    use_threads=True,
)


def r2_upload(local_path: Path, key: str, content_type: str = "image/tiff") -> None:
    """Upload a file to R2 using multipart (any size, no practical cap)."""
    r2.upload_file(
        Filename=str(local_path),
        Bucket=R2_BUCKET,
        Key=key,
        ExtraArgs={"ContentType": content_type},
        Config=R2_MPU_CONFIG,
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
# CLIP-BEFORE-MOSAIC  (memory-efficient alternative to full bbox mosaic)
# ══════════════════════════════════════════════════════════════════════════════

def _clip_tiles_to_geom(
    tile_paths: list[Path],
    geom,                     # Shapely geometry, EPSG:4326
    out_path: Path,           # Write merged result here directly (no RAM array)
    nodata: int = ESA_NODATA,
) -> Optional[tuple[int, int]]:
    """
    Clip each tile to the country geometry and merge the clips directly to
    out_path on disk using windowed writes.  Never allocates the full-extent
    mosaic array in RAM — critical for large countries like Sudan (30 GiB) or
    Algeria (12 GiB) that crashed the previous rasterio.merge.merge() approach.

    Phase 1 — clip: each ESA tile is masked to the country geometry and saved
               as a small .clip_tmp.tif in TILES_DIR.
    Phase 2 — compute extent: scan all clips to derive the merged bbox/resolution.
    Phase 3 — write: create out_path, initialize with nodata in 512-row strips
               (peak RAM ≤ 512 × width bytes ≈ 100 MB), then copy each clip
               into its window.

    Returns (width, height) on success, or None if no valid pixels found.
    """
    from shapely.geometry import box as shapely_box
    from rasterio.windows import from_bounds as window_from_bounds, Window
    from rasterio.transform import from_origin

    tmp_clips: list[Path] = []
    try:
        # ── Phase 1: clip each tile to country geometry ──────────────────────
        merge_crs   = None
        merge_dtype = ESA_DTYPE
        for tile_path in tile_paths:
            with rasterio.open(tile_path) as src:
                b = src.bounds
                tile_box = shapely_box(b.left, b.bottom, b.right, b.top)
                intersection = geom.intersection(tile_box)
                if intersection.is_empty:
                    continue
                clip_geom = intersection.buffer(0.0001)
                try:
                    data, transform = rasterio.mask.mask(
                        src,
                        [mapping(clip_geom)],
                        crop=True,
                        all_touched=True,
                        nodata=nodata,
                    )
                except Exception as exc:
                    log(f"      tile {tile_path.stem}: clip error — {exc}", indent=4)
                    continue
                if np.all(data == nodata):
                    continue
                tmp_path = TILES_DIR / f"{tile_path.stem}.clip_tmp.tif"
                with rasterio.open(
                    tmp_path, "w",
                    driver="GTiff", dtype=ESA_DTYPE, count=1,
                    crs=src.crs, transform=transform,
                    height=data.shape[1], width=data.shape[2],
                    nodata=nodata,
                ) as dst:
                    dst.write(data[0], 1)
                if merge_crs is None:
                    merge_crs   = src.crs
                    merge_dtype = src.dtypes[0]
                tmp_clips.append(tmp_path)
                log(
                    f"      tile {tile_path.stem}: clipped "
                    f"({data.shape[2]}×{data.shape[1]} px)",
                    indent=4,
                )

        if not tmp_clips:
            return None

        # ── Phase 2: compute merged output extent ────────────────────────────
        x_res = y_res = None
        lefts, bottoms, rights, tops = [], [], [], []
        for p in tmp_clips:
            with rasterio.open(p) as ds:
                b = ds.bounds
                lefts.append(b.left);   bottoms.append(b.bottom)
                rights.append(b.right); tops.append(b.top)
                if x_res is None:
                    x_res, y_res  = ds.res[1], ds.res[0]
                    merge_crs     = ds.crs
                    merge_dtype   = ds.dtypes[0]

        left  = min(lefts);   bottom = min(bottoms)
        right = max(rights);  top    = max(tops)
        width  = max(1, round((right - left) / x_res))
        height = max(1, round((top   - bottom) / y_res))
        out_transform = from_origin(left, top, x_res, y_res)

        # ── Phase 3: write directly to out_path, one clip at a time ─────────
        meta = dict(
            driver="GTiff", dtype=merge_dtype, count=1,
            crs=merge_crs, transform=out_transform,
            height=height, width=width, nodata=nodata,
            compress="lzw", tiled=True, blockxsize=512, blockysize=512,
        )
        with rasterio.open(out_path, "w", **meta) as dst:
            # Fill with nodata 512 rows at a time so no large array is needed.
            # LZW-compressed all-nodata strips are near-zero bytes on disk.
            strip_buf = np.full((512, width), nodata, dtype=np.dtype(merge_dtype))
            for row_start in range(0, height, 512):
                h = min(512, height - row_start)
                dst.write(
                    strip_buf[:h], 1,
                    window=Window(0, row_start, width, h),
                )

            for clip_path in tmp_clips:
                with rasterio.open(clip_path) as src:
                    win = window_from_bounds(*src.bounds, transform=out_transform)
                    win = win.round_lengths().round_offsets()
                    col = max(0, int(win.col_off))
                    row = max(0, int(win.row_off))
                    w   = min(int(round(win.width)),  width  - col)
                    h   = min(int(round(win.height)), height - row)
                    if w <= 0 or h <= 0:
                        continue
                    src_data = src.read(
                        1, out_shape=(h, w), resampling=Resampling.nearest,
                    )
                    dst.write(src_data, 1, window=Window(col, row, w, h))

        log(f"      merged: {width}×{height} px", indent=4)
        return width, height

    finally:
        for p in tmp_clips:
            p.unlink(missing_ok=True)


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
# COG FINALIZATION + COLOR TABLE + RAT
# ══════════════════════════════════════════════════════════════════════════════

def _embed_rat(raw_tif_path: Path) -> None:
    """
    Embed a Raster Attribute Table into the intermediate raw GeoTIFF (before
    COG conversion).  Requires osgeo GDAL bindings — skipped gracefully if absent.

    The color table is written directly into the raw.tif at creation time via
    rasterio (see process_country), so we never need to open a finished COG in
    r+ mode (which GDAL rejects with a COG-layout warning).
    """
    if not _HAS_GDAL:
        return

    ds = _gdal.Open(str(raw_tif_path), _gdal.GA_Update)
    if ds is None:
        log(f"  WARNING: GDAL cannot open {raw_tif_path.name} for RAT", indent=1)
        return
    band = ds.GetRasterBand(1)
    rat  = _gdal.RasterAttributeTable()
    rat.CreateColumn("Value",      _gdal.GFT_Integer, _gdal.GFU_MinMax)
    rat.CreateColumn("Class_Name", _gdal.GFT_String,  _gdal.GFU_Name)
    rat.CreateColumn("Red",        _gdal.GFT_Integer, _gdal.GFU_Red)
    rat.CreateColumn("Green",      _gdal.GFT_Integer, _gdal.GFU_Green)
    rat.CreateColumn("Blue",       _gdal.GFT_Integer, _gdal.GFU_Blue)
    for i, (value, class_name, r, g, b) in enumerate(ESA_CLASSES):
        rat.SetValueAsInt(i, 0, value)
        rat.SetValueAsString(i, 1, class_name)
        rat.SetValueAsInt(i, 2, r)
        rat.SetValueAsInt(i, 3, g)
        rat.SetValueAsInt(i, 4, b)
    band.SetDefaultRAT(rat)
    band.FlushCache()
    ds.FlushCache()
    ds = None
    log(f"  RAT embedded → {raw_tif_path.name}", indent=1)


def finalize_as_cog(src_path: Path, dst_path: Path) -> None:
    """
    Convert src_path to a Cloud-Optimized GeoTIFF (COG) at dst_path using
    rasterio (no osgeo required), then embed the ESA color table and RAT.

    Why COG matters for R2-served files
    ────────────────────────────────────
    A COG arranges overview levels before full-resolution data so GDAL/QGIS
    can stream only the zoom level needed via HTTP range requests.  Without
    COG, a 10 m GeoTIFF of Algeria or DRC must be downloaded in full before
    any rendering begins.

    Why NEAREST resampling is mandatory
    ────────────────────────────────────
    ESA WorldCover values are categorical integers (10, 20, 30 …).  Any
    interpolating resampler (bilinear, average) invents values like 15 or 27
    that have no class — corrupting the data.  Resampling.nearest always
    picks an existing class value for every overview pixel.

    src_path and dst_path may be the same path (in-place via temp file).
    """
    in_place = (src_path.resolve() == dst_path.resolve())
    tmp_path  = dst_path.with_suffix(".cog_tmp.tif") if in_place else dst_path

    # Step 1: build internal overviews on the source with NEAREST resampling
    overview_levels = [2, 4, 8, 16, 32, 64, 128]
    with rasterio.open(src_path, "r+") as src:
        src.build_overviews(overview_levels, Resampling.nearest)
        src.update_tags(ns="rio_overview", resampling="nearest")

    # Step 2: copy to COG — overviews are baked at the front of the file
    with rasterio.open(src_path) as src:
        rio_copy(
            src,
            str(tmp_path),
            driver="GTiff",
            copy_src_overviews=True,
            compress="lzw",
            tiled=True,
            blockxsize=512,
            blockysize=512,
            interleave="band",
        )

    if in_place:
        src_path.unlink()
        tmp_path.rename(dst_path)

    # Color table is already embedded in src_path (written at raw.tif creation).
    # rio_copy preserves it via GDALCreateCopy — no r+ reopen of the COG needed.
    log(f"  COG finalized → {dst_path.name}", indent=1)


# ══════════════════════════════════════════════════════════════════════════════
# PER-COUNTRY PROCESSING
# ══════════════════════════════════════════════════════════════════════════════

def process_country(
    country:  str,
    geom,             # Shapely geometry (EPSG:4326)
    dry_run:  bool = False,
    resume:   bool = False,
    skip_r2:  bool = False,
) -> bool:
    """
    Full pipeline for one country:

      1. Identify the ESA WorldCover 3°×3° tiles that overlap the country bbox
      2. Download missing tiles — 3 retries, exponential back-off
      3. Mosaic tiles in memory, bounded to country bbox (+ 0.1° buffer)
      4. Clip mosaic to exact country boundary (NEAREST, nodata=255)
      5. Write intermediate GeoTIFF, then convert to COG (512×512 tiles,
         LZW, NEAREST overviews) and embed ESA color table + RAT
      6. Upload COG to Cloudflare R2
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

    # ── Clean stale files from any previous aborted run ─────────────────────
    raw_path = out_path.with_suffix(".raw.tif")
    for _stale in (out_path, raw_path):
        try:
            _stale.unlink(missing_ok=True)
        except PermissionError as _pe:
            log(
                f"  ERROR: cannot remove stale file '{_stale.name}' "
                f"(locked by another process — close QGIS/ArcGIS and retry): {_pe}",
                indent=1,
            )
            _write_state(country, "failed", error=f"locked_file: {_pe}")
            return False

    _write_state(country, "in_progress")

    # ── Country bounding box ─────────────────────────────────────────────────
    minx, miny, maxx, maxy = geom.bounds
    log(f"  bbox [{minx:.2f}, {miny:.2f}, {maxx:.2f}, {maxy:.2f}]", indent=1)

    # ── Tile discovery — use buffered bbox so edge tiles aren't missed ────────
    # The mosaic is built with a 0.15° buffer to prevent clipping artefacts at
    # country edges.  Tile discovery must use the same buffered extent so that
    # any tile the buffer reaches into is also downloaded.
    buf = 0.15
    tile_coords = tiles_for_bbox(minx - buf, miny - buf, maxx + buf, maxy + buf)
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

    # ── Clip-before-mosaic: writes raw_path directly, no full-extent array ──
    # _clip_tiles_to_geom writes the merged GeoTIFF tile-by-tile to raw_path,
    # keeping peak RAM to one 512-row strip (~100 MB) instead of the full
    # country extent (which was up to 30 GiB for Sudan/Algeria).
    try:
        dims = _clip_tiles_to_geom(tile_paths, geom, raw_path)
    except Exception as exc:
        raw_path.unlink(missing_ok=True)
        log(f"  ERROR: clip-mosaic failed — {exc}", indent=1)
        _write_state(country, "failed", len(tile_paths), error=f"clip: {exc}")
        return False

    if dims is None:
        log(
            f"  NOTE: no valid land pixels found for {country} — skipping",
            indent=1,
        )
        _write_state(country, "skipped", error="no valid data after per-tile clip")
        return True

    width, height = dims
    log(f"  clipped shape: {width}×{height} px", indent=1)

    # ── Embed colormap + tags into raw_path (r+ on non-COG tif is safe) ─────
    try:
        with rasterio.open(raw_path, "r+") as dst:
            dst.write_colormap(1, ESA_COLORMAP)
            dst.update_tags(
                source="ESA WorldCover 2021 v200",
                country=country,
                pipeline="africa_lulc_pipeline.py",
                created=RUN_TS,
                classes=(
                    "10=Tree cover, 20=Shrubland, 30=Grassland, 40=Cropland, "
                    "50=Built-up, 60=Bare/sparse vegetation, 70=Snow and ice, "
                    "80=Permanent water bodies, 90=Herbaceous wetland, "
                    "95=Mangroves, 100=Moss and lichen, 255=NoData"
                ),
            )
    except Exception as exc:
        raw_path.unlink(missing_ok=True)
        log(f"  ERROR: write failed — {exc}", indent=1)
        _write_state(country, "failed", len(tile_paths), error=f"write: {exc}")
        return False

    # Embed RAT on raw.tif now (before COG; opens in r+ mode which is safe
    # for unoptimized files).  Colormap was already written above.
    _embed_rat(raw_path)

    # Convert to COG (builds overviews with NEAREST resampling)
    try:
        finalize_as_cog(raw_path, out_path)
        raw_path.unlink(missing_ok=True)
    except Exception as exc:
        raw_path.unlink(missing_ok=True)
        out_path.unlink(missing_ok=True)
        log(f"  ERROR: COG finalization failed — {exc}", indent=1)
        _write_state(country, "failed", len(tile_paths), error=f"cog: {exc}")
        return False

    size_mb = out_path.stat().st_size / 1_048_576
    log(f"  COG size: {size_mb:.2f} MB", indent=1)

    # ── Upload to Cloudflare R2 ──────────────────────────────────────────────
    if skip_r2:
        log(f"  [skip-r2] R2 upload skipped → {key}", indent=1)
    elif not dry_run:
        try:
            r2_upload(out_path, key, "image/tiff")
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
    upsert_supabase(country, key, size_mb, dry_run or skip_r2)

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
    parser.add_argument(
        "--fix-rat", action="store_true",
        help=(
            "Patch already-generated GeoTIFFs in output/LULC/ with the RAT "
            "and color table, then re-upload to R2. No re-clipping is done. "
            "Use after running the pipeline without RAT support."
        ),
    )
    parser.add_argument(
        "--skip-r2", action="store_true",
        help="Save GeoTIFFs locally only — skip R2 uploads (upload manually later)",
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

    # ── --fix-rat mode: convert existing files to COG + embed RAT, re-upload ─
    # Handles files produced before COG support was added to the pipeline.
    if args.fix_rat:
        tifs = sorted(f for f in OUTPUT_DIR.glob("*.tif") if ".cog_tmp" not in f.name)
        log(f"\n--fix-rat: found {len(tifs)} GeoTIFFs to convert → COG + RAT")
        log(f"  Source dir : {OUTPUT_DIR.resolve()}")
        log("-" * 65)
        fixed = failed_fix = 0
        for tif in tifs:
            # Map filename back to Lenga Maps country name
            safe_name = tif.stem.replace("_LULC", "")
            country = next(
                (c for c in AFRICA_COUNTRIES if r2_safe(c) == safe_name),
                None,
            )
            if country is None:
                log(f"  SKIP: cannot map '{tif.name}' to a country name", indent=1)
                failed_fix += 1
                continue

            log(f"\n  {country}  ({tif.name})")
            try:
                # Patch: write colormap to existing file via temp-copy roundtrip
                # (avoids r+ on a COG which GDAL rejects).
                tmp = tif.with_suffix(".patch_tmp.tif")
                with rasterio.open(tif) as src:
                    meta = src.meta.copy()
                    data = src.read(1)
                with rasterio.open(tmp, "w", **meta) as dst:
                    dst.write(data, 1)
                    dst.write_colormap(1, ESA_COLORMAP)
                _embed_rat(tmp)
                finalize_as_cog(tmp, tif)
                tmp.unlink(missing_ok=True)
            except Exception as exc:
                tmp.unlink(missing_ok=True)
                log(f"    ERROR: patch failed — {exc}", indent=1)
                failed_fix += 1
                continue

            key = build_r2_key(country)
            if not args.dry_run:
                try:
                    r2_upload(tif, key, "image/tiff")
                    log(f"    R2 re-uploaded → {key}", indent=1)
                except Exception as exc:
                    log(f"    ERROR: R2 upload failed — {exc}", indent=1)
                    failed_fix += 1
                    continue
            else:
                log(f"    [dry-run] would re-upload → {key}", indent=1)

            fixed += 1

        log("\n" + "=" * 65)
        log(f"  --fix-rat complete!  Converted+uploaded: {fixed}  Failed: {failed_fix}")
        log("=" * 65)
        return

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
                skip_r2=args.skip_r2,
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
