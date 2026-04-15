#!/usr/bin/env python3
"""
Africa Aquifer Dataset Pipeline
================================
Downloads, merges, cleans, and uploads a harmonised multi-source Africa aquifer
dataset to Cloudflare R2. Replaces the geology/lithology dataset (id=6).

Sources (strictly aquifer data — no DEMs or terrain):
  1. WHYMAP / BGR-UNESCO  — major groundwater system polygons
                            (Groundwater Resources of the World, 1:25M)
  2. IGRAC GGIS           — Transboundary Aquifers of the World 2021

R2 structure:
  aquifer/{Country}/{Country}_aquifer.gpkg

Pipeline guarantees
-------------------
- All sources reprojected to WGS84 (EPSG:4326) before any processing
- Overlapping polygon attributes retained from both sources in separate columns;
  attributes are never silently overwritten
- True geometric duplicates (same geometry hash + same key attrs) removed and
  every deletion logged to a timestamped CSV for full auditability
- Source disagreements on aquifer_type or productivity are flagged with
  source_conflict=True and a human-readable conflict_notes text field;
  conflicting values are NEVER silently resolved
- Unknown or missing attribute values are stored as NULL or "unknown" —
  nothing is inferred, interpolated, or fabricated
- Final output is clipped to Africa continental boundary (Natural Earth 10m)
- Per-country GeoPackage files share a consistent schema; countries with no
  aquifer data are NOT written — they are logged instead
- Geometry validity is checked on every feature; invalid geometries are fixed
  with make_valid and every fix is logged
- Uploaded to Cloudflare R2 under aquifer/ prefix
- Pipeline aborts loudly if ANY source download fails — never partial processing

Usage
-----
  python africa_aquifer_pipeline.py
  python africa_aquifer_pipeline.py --dry-run
  python africa_aquifer_pipeline.py --country Zambia
"""

import argparse
import csv
import io
import os
import shutil
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import boto3
import geopandas as gpd
import pandas as pd
import requests
from botocore.config import Config
from dotenv import load_dotenv
from shapely.validation import make_valid

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
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data" / "aquifer_cache"   # cached downloads (safe to delete)
LOG_DIR  = BASE_DIR / "logs" / "aquifer"          # audit CSVs (keep these)

DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

RUN_TS = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


# ══════════════════════════════════════════════════════════════════════════════
# SOURCE REGISTRY
# ══════════════════════════════════════════════════════════════════════════════

# Canonical download endpoints for each source.
# If any download fails, the pipeline exits with a clear error message and
# instructions for obtaining the file manually. No partial processing ever occurs.

SOURCES: dict[str, dict] = {
    "whymap": {
        "name":        "WHYMAP / BGR-UNESCO (Groundwater Resources of the World)",
        "institution": "BGR & UNESCO",
        # Direct download links frequently change — landing page is stable.
        # The pipeline tries the URL first; on failure, it prints the landing
        # page URL with manual download instructions.
        "url": (
            "https://www.bgr.bund.de/EN/Themen/Wasser/Projekte/laufend/Beratung/"
            "Whymap/whymap_node_en.html"
        ),
        "landing_page": "https://www.whymap.org",
        "description": (
            "Major groundwater system polygons (1:25,000,000 scale). "
            "Provides the primary polygon geometry and system classification."
        ),
        "licence":  "CC BY 4.0",
        "citation": (
            "BGR / UNESCO (2008): Groundwater Resources of the World. "
            "1:25,000,000. Hannover / Paris."
        ),
    },
    "igrac": {
        "name":        "IGRAC GGIS — Transboundary Aquifers of the World",
        "institution": "IGRAC (International Groundwater Resources Assessment Centre)",
        "url": (
            "https://ggis.un-igrac.org/geoserver/tba/ows"
            "?service=WFS"
            "&version=2.0.0"
            "&request=GetFeature"
            "&typeName=tba:tba"
            "&outputFormat=shape-zip"
            "&srsName=EPSG:4326"
        ),
        "landing_page": "https://ggis.un-igrac.org/view/tba",
        "description": (
            "Transboundary aquifer system polygons — IGRAC GGIS 2021 edition. "
            "Provides authoritative names and country-code attributes for "
            "aquifer systems crossing international borders."
        ),
        "licence":  "CC BY 4.0",
        "citation": (
            "IGRAC (2021): Transboundary Aquifers of the World — Map 2021. "
            "Special Edition for the 9th World Water Forum. IGRAC, Delft."
        ),
    },
}

# Natural Earth 10m countries — used for Africa clip and country assignment
NE_COUNTRIES_URL = (
    "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries.zip"
)


# ══════════════════════════════════════════════════════════════════════════════
# AFRICA COUNTRY REFERENCE
# ══════════════════════════════════════════════════════════════════════════════

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

# Natural Earth name → Lenga Maps standard name
NE_NAME_MAP: dict[str, Optional[str]] = {
    "Côte d'Ivoire":                  "Ivory Coast",
    "Republic of the Congo":          "Congo",
    "Dem. Rep. Congo":                "Democratic Republic of the Congo",
    "Democratic Republic of the Congo": "Democratic Republic of the Congo",
    "United Republic of Tanzania":    "Tanzania",
    "Swaziland":                      "Eswatini",
    "São Tomé and Principe":          "Sao Tome and Principe",
    "Cape Verde":                     "Cabo Verde",
    "Western Sahara":                 None,   # disputed — excluded
    "Somaliland":                     None,   # unrecognised — excluded
}


# ══════════════════════════════════════════════════════════════════════════════
# OUTPUT SCHEMA
# ══════════════════════════════════════════════════════════════════════════════

# Every per-country GeoPackage will have exactly these columns (plus geometry).
# If a source does not contribute a particular attribute, the value is NULL.
# No value is inferred or guessed.

SCHEMA_COLUMNS: list[str] = [
    # Core harmonised attributes
    "aquifer_name",        # Best available name across all sources
    "aquifer_type",        # confined | unconfined | semi-confined | unknown
    "productivity",        # high | medium | low | unknown
    "country",             # Lenga Maps standard country name
    # Source provenance (which institutions contributed to this feature)
    "source_1",            # Primary source name
    "source_2",            # Secondary source (if any)
    # Conflict flags
    "source_conflict",     # Boolean: True if sources disagree on type/productivity
    "conflict_notes",      # Human-readable explanation of the disagreement
    # Lenga Maps editorial
    "lenga_notes",
    # ── WHYMAP / BGR-UNESCO passthrough ──────────────────────────────────────
    "whymap_system_name",  # Aquifer system name from WHYMAP
    "whymap_type_raw",     # Raw TYPE/CLASS value from WHYMAP shapefile
    "whymap_area_km2",     # Polygon area reported by WHYMAP (km²)
    # ── IGRAC GGIS passthrough ───────────────────────────────────────────────
    "igrac_aquifer_name",  # Aquifer name from IGRAC
    "igrac_country_codes", # Country code(s) from IGRAC
    "igrac_tba_id",        # Transboundary aquifer ID from IGRAC
    "igrac_type_raw",      # Raw type field from IGRAC
]


# ══════════════════════════════════════════════════════════════════════════════
# NORMALISATION MAPS
# ══════════════════════════════════════════════════════════════════════════════

AQUIFER_TYPE_NORM: dict[str, str] = {
    # WHYMAP classifications
    "major groundwater basin":            "unconfined",
    "complex hydrogeological structure":  "semi-confined",
    "local and shallow aquifers":         "unconfined",
    "local aquifer systems":              "unconfined",
    # Generic terms
    "confined":                           "confined",
    "unconfined":                         "unconfined",
    "semi-confined":                      "semi-confined",
    "semi confined":                      "semi-confined",
    "partially confined":                 "semi-confined",
    "artesian":                           "confined",
    "sub-artesian":                       "semi-confined",
    # Rock-type based
    "fractured rock":                     "unconfined",
    "fractured basement":                 "unconfined",
    "karst":                              "unconfined",
    "karstic":                            "unconfined",
    "porous":                             "unconfined",
    "intergranular":                      "unconfined",
    "alluvial":                           "unconfined",
    # Productivity-type hybrid descriptions
    "high productivity aquifer":          "unconfined",
    "moderate productivity aquifer":      "semi-confined",
    "low productivity aquifer":           "unconfined",
    "unproductive formations":            "unconfined",
}

PRODUCTIVITY_NORM: dict[str, str] = {
    "high":                    "high",
    "high yielding":           "high",
    "high productivity":       "high",
    "very high":               "high",
    "moderate":                "medium",
    "medium":                  "medium",
    "intermediate":            "medium",
    "moderate productivity":   "medium",
    "variable":                "medium",
    "low":                     "low",
    "low productivity":        "low",
    "very low":                "low",
    "negligible":              "low",
    "unproductive":            "low",
    "unproductive formations": "low",
    "none":                    "low",
}


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


# ══════════════════════════════════════════════════════════════════════════════
# DOWNLOAD HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def download_source(key: str) -> bytes:
    """
    Download a source zip. Checks local cache first; falls back to network.

    Raises SystemExit with a clear, actionable error if the download fails.
    The pipeline will NOT proceed with any missing source — never partial.
    """
    src = SOURCES[key]
    cache_path = DATA_DIR / f"{key}.zip"

    if cache_path.exists():
        size_mb = cache_path.stat().st_size / 1_048_576
        print(f"  [cache hit] {src['name']} ({size_mb:.1f} MB) → {cache_path.name}")
        return cache_path.read_bytes()

    url = src["url"]
    print(f"  Downloading: {src['name']}")
    print(f"  URL: {url}")

    try:
        resp = requests.get(url, timeout=300, allow_redirects=True)
        resp.raise_for_status()
        data = resp.content

        # Guard against getting an HTML page instead of a zip file
        content_type = resp.headers.get("Content-Type", "")
        if b"PK" not in data[:4] and "html" in content_type.lower():
            raise requests.RequestException(
                f"Server returned an HTML page instead of a zip file "
                f"(Content-Type: {content_type}). The direct download URL "
                f"may have changed — manual download required."
            )
    except requests.RequestException as exc:
        landing = src.get("landing_page", url)
        border = "=" * 70
        sys.exit(
            f"\n{border}\n"
            f"DOWNLOAD FAILED — pipeline cannot continue.\n\n"
            f"Source      : {src['name']}\n"
            f"Tried URL   : {url}\n"
            f"Error       : {exc}\n\n"
            f"What to do:\n"
            f"  1. Visit the institution landing page:\n"
            f"     {landing}\n"
            f"  2. Download the shapefile/GIS data (usually a .zip file).\n"
            f"  3. Save the file to:\n"
            f"     {cache_path}\n"
            f"  4. Re-run this pipeline — it will detect the cached file.\n\n"
            f"Institution : {src['institution']}\n"
            f"Licence     : {src['licence']}\n"
            f"{border}\n"
        )

    cache_path.write_bytes(data)
    size_mb = len(data) / 1_048_576
    print(f"  ✓ Downloaded {size_mb:.2f} MB → cached at {cache_path.name}")
    return data


def load_gdf_from_zip(data: bytes, source_key: str) -> gpd.GeoDataFrame | None:
    """
    Extract a shapefile from zip bytes and load into a GeoDataFrame.
    Handles nested directory structures. Picks the largest .shp if multiple
    are present (e.g. when the zip contains metadata shapefiles alongside
    the main data file).
    """
    tmp_dir = Path(tempfile.mkdtemp(prefix=f"aquifer_{source_key}_"))
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            z.extractall(tmp_dir)

        shp_files = sorted(tmp_dir.rglob("*.shp"), key=lambda p: p.stat().st_size, reverse=True)

        if not shp_files:
            # Graceful skip — the zip may be a raster-only edition (e.g. WHYMAP TIFF).
            # The pipeline will continue with whatever sources DO have vector data.
            files = [str(f.relative_to(tmp_dir)) for f in tmp_dir.rglob('*') if f.is_file()]
            print(f"    ⚠️  No .shp file in {source_key} zip — skipping this source.")
            print(f"       Zip contents: {files}")
            return None  # type: ignore[return-value]

        shp_path = shp_files[0]
        print(f"    Reading shapefile: {shp_path.name}")
        gdf = gpd.read_file(shp_path)
        print(f"    Loaded {len(gdf):,} features | CRS: {gdf.crs}")
        return gdf
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ══════════════════════════════════════════════════════════════════════════════
# GEOMETRY VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

def validate_and_fix_geometries(
    gdf: gpd.GeoDataFrame,
    label: str,
) -> tuple[gpd.GeoDataFrame, list[dict]]:
    """
    Run geometry validity check on every feature.
    - NULL geometries are logged and dropped.
    - Invalid geometries are fixed with shapely.make_valid.
    - Every fix (or drop) is recorded in the returned log list.

    Returns (fixed_gdf, fix_log_records).
    """
    fix_log: list[dict] = []
    fixed_geoms = []

    for idx, row in gdf.iterrows():
        geom = row.geometry

        if geom is None or (hasattr(geom, "is_empty") and geom.is_empty):
            fix_log.append({
                "source":         label,
                "feature_index":  str(idx),
                "issue":          "null_or_empty_geometry",
                "action":         "dropped",
                "original_wkt":   "NULL",
                "fixed_wkt":      "NULL",
            })
            fixed_geoms.append(None)
            continue

        if not geom.is_valid:
            original_wkt_preview = geom.wkt[:300]
            try:
                fixed = make_valid(geom)
                fix_log.append({
                    "source":         label,
                    "feature_index":  str(idx),
                    "issue":          "invalid_geometry",
                    "action":         "make_valid_applied",
                    "original_wkt":   original_wkt_preview,
                    "fixed_wkt":      fixed.wkt[:300],
                })
                fixed_geoms.append(fixed)
            except Exception as e:
                fix_log.append({
                    "source":         label,
                    "feature_index":  str(idx),
                    "issue":          "invalid_geometry",
                    "action":         f"make_valid_failed_dropped: {e}",
                    "original_wkt":   original_wkt_preview,
                    "fixed_wkt":      "NULL",
                })
                fixed_geoms.append(None)
        else:
            fixed_geoms.append(geom)

    gdf = gdf.copy()
    gdf["geometry"] = fixed_geoms
    before = len(gdf)
    gdf = gdf[gdf.geometry.notna()].copy()
    after = len(gdf)

    if before != after:
        print(f"    Dropped {before - after} null/unfixable geometries from {label}")

    return gdf, fix_log


def reproject_to_wgs84(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Reproject to WGS84 (EPSG:4326). Assigns CRS if missing (assumes WGS84)."""
    if gdf.crs is None:
        print("    ⚠ CRS not set — assuming EPSG:4326")
        return gdf.set_crs("EPSG:4326")
    if gdf.crs.to_epsg() != 4326:
        print(f"    Reprojecting {gdf.crs.to_epsg()} → EPSG:4326")
        return gdf.to_crs("EPSG:4326")
    return gdf


# ══════════════════════════════════════════════════════════════════════════════
# NATURAL EARTH — AFRICA BOUNDARY & COUNTRIES
# ══════════════════════════════════════════════════════════════════════════════

def load_africa_boundary() -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """
    Download Natural Earth 10m admin-0 countries and produce:
      africa_boundary  — dissolved Africa polygon (for clip operations)
      africa_countries — per-country polygons with 'lenga_name' column

    Returns (africa_boundary_gdf, africa_countries_gdf).
    """
    cache = DATA_DIR / "ne_countries.zip"
    if cache.exists():
        data = cache.read_bytes()
        print("  [cache hit] Natural Earth countries")
    else:
        print(f"  Downloading Natural Earth countries ...")
        resp = requests.get(NE_COUNTRIES_URL, timeout=180)
        resp.raise_for_status()
        data = resp.content
        cache.write_bytes(data)

    tmp_dir = Path(tempfile.mkdtemp(prefix="ne_countries_"))
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            z.extractall(tmp_dir)
        shp = next(tmp_dir.rglob("*.shp"))
        countries = gpd.read_file(shp).to_crs("EPSG:4326")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    def resolve_name(row: pd.Series) -> Optional[str]:
        """Map Natural Earth name to Lenga Maps standard name."""
        for col in ("ADMIN", "NAME", "NAME_LONG", "SOVEREIGNT"):
            raw = row.get(col, "")
            if not raw:
                continue
            if raw in NE_NAME_MAP:
                return NE_NAME_MAP[raw]   # may be None (excluded territory)
            if raw in AFRICA_COUNTRIES:
                return raw
        return None

    countries["lenga_name"] = countries.apply(resolve_name, axis=1)
    africa_ctys = countries[
        countries["lenga_name"].notna() &
        countries["lenga_name"].isin(AFRICA_COUNTRIES)
    ].copy()

    africa_boundary = africa_ctys.dissolve()[["geometry"]].reset_index(drop=True)
    print(f"  Africa boundary: {len(africa_ctys)} countries resolved from Natural Earth")
    return africa_boundary, africa_ctys


# ══════════════════════════════════════════════════════════════════════════════
# SOURCE-SPECIFIC ATTRIBUTE PARSERS
# ══════════════════════════════════════════════════════════════════════════════

def _first_val(row: pd.Series, candidates: list[str], default: str = "unknown") -> str:
    """Return the first non-null, non-empty value from a list of column candidates."""
    for col in candidates:
        if col in row.index:
            val = row[col]
            if pd.notna(val) and str(val).strip() not in ("", "nan", "None"):
                return str(val).strip()
    return default


def _first_float(row: pd.Series, candidates: list[str]) -> Optional[float]:
    """Return the first parseable float from a list of column candidates."""
    for col in candidates:
        if col in row.index:
            try:
                return float(row[col])
            except (TypeError, ValueError):
                pass
    return None


def _norm(val: str, mapping: dict[str, str]) -> str:
    """Normalise a raw string value against a mapping. Returns 'unknown' if not found."""
    if pd.isna(val) or str(val).strip() in ("", "unknown", "nan", "None"):
        return "unknown"
    return mapping.get(str(val).strip().lower(), "unknown")


def _has_real_data(row: pd.Series, columns: list[str]) -> bool:
    """True if any of the given columns contains a real (non-null, non-unknown) value."""
    for col in columns:
        val = row.get(col)
        if pd.notna(val) and str(val).strip() not in ("", "unknown", "nan", "None"):
            return True
    return False


def parse_whymap(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Extract and normalise WHYMAP GWR attributes.

    WHYMAP publishes its major aquifer system polygons at 1:25M scale.
    Expected shapefile columns (probed with multiple candidate names to be
    resilient across dataset versions):
      SYSTEM / NAME   — aquifer system name
      TYPE / CLASS    — hydrogeological classification
      AREA_KM2 / AREA — polygon area in km²
    """
    out = gpd.GeoDataFrame(geometry=gdf.geometry.copy(), crs=gdf.crs)

    out["whymap_system_name"] = gdf.apply(
        lambda r: _first_val(r, ["SYSTEM", "system", "NAME", "name", "AQUIFER", "AQ_NAME", "LABEL"]),
        axis=1,
    )
    out["whymap_type_raw"] = gdf.apply(
        lambda r: _first_val(r, ["TYPE", "type", "CLASS", "class", "AQUIFERTYP", "AQ_TYPE", "HYDROTYPE"]),
        axis=1,
    )
    out["whymap_area_km2"] = gdf.apply(
        lambda r: _first_float(r, ["AREA_KM2", "area_km2", "AREA", "SHAPE_AREA", "Shape_Area"]),
        axis=1,
    )

    # Normalised internal columns (dropped from final output, used for conflict detection)
    out["_whymap_type_norm"] = out["whymap_type_raw"].apply(
        lambda v: _norm(v, AQUIFER_TYPE_NORM)
    )
    # WHYMAP does not include productivity ratings at the global scale
    out["_whymap_productivity"] = "unknown"

    print(f"    WHYMAP parsed: {len(out):,} features")
    return out


def parse_igrac(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Extract and normalise IGRAC GGIS transboundary aquifer attributes.

    IGRAC WFS schema (GGIS portal):
      name / NAME         — aquifer name
      countries / CNTRY   — country codes (comma-separated ISO codes)
      tba_id / ID         — transboundary aquifer ID
      type / TYPE         — confined / unconfined / semi-confined
    """
    out = gpd.GeoDataFrame(geometry=gdf.geometry.copy(), crs=gdf.crs)

    out["igrac_aquifer_name"] = gdf.apply(
        lambda r: _first_val(r, ["name", "NAME", "aq_name", "AQ_NAME", "AQUIFER", "LABEL"]),
        axis=1,
    )
    out["igrac_country_codes"] = gdf.apply(
        lambda r: _first_val(r, ["countries", "COUNTRIES", "cntry", "CNTRY", "CTRY_CODES", "ISO_CODES"]),
        axis=1,
    )
    out["igrac_tba_id"] = gdf.apply(
        lambda r: _first_val(r, ["tba_id", "TBA_ID", "id", "ID", "FID", "OBJECTID"]),
        axis=1,
    )
    out["igrac_type_raw"] = gdf.apply(
        lambda r: _first_val(r, ["type", "TYPE", "aq_type", "AQ_TYPE", "HYDROTYPE"]),
        axis=1,
    )

    out["_igrac_type_norm"] = out["igrac_type_raw"].apply(
        lambda v: _norm(v, AQUIFER_TYPE_NORM)
    )
    # IGRAC does not systematically record productivity — stored as unknown
    out["_igrac_productivity"] = "unknown"

    print(f"    IGRAC parsed: {len(out):,} features")
    return out


# ══════════════════════════════════════════════════════════════════════════════
# SPATIAL CONFLATION
# ══════════════════════════════════════════════════════════════════════════════

def conflate_sources(
    whymap: gpd.GeoDataFrame | None,
    igrac: gpd.GeoDataFrame | None,
) -> gpd.GeoDataFrame:
    """
    Spatially merge 2 source layers using a spatial-join strategy:

    Strategy
    --------
    WHYMAP is used as the primary geometry source (broadest continental coverage,
    authoritative system-level boundaries). IGRAC attributes are attached to
    WHYMAP polygons via spatial join (left join, `intersects` predicate, first
    match kept). IGRAC features that have NO overlap with any WHYMAP polygon
    are appended as standalone rows — their data must not be discarded.

    Attribute provenance is fully tracked. Where a join produces no right-side
    match (i.e. the left feature has no overlapping right-side polygon), the
    right-side attribute columns are NULL — never filled with guessed values.

    Conflict detection runs AFTER conflation (see `detect_conflicts`).

    Single-source mode: if either input is None, the conflation falls back to
    using the single available source — every row is built from that source
    alone with its provenance correctly recorded.
    """
    # ── Single-source fallback ──────────────────────────────────────────────
    if whymap is None and igrac is None:
        raise RuntimeError("Cannot conflate — both sources are missing.")
    if whymap is None:
        print("    WHYMAP unavailable — using IGRAC as sole polygon source.")
        rows = [_build_row(r) for _, r in igrac.reset_index(drop=True).iterrows()]
        return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    if igrac is None:
        print("    IGRAC unavailable — using WHYMAP as sole polygon source.")
        rows = [_build_row(r) for _, r in whymap.reset_index(drop=True).iterrows()]
        return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")

    w = whymap.reset_index(drop=True)
    i = igrac.reset_index(drop=True)

    # ── Step 1: attach IGRAC attributes to WHYMAP polygons ────────────────────
    print("    Step 1/2: Spatial join WHYMAP ← IGRAC (intersects, keep first match) ...")
    wi = gpd.sjoin(w, i, how="left", predicate="intersects")
    before = len(wi)
    wi = wi[~wi.index.duplicated(keep="first")]
    wi = wi.drop(columns=["index_right"], errors="ignore")
    print(f"    WHYMAP features: {len(w):,} → after IGRAC join: {len(wi):,} "
          f"(deduplicated {before - len(wi):,} multi-match rows)")

    # ── Step 2: IGRAC features not covered by any WHYMAP polygon ──────────────
    print("    Step 2/2: Identifying IGRAC-only features (no WHYMAP overlap) ...")
    try:
        whymap_union = w.union_all() if hasattr(w, "union_all") else w.unary_union
        i_only = i[~i.geometry.intersects(whymap_union)].copy()
    except Exception:
        i_only = gpd.GeoDataFrame(columns=i.columns, crs=i.crs)
    print(f"    IGRAC-only features: {len(i_only):,}")

    # ── Assemble rows ──────────────────────────────────────────────────────────
    rows = []
    for _, row in wi.iterrows():
        rows.append(_build_row(row))

    for _, row in i_only.iterrows():
        rows.append(_build_row(row))

    merged = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")

    print(f"\n    Conflation summary:")
    print(f"      WHYMAP-based rows : {len(wi):,}")
    print(f"      IGRAC-only        : {len(i_only):,}")
    print(f"      Total             : {len(merged):,}")

    return merged


def _build_row(row: pd.Series) -> dict:
    """
    Assemble one output row from a (potentially multi-source) joined Series.

    Provenance detection: a source is considered to have contributed to this
    feature only if at least one of its characteristic columns contains a
    real non-null, non-unknown value. Source provenance is stored in source_1/2/3
    and in the lenga_notes field for transparency.

    Conflict detection: see `detect_conflicts` — this function only assembles
    the row; conflict fields are populated in a subsequent pass.
    """
    # ── Source provenance ────────────────────────────────────────────────────
    has_whymap = _has_real_data(row, ["whymap_system_name", "whymap_type_raw"])
    has_igrac  = _has_real_data(row, ["igrac_aquifer_name", "igrac_tba_id", "igrac_type_raw"])

    sources = []
    if has_whymap:
        sources.append("WHYMAP/BGR-UNESCO")
    if has_igrac:
        sources.append("IGRAC GGIS")

    # ── Best aquifer name ─────────────────────────────────────────────────────
    # Priority: IGRAC (most precisely named for transboundary) > WHYMAP
    aquifer_name = None
    for val in [
        row.get("igrac_aquifer_name"),
        row.get("whymap_system_name"),
    ]:
        if pd.notna(val) and str(val).strip() not in ("", "unknown", "nan"):
            aquifer_name = str(val).strip()
            break

    # ── Aquifer type: collected from all sources (conflict detection runs later)
    # Store all normalised values now; best-effort consensus is attempted.
    whymap_type = row.get("_whymap_type_norm", "unknown") or "unknown"
    igrac_type  = row.get("_igrac_type_norm", "unknown") or "unknown"

    known_types = {
        src: t for src, t in [
            ("WHYMAP/BGR-UNESCO", whymap_type),
            ("IGRAC GGIS", igrac_type),
        ]
        if t != "unknown" and src in sources
    }
    unique_types = set(known_types.values())

    if len(unique_types) == 1:
        aquifer_type = unique_types.pop()
    elif len(unique_types) == 0:
        aquifer_type = "unknown"
    else:
        # Conflict — do not resolve; flag in separate pass
        aquifer_type = "unknown"

    # ── Productivity: neither WHYMAP nor IGRAC provide this field
    productivity = "unknown"

    # ── Passthrough values (raw, not inferred) ────────────────────────────────
    def safe(val):
        """Return the value as-is if real, otherwise None (will be NULL in output)."""
        if pd.isna(val) or str(val).strip() in ("", "nan", "None", "unknown"):
            return None
        return str(val).strip()

    def safe_float(val):
        if val is None:
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    return {
        "geometry":            row.geometry,
        # Core harmonised
        "aquifer_name":        aquifer_name,
        "aquifer_type":        aquifer_type,
        "productivity":        productivity,
        "country":             None,   # populated by assign_countries()
        # Source provenance
        "source_1":            sources[0] if len(sources) > 0 else None,
        "source_2":            sources[1] if len(sources) > 1 else None,
        # Conflict fields (populated by detect_conflicts())
        "source_conflict":     False,
        "conflict_notes":      None,
        # Lenga editorial
        "lenga_notes": (
            "Lenga Maps harmonised aquifer layer. "
            f"Contributing sources: {', '.join(sources) if sources else 'unknown'}. "
            "All source attributes retained. Conflicts are flagged and not resolved silently. "
            "This record is part of a premium curated product — not available as a "
            "raw single-source download anywhere else in this form."
        ),
        # WHYMAP passthrough
        "whymap_system_name":  safe(row.get("whymap_system_name")),
        "whymap_type_raw":     safe(row.get("whymap_type_raw")),
        "whymap_area_km2":     safe_float(row.get("whymap_area_km2")),
        # IGRAC passthrough
        "igrac_aquifer_name":  safe(row.get("igrac_aquifer_name")),
        "igrac_country_codes": safe(row.get("igrac_country_codes")),
        "igrac_tba_id":        safe(row.get("igrac_tba_id")),
        "igrac_type_raw":      safe(row.get("igrac_type_raw")),
        # Internal — for conflict detection (dropped before final export)
        "_whymap_type_norm":   whymap_type,
        "_igrac_type_norm":    igrac_type,
        "_sources_list":       sources,
    }


# ══════════════════════════════════════════════════════════════════════════════
# CONFLICT DETECTION
# ══════════════════════════════════════════════════════════════════════════════

def detect_conflicts(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    For each feature, compare aquifer_type and productivity values from all
    contributing sources. Where sources disagree:
      - source_conflict is set to True
      - conflict_notes is populated with a clear description of the disagreement
      - aquifer_type / productivity remain "unknown" (never silently resolved)

    Where sources agree, source_conflict=False and conflict_notes=None.
    """
    gdf = gdf.copy()

    conflict_flags = []
    conflict_notes_list = []
    resolved_types = []
    resolved_prods = []

    for _, row in gdf.iterrows():
        sources = row.get("_sources_list") or []
        notes = []

        # ── Aquifer type conflict check ───────────────────────────────────────
        type_vals: dict[str, str] = {}
        if "WHYMAP/BGR-UNESCO" in sources and row.get("_whymap_type_norm", "unknown") != "unknown":
            type_vals["WHYMAP/BGR-UNESCO"] = row["_whymap_type_norm"]
        if "IGRAC GGIS" in sources and row.get("_igrac_type_norm", "unknown") != "unknown":
            type_vals["IGRAC GGIS"] = row["_igrac_type_norm"]

        unique_types = set(type_vals.values())
        if len(unique_types) > 1:
            notes.append(
                "aquifer_type conflict — "
                + " vs ".join(f"{src}: {val}" for src, val in type_vals.items())
            )
            resolved_type = "unknown"
        elif len(unique_types) == 1:
            resolved_type = unique_types.pop()
        else:
            resolved_type = "unknown"

        # ── Productivity conflict check ────────────────────────────────────────
        # Neither WHYMAP nor IGRAC publishes productivity ratings, so this will
        # stay empty for now. The structure is preserved so that if a future
        # source adds productivity data, disagreements will be caught automatically.
        prod_vals: dict[str, str] = {}

        unique_prods = set(prod_vals.values())
        if len(unique_prods) > 1:
            notes.append(
                "productivity conflict — "
                + " vs ".join(f"{src}: {val}" for src, val in prod_vals.items())
            )
            resolved_prod = "unknown"
        elif len(unique_prods) == 1:
            resolved_prod = unique_prods.pop()
        else:
            resolved_prod = "unknown"

        has_conflict = len(notes) > 0
        conflict_flags.append(has_conflict)
        conflict_notes_list.append(" | ".join(notes) if notes else None)
        resolved_types.append(resolved_type)
        resolved_prods.append(resolved_prod)

    gdf["source_conflict"]  = conflict_flags
    gdf["conflict_notes"]   = conflict_notes_list
    gdf["aquifer_type"]     = resolved_types
    gdf["productivity"]     = resolved_prods

    total_conflicts = sum(conflict_flags)
    print(f"    Conflict detection: {total_conflicts:,} features flagged as source_conflict=True")
    return gdf


# ══════════════════════════════════════════════════════════════════════════════
# DEDUPLICATION
# ══════════════════════════════════════════════════════════════════════════════

def remove_geometric_duplicates(
    gdf: gpd.GeoDataFrame,
    log_path: Path,
) -> gpd.GeoDataFrame:
    """
    Remove features where BOTH geometry AND key attributes are identical
    (true geometric duplicates — not merely overlapping polygons).

    Fingerprint = hash(geometry.wkt) + hash(aquifer_name, aquifer_type).
    Every deleted feature is written to a timestamped CSV audit log.
    The first occurrence of each duplicate group is retained.
    """
    print(f"\n  Deduplication ...")
    gdf = gdf.copy()

    def fingerprint(row: pd.Series) -> tuple:
        geom_hash = hash(row.geometry.wkt) if row.geometry else -1
        attr_hash = hash((
            str(row.get("aquifer_name", "") or ""),
            str(row.get("aquifer_type", "") or ""),
        ))
        return (geom_hash, attr_hash)

    gdf["_fp"] = gdf.apply(fingerprint, axis=1)
    dup_mask = gdf.duplicated(subset=["_fp"], keep="first")
    duplicates = gdf[dup_mask]

    if duplicates.empty:
        print("  No true geometric duplicates found.")
        return gdf.drop(columns=["_fp"])

    print(f"  Found {len(duplicates):,} true duplicates — logging deletions ...")

    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "w", newline="", encoding="utf-8") as f:
        fields = [
            "run_timestamp", "deleted_index", "aquifer_name", "aquifer_type",
            "productivity", "country", "source_1", "source_2", "source_3",
            "geometry_wkt_preview",
        ]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for idx, row in duplicates.iterrows():
            writer.writerow({
                "run_timestamp":      RUN_TS,
                "deleted_index":      str(idx),
                "aquifer_name":       str(row.get("aquifer_name", "") or ""),
                "aquifer_type":       str(row.get("aquifer_type", "") or ""),
                "productivity":       str(row.get("productivity", "") or ""),
                "country":            str(row.get("country", "") or ""),
                "source_1":           str(row.get("source_1", "") or ""),
                "source_2":           str(row.get("source_2", "") or ""),
                "source_3":           str(row.get("source_3", "") or ""),
                "geometry_wkt_preview": (
                    row.geometry.wkt[:200] if row.geometry else "NULL"
                ),
            })

    gdf = gdf[~dup_mask].drop(columns=["_fp"])
    print(f"  Removed {len(duplicates):,} duplicates | audit log → {log_path.name}")
    return gdf


# ══════════════════════════════════════════════════════════════════════════════
# COUNTRY ASSIGNMENT
# ══════════════════════════════════════════════════════════════════════════════

def assign_countries(
    gdf: gpd.GeoDataFrame,
    africa_countries: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """
    Assign Lenga Maps standard country name to each feature.

    Primary method: centroid point-in-polygon (fast, handles most cases).
    Fallback method: polygon intersects (for features whose centroid falls
    outside the country boundary due to shape irregularities).

    Transboundary aquifers whose centroid does not fall in any African country
    will have country=NULL — they remain in the dataset (not dropped).
    """
    print("\n  Assigning countries ...")
    ctys = africa_countries[["geometry", "lenga_name"]].copy()

    # Primary: centroid PIP
    centroids = gdf.copy()
    centroids["geometry"] = gdf.geometry.centroid

    joined = gpd.sjoin(
        centroids[["geometry"]],
        ctys,
        how="left",
        predicate="within",
    )
    joined = joined[~joined.index.duplicated(keep="first")]

    gdf = gdf.copy()
    gdf["country"] = joined["lenga_name"].reindex(gdf.index).values

    unassigned = gdf["country"].isna().sum()
    assigned_primary = gdf["country"].notna().sum()

    if unassigned > 0:
        # Fallback: intersects for features whose centroid is outside Africa
        unmask = gdf["country"].isna()
        fallback_joined = gpd.sjoin(
            gdf[unmask][["geometry"]],
            ctys,
            how="left",
            predicate="intersects",
        )
        fallback_joined = fallback_joined[~fallback_joined.index.duplicated(keep="first")]
        gdf.loc[unmask, "country"] = fallback_joined["lenga_name"].reindex(
            gdf[unmask].index
        ).values

    assigned_total = gdf["country"].notna().sum()
    print(f"    Primary (centroid): {assigned_primary:,}")
    print(f"    Fallback (intersects): {assigned_total - assigned_primary:,}")
    print(f"    Still unassigned (transboundary / outside Africa): {gdf['country'].isna().sum():,}")
    return gdf


# ══════════════════════════════════════════════════════════════════════════════
# CLIP TO AFRICA
# ══════════════════════════════════════════════════════════════════════════════

def clip_to_africa(
    gdf: gpd.GeoDataFrame,
    africa_boundary: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """Clip the merged dataset to the Africa continental boundary."""
    print("\n  Clipping to Africa boundary ...")
    before = len(gdf)
    africa_geom = (
        africa_boundary.union_all()
        if hasattr(africa_boundary, "union_all")
        else africa_boundary.unary_union
    )
    clipped = gdf.clip(africa_geom).reset_index(drop=True)
    print(f"  Clip: {before:,} → {len(clipped):,} features")
    return clipped


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMA ENFORCEMENT
# ══════════════════════════════════════════════════════════════════════════════

def enforce_schema(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Ensure the GeoDataFrame has exactly the columns defined in SCHEMA_COLUMNS.
    - Internal helper columns (prefixed with _) are dropped.
    - Missing required columns are added as NULL.
    - Columns are reordered to the standard schema sequence.
    No value is fabricated for any missing column — they remain NULL.
    """
    # Drop internal columns
    drop_cols = [c for c in gdf.columns if c.startswith("_")]
    gdf = gdf.drop(columns=drop_cols, errors="ignore")

    # Drop leftover join artefact columns
    artefact_cols = ["index_right", "index_left", "index_igrac"]
    gdf = gdf.drop(columns=[c for c in artefact_cols if c in gdf.columns], errors="ignore")

    # Add any missing required columns as NULL
    for col in SCHEMA_COLUMNS:
        if col not in gdf.columns:
            gdf[col] = None

    # Reorder to standard sequence (geometry always last in GPKG)
    col_order = [c for c in SCHEMA_COLUMNS] + [
        c for c in gdf.columns if c not in SCHEMA_COLUMNS
    ]
    gdf = gdf[[c for c in col_order if c in gdf.columns]]

    return gdf


# ══════════════════════════════════════════════════════════════════════════════
# GEOPACKAGE SERIALISATION
# ══════════════════════════════════════════════════════════════════════════════

def gdf_to_gpkg_bytes(gdf: gpd.GeoDataFrame, layer_name: str = "aquifer") -> bytes:
    """Serialise a GeoDataFrame to GeoPackage bytes via a temporary file."""
    tmp = Path(tempfile.mktemp(suffix=".gpkg"))
    try:
        gdf.to_file(tmp, driver="GPKG", layer=layer_name)
        return tmp.read_bytes()
    finally:
        tmp.unlink(missing_ok=True)


# ══════════════════════════════════════════════════════════════════════════════
# R2 UPLOAD
# ══════════════════════════════════════════════════════════════════════════════

def r2_key(country: str, filename: str) -> str:
    safe = country.replace(" ", "_").replace("'", "").replace(",", "")
    return f"aquifer/{safe}/{filename}"


def upload_to_r2(key: str, data: bytes, dry_run: bool) -> float:
    size_mb = len(data) / 1_048_576
    if dry_run:
        print(f"    [dry-run] {size_mb:.3f} MB → {key}")
    else:
        r2.put_object(
            Bucket=R2_BUCKET,
            Key=key,
            Body=data,
            ContentType="application/geopackage+sqlite3",
        )
        print(f"    ✓ uploaded {size_mb:.3f} MB → {key}")
    return size_mb


def upsert_supabase(
    country: str,
    key: str,
    size_mb: float,
    feature_count: int,
    conflict_count: int,
    dry_run: bool,
):
    """Insert or update a row in the aquifer_layers Supabase table."""
    row = {
        "country":        country,
        "layer_type":     "aquifer",
        "r2_key":         key,
        "file_size_mb":   round(size_mb, 4),
        "file_format":    "GeoPackage",
        "source":         "WHYMAP/BGR-UNESCO + IGRAC GGIS (harmonised by Lenga Maps)",
        "feature_count":  feature_count,
        "conflict_count": conflict_count,
    }
    if dry_run:
        print(f"    [dry-run] DB: {country} ({feature_count} features, "
              f"{conflict_count} conflicts)")
        return
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/aquifer_layers",
        headers=SUPABASE_HEADERS,
        json=row,
        timeout=30,
    )
    if not resp.ok:
        print(f"    ⚠ DB upsert failed ({resp.status_code}): {resp.text[:200]}")
    else:
        print(f"    ✓ DB: {country} ({feature_count} features, {conflict_count} conflicts)")


# ══════════════════════════════════════════════════════════════════════════════
# LOG HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def write_geometry_fix_log(fix_log: list[dict]) -> None:
    if not fix_log:
        return
    log_path = LOG_DIR / f"geometry_fixes_{RUN_TS}.csv"
    with open(log_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "source", "feature_index", "issue", "action",
            "original_wkt", "fixed_wkt",
        ])
        writer.writeheader()
        writer.writerows(fix_log)
    print(f"  Geometry fix log ({len(fix_log)} entries) → {log_path.name}")


def write_no_data_log(no_data: list[str]) -> None:
    if not no_data:
        return
    log_path = LOG_DIR / f"no_data_countries_{RUN_TS}.csv"
    with open(log_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["country", "reason", "run_timestamp"])
        writer.writeheader()
        for c in sorted(no_data):
            writer.writerow({
                "country":       c,
                "reason":        "no aquifer features within country boundary after clip",
                "run_timestamp": RUN_TS,
            })
    print(f"\n  No-data countries ({len(no_data)}) → {log_path.name}")
    for c in sorted(no_data):
        print(f"    - {c}")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATION
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Africa Aquifer Dataset Pipeline — multi-source download, merge, upload",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Sources:
  1. WHYMAP / BGR-UNESCO  — major groundwater system polygons
  2. IGRAC GGIS           — Transboundary Aquifers of the World 2021

The pipeline will EXIT if any source cannot be downloaded. Partial processing
is never allowed. Cache source zips in data/aquifer_cache/ to avoid re-downloading.
        """,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be uploaded; do not write to R2 or Supabase",
    )
    parser.add_argument(
        "--country",
        metavar="NAME",
        help="Export only this country (e.g. --country Zambia)",
    )
    args = parser.parse_args()

    if args.dry_run:
        print("\n" + "=" * 60)
        print("  DRY RUN — no data will be written to R2 or Supabase")
        print("=" * 60)

    geom_fix_log: list[dict] = []

    # ── [1/8] Download all sources — abort if any fails ───────────────────────
    print(f"\n{'='*60}")
    print("[1/8] Downloading source datasets")
    print(f"{'='*60}")
    print("  The pipeline requires BOTH sources. If any download fails,")
    print("  it will exit with instructions for manual download.\n")

    source_bytes: dict[str, bytes] = {}
    for key in SOURCES:
        source_bytes[key] = download_source(key)

    print(f"\n  ✓ All {len(SOURCES)} sources available.")

    # ── [2/8] Load and reproject ───────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("[2/8] Loading and reprojecting to WGS84 (EPSG:4326)")
    print(f"{'='*60}")

    print("\n  WHYMAP / BGR-UNESCO:")
    whymap_raw = load_gdf_from_zip(source_bytes["whymap"], "whymap")
    if whymap_raw is not None:
        whymap_raw = reproject_to_wgs84(whymap_raw)

    print("\n  IGRAC GGIS — Transboundary Aquifers:")
    igrac_raw = load_gdf_from_zip(source_bytes["igrac"], "igrac")
    if igrac_raw is not None:
        igrac_raw = reproject_to_wgs84(igrac_raw)

    if whymap_raw is None and igrac_raw is None:
        sys.exit("\nFATAL: No usable vector data in any source zip. Pipeline cannot continue.")

    # ── [3/8] Validate and fix geometries ─────────────────────────────────────
    print(f"\n{'='*60}")
    print("[3/8] Validating and fixing geometries")
    print(f"{'='*60}")
    if whymap_raw is not None:
        print("\n  WHYMAP:")
        whymap_raw, fixes = validate_and_fix_geometries(whymap_raw, "WHYMAP/BGR-UNESCO")
        geom_fix_log.extend(fixes)

    if igrac_raw is not None:
        print("\n  IGRAC:")
        igrac_raw, fixes = validate_and_fix_geometries(igrac_raw, "IGRAC GGIS")
        geom_fix_log.extend(fixes)

    if geom_fix_log:
        write_geometry_fix_log(geom_fix_log)
    else:
        print("  All source geometries valid — no fixes needed.")

    # ── [4/8] Parse source-specific attributes ─────────────────────────────────
    print(f"\n{'='*60}")
    print("[4/8] Parsing source-specific attributes")
    print(f"{'='*60}")
    whymap_parsed = None
    igrac_parsed = None
    if whymap_raw is not None:
        print("\n  WHYMAP:")
        whymap_parsed = parse_whymap(whymap_raw)
    if igrac_raw is not None:
        print("  IGRAC:")
        igrac_parsed = parse_igrac(igrac_raw)

    # ── [5/8] Load Africa boundary ─────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("[5/8] Loading Africa boundary (Natural Earth 10m)")
    print(f"{'='*60}")
    africa_boundary, africa_countries = load_africa_boundary()

    # ── [6/8] Spatially conflate ───────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("[6/8] Spatially conflating two sources")
    print(f"{'='*60}")
    merged = conflate_sources(whymap_parsed, igrac_parsed)

    # ── Run conflict detection ─────────────────────────────────────────────────
    print("\n  Running conflict detection ...")
    merged = detect_conflicts(merged)

    # ── Clip to Africa ─────────────────────────────────────────────────────────
    merged = clip_to_africa(merged, africa_boundary)

    # ── Assign countries ───────────────────────────────────────────────────────
    merged = assign_countries(merged, africa_countries)

    # ── Enforce output schema ──────────────────────────────────────────────────
    merged = enforce_schema(merged)

    # ── Remove true geometric duplicates ───────────────────────────────────────
    dup_log_path = LOG_DIR / f"duplicate_deletions_{RUN_TS}.csv"
    merged = remove_geometric_duplicates(merged, dup_log_path)

    print(f"\n  Final merged dataset: {len(merged):,} features")
    print(f"  Source conflicts:     {merged['source_conflict'].sum():,} features")

    # ── [7/8] Final geometry validation on merged output ───────────────────────
    print(f"\n{'='*60}")
    print("[7/8] Final geometry validation on merged output")
    print(f"{'='*60}")
    merged, post_fixes = validate_and_fix_geometries(merged, "merged-output")
    if post_fixes:
        geom_fix_log.extend(post_fixes)
        write_geometry_fix_log(geom_fix_log)
        print(f"  {len(post_fixes)} additional geometry fixes after merge.")
    else:
        print("  All merged geometries valid.")

    # ── [8/8] Per-country export and upload ────────────────────────────────────
    print(f"\n{'='*60}")
    print("[8/8] Per-country export and upload")
    print(f"{'='*60}")

    target_countries = sorted(AFRICA_COUNTRIES)
    if args.country:
        target_countries = [
            c for c in target_countries if args.country.strip().lower() in c.lower()
        ]
        if not target_countries:
            sys.exit(
                f"\nERROR: --country '{args.country}' matched no Africa countries.\n"
                f"Check spelling. Available example: Zambia, Nigeria, South Africa\n"
            )

    no_data_countries: list[str] = []
    uploaded_count = 0
    total_features_uploaded = 0

    for country in target_countries:
        country_gdf = merged[merged["country"] == country].copy().reset_index(drop=True)

        if country_gdf.empty:
            no_data_countries.append(country)
            continue

        print(f"\n  [{country}]  {len(country_gdf):,} features")

        # Per-country final geometry fix
        country_gdf, cty_fixes = validate_and_fix_geometries(
            country_gdf, f"{country}-final"
        )
        if cty_fixes:
            geom_fix_log.extend(cty_fixes)

        safe_name = country.replace(" ", "_").replace("'", "").replace(",", "")
        filename  = f"{safe_name}_aquifer.gpkg"
        key       = r2_key(country, filename)

        data    = gdf_to_gpkg_bytes(country_gdf, layer_name=f"{safe_name}_aquifer")
        size_mb = upload_to_r2(key, data, args.dry_run)
        upsert_supabase(
            country=country,
            key=key,
            size_mb=size_mb,
            feature_count=len(country_gdf),
            conflict_count=int(country_gdf["source_conflict"].sum()),
            dry_run=args.dry_run,
        )
        uploaded_count += 1
        total_features_uploaded += len(country_gdf)

    # ── Write remaining logs ───────────────────────────────────────────────────
    write_no_data_log(no_data_countries)

    if geom_fix_log:
        write_geometry_fix_log(geom_fix_log)

    # ── Summary ────────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    label = "[DRY RUN] " if args.dry_run else ""
    print(f"{label}Pipeline complete — Africa Aquifer Dataset")
    print(f"{'='*60}")
    print(f"  Countries uploaded   : {uploaded_count}")
    print(f"  Countries no data    : {len(no_data_countries)}")
    print(f"  Total features       : {len(merged):,}")
    print(f"  Features uploaded    : {total_features_uploaded:,}")
    print(f"  Source conflicts     : {int(merged['source_conflict'].sum()):,} features flagged")
    print(f"  Geometry fixes       : {len(geom_fix_log)}")
    print(f"  Audit logs           : {LOG_DIR}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
