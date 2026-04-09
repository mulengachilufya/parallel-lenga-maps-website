#!/usr/bin/env python3
"""
Africa DEM Processing Pipeline
================================
Downloads SRTM 1 Arc-Second (30m) tiles for all 54 African countries and
produces per-country GeoTIFFs for:
  - DEM (elevation)
  - Slope (degrees, Horn's method)

Output files: output/DEMs/{Country}_DEM.tif + .zip | {Country}_slope.tif + .zip

Tile source: AWS Open Data terrain tiles (SRTM-derived, no auth required)
  https://s3.amazonaws.com/elevation-tiles-prod/skadi/{DIR}/{TILE}.hgt.gz

Usage:
  python africa_dem_pipeline.py
  python africa_dem_pipeline.py --countries DZ,NG,KE   # specific countries
  python africa_dem_pipeline.py --resume                # skip already-done countries
"""

import os
import sys
import math
import gzip
import struct
import shutil
import zipfile
import argparse
import tempfile
import traceback
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Optional
from zipfile import ZipFile, ZIP_DEFLATED

import io
import requests
import numpy as np

# Force UTF-8 output on Windows so Unicode chars don't crash CP1252 console
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

try:
    import geopandas as gpd
    import rasterio
    import rasterio.windows
    from rasterio.crs import CRS
    from rasterio.transform import from_bounds
    from rasterio.features import rasterize as rio_rasterize
    from shapely.geometry import box as shapely_box, mapping
except ImportError as e:
    sys.exit(f"Missing dependency: {e}\nRun: python -m pip install -r requirements.txt")

# ── Directories ──────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
TILES_DIR   = BASE_DIR / "srtm_tiles"
OUTPUT_DIR  = BASE_DIR / "output" / "DEMs"
BOUNDS_DIR  = BASE_DIR / "boundaries"

for _d in [TILES_DIR, OUTPUT_DIR, BOUNDS_DIR]:
    _d.mkdir(parents=True, exist_ok=True)

# ── SRTM tile source (AWS Open Data — no API key needed) ─────────────────────
SRTM_BASE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi"

# ── Natural Earth 10m country boundaries (public domain) ─────────────────────
NATURAL_EARTH_URL = (
    "https://naciscdn.org/naturalearth/10m/cultural/"
    "ne_10m_admin_0_countries.zip"
)

# ── All 54 African countries by ISO-A2 code ──────────────────────────────────
AFRICA_ISO_A2 = {
    "DZ": "Algeria",        "AO": "Angola",          "BJ": "Benin",
    "BW": "Botswana",       "BF": "Burkina Faso",    "BI": "Burundi",
    "CM": "Cameroon",       "CV": "Cabo Verde",      "CF": "Central African Republic",
    "TD": "Chad",           "KM": "Comoros",         "CG": "Congo",
    "CD": "DR Congo",       "CI": "Côte d'Ivoire",   "DJ": "Djibouti",
    "EG": "Egypt",          "GQ": "Eq. Guinea",      "ER": "Eritrea",
    "SZ": "Eswatini",       "ET": "Ethiopia",        "GA": "Gabon",
    "GM": "Gambia",         "GH": "Ghana",           "GN": "Guinea",
    "GW": "Guinea-Bissau",  "KE": "Kenya",           "LS": "Lesotho",
    "LR": "Liberia",        "LY": "Libya",           "MG": "Madagascar",
    "MW": "Malawi",         "ML": "Mali",            "MR": "Mauritania",
    "MU": "Mauritius",      "MA": "Morocco",         "MZ": "Mozambique",
    "NA": "Namibia",        "NE": "Niger",           "NG": "Nigeria",
    "RW": "Rwanda",         "ST": "São Tomé & Príncipe", "SN": "Senegal",
    "SC": "Seychelles",     "SL": "Sierra Leone",    "SO": "Somalia",
    "ZA": "South Africa",   "SS": "South Sudan",     "SD": "Sudan",
    "TZ": "Tanzania",       "TG": "Togo",            "TN": "Tunisia",
    "UG": "Uganda",         "ZM": "Zambia",          "ZW": "Zimbabwe",
    "RE": "Réunion",
}


# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

def log(msg: str, indent: int = 0):
    ts = datetime.now().strftime("%H:%M:%S")
    prefix = "  " * indent
    print(f"[{ts}] {prefix}{msg}", flush=True)


# ─────────────────────────────────────────────────────────────────────────────
# SRTM tile helpers
# ─────────────────────────────────────────────────────────────────────────────

def tile_stem(lat: int, lon: int) -> str:
    """Return HGT stem for the 1° tile whose lower-left corner is (lat, lon)."""
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"{ns}{abs(lat):02d}{ew}{abs(lon):03d}"


def tile_url(lat: int, lon: int) -> str:
    stem = tile_stem(lat, lon)
    ns   = "N" if lat >= 0 else "S"
    folder = f"{ns}{abs(lat):02d}"
    return f"{SRTM_BASE_URL}/{folder}/{stem}.hgt.gz"


def tiles_for_bbox(minx: float, miny: float, maxx: float, maxy: float) -> List[Tuple[int, int]]:
    """Return all 1° tile lower-left corners that overlap the given bounding box."""
    tiles = []
    for lat in range(math.floor(miny), math.ceil(maxy)):
        for lon in range(math.floor(minx), math.ceil(maxx)):
            tiles.append((lat, lon))
    return tiles


def _wait_for_connection(max_wait: int = 300):
    """
    Block until s3.amazonaws.com is reachable.
    Checks every 10 seconds, gives up after max_wait seconds.
    Returns True if connected, False if timed out.
    """
    import time
    test_url = f"{SRTM_BASE_URL}/N00/N00E006.hgt.gz"
    waited = 0
    while waited < max_wait:
        try:
            r = requests.head(test_url, timeout=5)
            return True
        except Exception:
            if waited == 0:
                log("Network down — waiting for connection to resume...", indent=2)
            time.sleep(10)
            waited += 10
    log(f"WARNING: Network still down after {max_wait}s, continuing anyway.", indent=2)
    return False


def download_tile(lat: int, lon: int, retries: int = 3) -> Optional[Path]:
    """
    Download a gzipped HGT tile from AWS S3, decompress, and cache locally.
    Returns the .hgt path, or None if the tile has no data (ocean/404).

    Caching rules:
      {stem}.hgt       — data tile, already downloaded
      {stem}.tif       — converted GeoTIFF, already done
      {stem}.null      — ocean/no-data marker, skip without HTTP request
    """
    import time
    stem      = tile_stem(lat, lon)
    hgt_path  = TILES_DIR / f"{stem}.hgt"
    null_path = TILES_DIR / f"{stem}.null"

    if hgt_path.exists():
        return hgt_path          # data tile cached
    if null_path.exists():
        return None              # confirmed ocean — no HTTP needed

    gz_path = TILES_DIR / f"{stem}.hgt.gz"
    url     = tile_url(lat, lon)

    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, timeout=30, stream=True)
            if r.status_code == 404:
                null_path.touch()    # cache the "no data" answer
                return None
            r.raise_for_status()

            with open(gz_path, "wb") as fh:
                for chunk in r.iter_content(chunk_size=65536):
                    fh.write(chunk)

            with gzip.open(gz_path, "rb") as gz_in, open(hgt_path, "wb") as hgt_out:
                shutil.copyfileobj(gz_in, hgt_out)

            gz_path.unlink()
            return hgt_path

        except Exception as exc:
            if gz_path.exists():
                gz_path.unlink()
            # If DNS/connection failure, wait for network before retrying
            is_network_err = ("NameResolution" in str(exc) or "getaddrinfo" in str(exc)
                              or "timed out" in str(exc).lower())
            if is_network_err and attempt <= retries:
                _wait_for_connection()
            elif attempt < retries:
                time.sleep(2 ** attempt)
            else:
                log(f"WARNING: Could not download {stem}.hgt.gz after {retries} attempts — {exc}", indent=2)
                return None

    return None


# ─────────────────────────────────────────────────────────────────────────────
# HGT → GeoTIFF conversion
# ─────────────────────────────────────────────────────────────────────────────

def hgt_to_tiff(hgt_path: Path) -> Optional[Path]:
    """
    Convert a binary HGT file to a float32 GeoTIFF in EPSG:4326.
    Tile naming convention: {N|S}{lat:02d}{E|W}{lon:03d}.hgt
    """
    tif_path = hgt_path.with_suffix(".tif")
    if tif_path.exists():
        return tif_path

    stem = hgt_path.stem  # e.g. "N03E012"
    ns   = stem[0]
    lat  = int(stem[1:3]) * (1 if ns == "N" else -1)
    ew   = stem[3]
    lon  = int(stem[4:7]) * (1 if ew == "E" else -1)

    size = hgt_path.stat().st_size
    if size == 3601 * 3601 * 2:
        nrows = ncols = 3601   # SRTM 1 arc-second
    elif size == 1201 * 1201 * 2:
        nrows = ncols = 1201   # SRTM 3 arc-second (fallback)
    else:
        log(f"WARNING: Unexpected HGT size {size} bytes for {hgt_path.name} — skipping", indent=2)
        return None

    # Big-endian signed 16-bit integers
    data = np.frombuffer(hgt_path.read_bytes(), dtype=">i2").astype(np.float32)
    data = data.reshape((nrows, ncols))
    data[data == -32768] = np.nan  # SRTM void marker

    # Georeference: lower-left corner is (lon, lat), tile spans 1°×1°
    transform = from_bounds(lon, lat, lon + 1, lat + 1, ncols, nrows)

    try:
        with rasterio.open(
            tif_path, "w",
            driver="GTiff",
            height=nrows, width=ncols,
            count=1, dtype="float32",
            crs=CRS.from_epsg(4326),
            transform=transform,
            nodata=np.nan,
            compress="lzw",
        ) as dst:
            dst.write(data, 1)
    except Exception as exc:
        tif_path.unlink(missing_ok=True)
        log(f"WARNING: Failed to write {tif_path.name} — {exc}", indent=2)
        return None

    return tif_path


# ─────────────────────────────────────────────────────────────────────────────
# Slope & hillshade — pure NumPy (Horn's method, same as GDAL gdaldem)
# ─────────────────────────────────────────────────────────────────────────────

def compute_slope_array(dem: np.ndarray, res_x: float, res_y: float) -> np.ndarray:
    """
    Compute slope in degrees using Horn's (1981) method.
    res_x, res_y: pixel size in the same units as elevation (metres assumed).
    """
    z = dem.copy()
    z_filled = np.where(np.isnan(z), 0.0, z)

    # 3×3 convolution kernels (Horn 1981)
    # dz/dx: [c,f,i] - [a,d,g]  (right − left columns, weighted)
    # dz/dy: [g,h,i] - [a,b,c]  (bottom − top rows, weighted)
    #
    # Layout:
    #  a b c     [i-1,j-1] [i-1,j] [i-1,j+1]
    #  d e f     [i,  j-1] [i,  j] [i,  j+1]
    #  g h i     [i+1,j-1] [i+1,j] [i+1,j+1]

    a = z_filled[:-2, :-2]; b = z_filled[:-2, 1:-1]; c = z_filled[:-2, 2:]
    d = z_filled[1:-1, :-2];                           f = z_filled[1:-1, 2:]
    g = z_filled[2:, :-2];  h = z_filled[2:, 1:-1];   i = z_filled[2:, 2:]

    dzdx = ((c + 2*f + i) - (a + 2*d + g)) / (8.0 * res_x)
    dzdy = ((g + 2*h + i) - (a + 2*b + c)) / (8.0 * res_y)

    slope_rad = np.arctan(np.sqrt(dzdx**2 + dzdy**2))
    slope_deg = np.degrees(slope_rad)

    # Pad back to original size (edges set to NaN)
    result = np.full_like(dem, np.nan)
    result[1:-1, 1:-1] = slope_deg
    result[np.isnan(dem)] = np.nan
    return result


def compute_hillshade_array(
    dem: np.ndarray,
    res_x: float,
    res_y: float,
    azimuth: float = 315.0,
    altitude: float = 45.0,
    z_factor: float = 2.0,
) -> np.ndarray:
    """
    Compute hillshade (0–255 uint8) using ESRI/GDAL illumination model.
    azimuth:  sun azimuth from north, clockwise (degrees)
    altitude: sun angle above horizon (degrees)
    z_factor: vertical exaggeration
    """
    z = dem.copy()
    z_filled = np.where(np.isnan(z), 0.0, z)

    a = z_filled[:-2, :-2]; b = z_filled[:-2, 1:-1]; c = z_filled[:-2, 2:]
    d = z_filled[1:-1, :-2];                           f = z_filled[1:-1, 2:]
    g = z_filled[2:, :-2];  h = z_filled[2:, 1:-1];   i = z_filled[2:, 2:]

    dzdx = ((c + 2*f + i) - (a + 2*d + g)) / (8.0 * res_x) * z_factor
    dzdy = ((g + 2*h + i) - (a + 2*b + c)) / (8.0 * res_y) * z_factor

    # Sun position
    zenith_rad  = math.radians(90.0 - altitude)
    az_math_rad = math.radians(360.0 - azimuth + 90.0)  # convert to math convention

    slope_rad  = np.arctan(np.sqrt(dzdx**2 + dzdy**2))
    aspect_rad = np.arctan2(dzdy, -dzdx)

    hs = (
        (math.cos(zenith_rad) * np.cos(slope_rad))
        + (math.sin(zenith_rad) * np.sin(slope_rad) * np.cos(az_math_rad - aspect_rad))
    )
    hs = np.clip(hs * 255.0, 0, 255).astype(np.float32)

    result = np.full_like(dem, np.nan)
    result[1:-1, 1:-1] = hs[:]
    result[np.isnan(dem)] = np.nan
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Windowed helpers — never load more than BLOCK_ROWS rows into RAM at once
# ─────────────────────────────────────────────────────────────────────────────

BLOCK_ROWS = 4000  # ~1.2 GB per chunk — fewer I/O passes, much faster


def _tile_meta(tif_paths: List[Path], minx, miny, maxx, maxy):
    """Return (out_transform, out_width, out_height, base_meta) for a mosaic."""
    with rasterio.open(tif_paths[0]) as ref:
        res_x = abs(ref.transform.a)
        res_y = abs(ref.transform.e)
        base_meta = ref.meta.copy()

    # Snap output extent to tile grid, clipped to country bbox
    out_left   = math.floor(minx / res_x) * res_x
    out_bottom = math.floor(miny / res_y) * res_y
    out_right  = math.ceil( maxx / res_x) * res_x
    out_top    = math.ceil( maxy / res_y) * res_y

    out_w = round((out_right  - out_left  ) / res_x)
    out_h = round((out_top    - out_bottom) / res_y)
    out_tf = from_bounds(out_left, out_bottom, out_right, out_top, out_w, out_h)

    # Use BigTIFF for large countries (Algeria mosaic = ~19 GB uncompressed)
    estimated_bytes = out_w * out_h * 4
    bigtiff = "YES" if estimated_bytes > 3_800_000_000 else "NO"

    base_meta.update({
        "driver": "GTiff", "height": out_h, "width": out_w,
        "transform": out_tf, "crs": CRS.from_epsg(4326),
        "compress": "deflate", "predictor": 2, "zlevel": 6,
        "nodata": -9999, "dtype": "int16", "count": 1,
        "tiled": True, "blockxsize": 512, "blockysize": 512,
        "BIGTIFF": bigtiff,
    })
    return out_tf, out_w, out_h, base_meta


def merge_tiles_windowed(tif_paths: List[Path], out_path: Path,
                         minx, miny, maxx, maxy) -> bool:
    """
    Write every tile into the correct position in out_path, one tile at a time.
    Max RAM = 1 tile (~25 MB). Never builds the full mosaic array.
    """
    out_tf, out_w, out_h, meta = _tile_meta(tif_paths, minx, miny, maxx, maxy)

    try:
        with rasterio.open(out_path, "w", **meta) as dst:
            for p in tif_paths:
                with rasterio.open(p) as src:
                    # Skip tiles outside the bbox
                    if (src.bounds.right <= meta["transform"].c or
                            src.bounds.left >= meta["transform"].c + out_w * meta["transform"].a or
                            src.bounds.top  <= meta["transform"].f + out_h * meta["transform"].e or
                            src.bounds.bottom >= meta["transform"].f):
                        continue

                    data = src.read(1).astype(np.float32)
                    # nodata stored as NaN in our TIFs, but guard against legacy values
                    if src.nodata is not None:
                        try:
                            nd = float(src.nodata)
                            if not math.isnan(nd):
                                data[data == nd] = np.nan
                        except (TypeError, ValueError):
                            pass
                    # Convert to Int16: NaN → -9999, clamp to int range
                    data = np.where(np.isnan(data), -9999, np.clip(data, -9999, 32767)).astype(np.int16)

                    # Window of this tile in the output coordinate system
                    win = rasterio.windows.from_bounds(
                        src.bounds.left, src.bounds.bottom,
                        src.bounds.right, src.bounds.top,
                        transform=out_tf,
                    )
                    col0 = max(0, round(win.col_off))
                    row0 = max(0, round(win.row_off))
                    col1 = min(out_w, round(win.col_off + win.width))
                    row1 = min(out_h, round(win.row_off + win.height))
                    w = col1 - col0
                    h = row1 - row0
                    if w <= 0 or h <= 0:
                        continue

                    # Crop data to match possibly-clamped window
                    sc = max(0, -round(win.col_off))
                    sr = max(0, -round(win.row_off))
                    data_crop = data[sr:sr + h, sc:sc + w]
                    dst.write(data_crop[np.newaxis],
                              window=rasterio.windows.Window(col0, row0, w, h))
    except Exception as exc:
        out_path.unlink(missing_ok=True)
        raise exc

    return True


def clip_raster_windowed(src_path: Path, geom, out_path: Path) -> Optional[dict]:
    """
    Apply polygon mask and crop to bbox using BLOCK_ROWS-row chunks.
    Max RAM per chunk ≈ width × BLOCK_ROWS × 4 bytes (~300 MB for Algeria).
    Returns the output meta dict, or None on failure.
    """
    geom_shapes = [mapping(geom)]
    minx, miny, maxx, maxy = geom.bounds

    with rasterio.open(src_path) as src:
        # Crop window from bbox
        crop_win = rasterio.windows.from_bounds(minx, miny, maxx, maxy,
                                                transform=src.transform)
        col0 = max(0, round(crop_win.col_off))
        row0 = max(0, round(crop_win.row_off))
        col1 = min(src.width,  round(crop_win.col_off + crop_win.width))
        row1 = min(src.height, round(crop_win.row_off + crop_win.height))
        crop_w = col1 - col0
        crop_h = row1 - row0
        clip_tf = src.window_transform(rasterio.windows.Window(col0, row0, crop_w, crop_h))

        out_meta = src.meta.copy()
        out_meta.update({
            "height": crop_h, "width": crop_w, "transform": clip_tf,
            "nodata": -9999, "compress": "deflate", "predictor": 2, "zlevel": 6,
            "dtype": "int16",
            "tiled": True, "blockxsize": 512, "blockysize": 512,
            "BIGTIFF": "IF_SAFER",
        })

        try:
            with rasterio.open(out_path, "w", **out_meta) as dst:
                for rs in range(0, crop_h, BLOCK_ROWS):
                    re = min(rs + BLOCK_ROWS, crop_h)
                    n  = re - rs

                    abs_win    = rasterio.windows.Window(col0, row0 + rs, crop_w, n)
                    win_tf     = src.window_transform(abs_win)
                    chunk      = src.read(1, window=abs_win).astype(np.float32)

                    # Rasterize polygon only for this row-strip (fast — small area)
                    mask_chunk = rio_rasterize(
                        geom_shapes,
                        out_shape=(n, crop_w),
                        transform=win_tf,
                        fill=0, default_value=1, dtype="uint8",
                    )
                    chunk[mask_chunk == 0] = -9999
                    chunk = chunk.astype(np.int16)
                    dst.write(chunk[np.newaxis],
                              window=rasterio.windows.Window(0, rs, crop_w, n))
        except Exception as exc:
            out_path.unlink(missing_ok=True)
            raise exc

    return out_meta


def compute_derivative_windowed(
    dem_path: Path,
    out_path: Path,
    mode: str = "slope",      # "slope" | "hillshade"
    azimuth: float = 315.0,
    altitude: float = 45.0,
    z_factor: float = 2.0,
) -> bool:
    """
    Compute slope or hillshade from a DEM file in row-strip chunks.
    Reads 1-row overlap above/below each strip for correct Horn kernel edges.
    Max RAM per chunk ≈ width × (BLOCK_ROWS+2) × 4 bytes.
    """
    with rasterio.open(dem_path) as src:
        H, W   = src.height, src.width
        tf     = src.transform
        meta   = src.meta.copy()
        meta.update({
            "compress": "lzw",
            "dtype": "float32", "nodata": np.nan,
            "tiled": True, "blockxsize": 512, "blockysize": 512,
            "BIGTIFF": "IF_SAFER",
        })

        # Pixel size in metres at centre latitude
        centre_lat = tf.f + (H / 2) * tf.e
        lat_rad    = math.radians(centre_lat)
        res_x      = abs(tf.a) * 111320.0 * math.cos(lat_rad)
        res_y      = abs(tf.e) * 111320.0

        try:
            with rasterio.open(out_path, "w", **meta) as dst:
                for rs in range(0, H, BLOCK_ROWS):
                    re = min(rs + BLOCK_ROWS, H)
                    n  = re - rs

                    # Read with 1-row halo for the 3×3 kernel
                    r_start = max(0, rs - 1)
                    r_end   = min(H, re + 1)
                    win     = rasterio.windows.Window(0, r_start, W, r_end - r_start)
                    block   = src.read(1, window=win).astype(np.float32)

                    if mode == "slope":
                        result = compute_slope_array(block, res_x, res_y)
                    else:
                        result = compute_hillshade_array(
                            block, res_x, res_y, azimuth, altitude, z_factor
                        )

                    # Strip halo rows from result
                    top_pad = rs - r_start  # 0 at top of file, 1 elsewhere
                    result_chunk = result[top_pad: top_pad + n, :]

                    dst.write(result_chunk[np.newaxis],
                              window=rasterio.windows.Window(0, rs, W, n))
        except Exception as exc:
            out_path.unlink(missing_ok=True)
            raise exc

    return True


# ─────────────────────────────────────────────────────────────────────────────
# Per-country processing
# ─────────────────────────────────────────────────────────────────────────────

def process_country(iso: str, geom, country_name: str, resume: bool) -> bool:
    """
    Full pipeline for one country — fully windowed, max RAM ~300 MB at any step.
      download tiles → HGT→TIF → merge (tile-by-tile) → clip (row chunks)
      → DEM → slope (row chunks) → ZIP each separately
    """
    # Sanitize country name for use in filenames (replace spaces, accents, etc.)
    safe_name = country_name.replace(" ", "_").replace("'", "").replace(".", "")
    safe_name = safe_name.replace("&", "and").replace("/", "-")
    # Remove any remaining non-ASCII chars
    safe_name = safe_name.encode("ascii", "ignore").decode("ascii")

    dem_out   = OUTPUT_DIR / f"{safe_name}_DEM.tif"
    slope_out = OUTPUT_DIR / f"{safe_name}_slope.tif"
    dem_zip   = OUTPUT_DIR / f"{safe_name}_DEM.zip"
    slope_zip = OUTPUT_DIR / f"{safe_name}_slope.zip"

    # Also check old ISO-based names for resume compatibility
    old_dem   = OUTPUT_DIR / f"{iso}_DEM.tif"
    old_slope = OUTPUT_DIR / f"{iso}_slope.tif"

    # Rename old files to new naming convention if they exist
    for old, new in [(old_dem, dem_out), (old_slope, slope_out)]:
        if old.exists() and not new.exists() and old != new:
            old.rename(new)
            log(f"Renamed {old.name} -> {new.name}", indent=2)

    # Clean up any leftover hillshade files from earlier runs
    for hs_old in [OUTPUT_DIR / f"{safe_name}_hillshade.tif", OUTPUT_DIR / f"{iso}_hillshade.tif"]:
        if hs_old.exists():
            hs_old.unlink()

    if resume and dem_out.exists() and slope_out.exists() and dem_zip.exists() and slope_zip.exists():
        log(f"SKIP (already done): {country_name} ({iso})", indent=1)
        return True

    log(f"Processing: {country_name} ({iso})", indent=1)
    minx, miny, maxx, maxy = geom.bounds

    # ── 1. Identify tiles ────────────────────────────────────────────────────
    tile_coords = tiles_for_bbox(minx, miny, maxx, maxy)
    log(f"Bounding box: [{minx:.2f}, {miny:.2f}, {maxx:.2f}, {maxy:.2f}]"
        f" -> {len(tile_coords)} candidate tile(s)", indent=2)

    # ── 2. Download & convert tiles (parallel — 8 threads) ────────────────────
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _fetch_tile(coords):
        lat, lon = coords
        hgt = download_tile(lat, lon)
        if hgt is None:
            return None
        return hgt_to_tiff(hgt)

    tif_paths: List[Path] = []
    missing = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_tile, c): c for c in tile_coords}
        for fut in as_completed(futures):
            result = fut.result()
            if result is None:
                missing += 1
            elif result.exists():
                tif_paths.append(result)

    log(f"Tiles: {len(tif_paths)} with data  |  {missing} ocean/missing", indent=2)

    if not tif_paths:
        log(f"SKIP: No elevation tiles for {country_name}", indent=2)
        return False

    if not dem_out.exists():
        # ── 3. Merge: write tiles one-by-one to a temp mosaic on disk ─────────
        tmp_mosaic = OUTPUT_DIR / f"_{safe_name}_mosaic_tmp.tif"
        tmp_mosaic.unlink(missing_ok=True)
        log(f"Merging {len(tif_paths)} tile(s) to disk (windowed)...", indent=2)
        try:
            merge_tiles_windowed(tif_paths, tmp_mosaic, minx, miny, maxx, maxy)
        except Exception as exc:
            log(f"ERROR: Merge failed — {exc}", indent=2)
            return False

        # ── 4. Clip mosaic to country polygon (row chunks, ~300 MB/chunk) ──────
        log("Clipping to country boundary (windowed)...", indent=2)
        try:
            clip_raster_windowed(tmp_mosaic, geom, dem_out)
        except Exception as exc:
            log(f"ERROR: Clip failed — {exc}", indent=2)
            return False
        finally:
            tmp_mosaic.unlink(missing_ok=True)

        log(f"Saved DEM: {dem_out.name}", indent=2)
    else:
        log(f"DEM already exists, skipping merge+clip: {dem_out.name}", indent=2)

    # ── Add country metadata to all outputs ───────────────────────────────────
    def _tag_with_metadata(tif_path: Path, dtype: str):
        """Add country name and dataset info to GeoTIFF description."""
        try:
            with rasterio.open(tif_path, "r+") as dst:
                desc = f"{country_name} ({iso}) — SRTM 1 Arc-Second {dtype}"
                dst.update_tags(ns="IMAGE_STRUCTURE", DESCRIPTION=desc)
        except Exception:
            pass  # non-critical

    # ── 5. Slope ─────────────────────────────────────────────────────────────
    if not slope_out.exists():
        log("Computing slope (windowed)...", indent=2)
        try:
            compute_derivative_windowed(dem_out, slope_out, mode="slope")
        except Exception as exc:
            log(f"ERROR: Slope failed — {exc}", indent=2)
            return False
        log(f"Saved slope: {slope_out.name}", indent=2)
    else:
        log(f"Slope already exists: {slope_out.name}", indent=2)

    # ── 6. Tag metadata ──────────────────────────────────────────────────────
    _tag_with_metadata(dem_out, "DEM (metres)")
    _tag_with_metadata(slope_out, "Slope (degrees)")

    # ── 7. ZIP each file separately (DEFLATE — lossless, no quality loss) ────
    for tif, zpath in [(dem_out, dem_zip), (slope_out, slope_zip)]:
        if not zpath.exists():
            try:
                with ZipFile(zpath, "w", ZIP_DEFLATED, compresslevel=1) as zf:
                    zf.write(tif, arcname=tif.name)
                sz = zpath.stat().st_size / 1e6
                log(f"Zipped: {zpath.name} ({sz:.0f} MB)", indent=2)
            except Exception as exc:
                log(f"WARNING: ZIP failed for {zpath.name} — {exc}", indent=2)

    log(f"COMPLETE: {country_name} ({iso})", indent=1)
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Africa DEM Processing Pipeline")
    parser.add_argument(
        "--countries", default=None,
        help="Comma-separated ISO-A2 codes to process (default: all 54)",
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Skip countries whose 3 output files already exist",
    )
    args = parser.parse_args()

    log("=" * 60)
    log("  Africa DEM Processing Pipeline")
    log("  SRTM 1 Arc-Second (30m) | 54 Countries")
    log("=" * 60)

    # ── Step 1: Install check ────────────────────────────────────────────────
    log("Step 1: Environment verified — all libraries loaded.")

    # ── Step 2: Download Africa country boundaries ───────────────────────────
    log("Step 2: Loading Africa country boundaries (Natural Earth 10m)...")
    bounds_zip = BOUNDS_DIR / "ne_10m_admin_0_countries.zip"
    bounds_dir = BOUNDS_DIR / "ne_10m"

    if not bounds_dir.exists():
        log("  Downloading Natural Earth 10m Admin-0 boundaries...", indent=1)
        r = requests.get(NATURAL_EARTH_URL, timeout=120)
        r.raise_for_status()
        bounds_zip.write_bytes(r.content)
        log(f"  Downloaded {len(r.content) / 1e6:.1f} MB", indent=1)
        bounds_dir.mkdir(exist_ok=True)
        with zipfile.ZipFile(bounds_zip) as zf:
            zf.extractall(bounds_dir)
        log(f"  Extracted to {bounds_dir}", indent=1)
    else:
        log("  Using cached boundaries.", indent=1)

    # Find the .shp file
    shp_files = list(bounds_dir.glob("*.shp"))
    if not shp_files:
        sys.exit("ERROR: No .shp file found in boundaries directory.")
    gdf_world = gpd.read_file(shp_files[0])
    gdf_world = gdf_world.to_crs(epsg=4326)

    # Filter to Africa — handle Natural Earth quirks (some ISO_A2 = "-99")
    africa = gdf_world[gdf_world["ISO_A2"].isin(AFRICA_ISO_A2)].copy()
    log(f"  Matched {len(africa)}/54 countries by ISO_A2.", indent=1)

    # For missing countries try ISO_A2_EH or NAME fallback
    if len(africa) < 54:
        found = set(africa["ISO_A2"].tolist())
        missing_iso = [k for k in AFRICA_ISO_A2 if k not in found]
        # Try ISO_A2_EH column (some releases)
        if "ISO_A2_EH" in gdf_world.columns:
            extra = gdf_world[gdf_world["ISO_A2_EH"].isin(missing_iso)].copy()
            if not extra.empty:
                # Align ISO_A2 column
                extra = extra.copy()
                extra["ISO_A2"] = extra["ISO_A2_EH"]
                africa = gpd.GeoDataFrame(
                    pd.concat([africa, extra], ignore_index=True),
                    crs=africa.crs,
                )
                log(f"  Recovered {len(extra)} country(ies) via ISO_A2_EH.", indent=1)

    log(f"  Total African countries loaded: {len(africa)}", indent=1)

    # ── Step 3: Build SRTM tile index ────────────────────────────────────────
    log("Step 3: Building SRTM tile index for Africa...")
    africa_bbox = africa.total_bounds  # [minx, miny, maxx, maxy]
    all_tiles   = tiles_for_bbox(*africa_bbox)

    log(f"  Africa bounding box : [{africa_bbox[0]:.1f}, {africa_bbox[1]:.1f}, "
        f"{africa_bbox[2]:.1f}, {africa_bbox[3]:.1f}]", indent=1)
    log(f"  Candidate 1° tiles  : {len(all_tiles)}", indent=1)
    log(f"  Tile cache dir      : {TILES_DIR.resolve()}", indent=1)
    log(f"  Output dir          : {OUTPUT_DIR.resolve()}", indent=1)
    log("  Tiles are downloaded on-demand per country and cached for reuse.", indent=1)
    log("  Tile source: AWS Open Data — no API key required.", indent=1)

    # ── Step 4: Process each country ─────────────────────────────────────────
    target_iso = list(AFRICA_ISO_A2.keys())
    if args.countries:
        target_iso = [c.strip().upper() for c in args.countries.split(",")]
        log(f"Processing subset: {target_iso}")

    log(f"\nStep 4: Processing {len(target_iso)} countries...")
    log("-" * 60)

    success = failed = skipped = 0
    for idx, iso in enumerate(target_iso, 1):
        rows = africa[africa["ISO_A2"] == iso]
        cname = AFRICA_ISO_A2.get(iso, iso)

        if rows.empty:
            log(f"[{idx:02d}/{len(target_iso)}] {cname} ({iso}) — not found in boundaries, skipping.")
            skipped += 1
            continue

        divider = "-" * 45
        log(f"\n[{idx:02d}/{len(target_iso)}] {divider}")
        try:
            # Dissolve in case of multipart geometries
            geom = rows.geometry.union_all()
            ok = process_country(iso, geom, cname, resume=args.resume)
            if ok:
                success += 1
            else:
                skipped += 1
        except Exception:
            log(f"ERROR processing {cname} ({iso}):\n{traceback.format_exc()}", indent=2)
            failed += 1

    # ── Summary ──────────────────────────────────────────────────────────────
    log("\n" + "=" * 60)
    log("  Pipeline complete!")
    log(f"  Success : {success}")
    log(f"  Skipped : {skipped}")
    log(f"  Failed  : {failed}")
    tifs = list(OUTPUT_DIR.glob("*.tif"))
    log(f"  Output files: {len(tifs)} GeoTIFFs in {OUTPUT_DIR.resolve()}")
    dems       = [f for f in tifs if f.name.endswith("_DEM.tif")]
    slopes     = [f for f in tifs if f.name.endswith("_slope.tif")]
    hillshades = [f for f in tifs if f.name.endswith("_hillshade.tif")]
    log(f"    DEMs: {len(dems)}  |  Slopes: {len(slopes)}  |  Hillshades: {len(hillshades)}")
    log("=" * 60)


if __name__ == "__main__":
    import pandas as pd   # ensure available for concat fallback above
    main()
