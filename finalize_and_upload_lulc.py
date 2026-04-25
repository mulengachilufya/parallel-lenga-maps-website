#!/usr/bin/env python3
"""
Finalize + Upload LULC
======================
For each existing output/LULC/{Country}_LULC.tif:

  1. Verify CRS is EPSG:4326, dtype is uint8, has a color table
     (writes one if missing).
  2. Write a PAM sidecar  {country}_LULC.tif.aux.xml  containing the full
     GDAL Raster Attribute Table (RAT).  QGIS and ArcGIS read this sidecar
     automatically — no GDAL Python bindings required.
  3. Compute valid-pixel coverage vs the country boundary and log the ratio.
     Below --min-coverage (default 0.95) the file is flagged but still uploaded
     (you can re-run the main pipeline for flagged countries separately).
  4. Upload .tif and .aux.xml to R2 via MULTIPART upload (handles files of
     any size — bypasses the single-PUT 300 MB practical limit).
  5. Upsert Supabase lulc_layers row.

Usage
-----
  python finalize_and_upload_lulc.py                          # all .tif files found
  python finalize_and_upload_lulc.py --min-size-mb 100        # only >= 100 MB
  python finalize_and_upload_lulc.py --country Zambia         # one country
  python finalize_and_upload_lulc.py --dry-run                # verify + write sidecars, no uploads
  python finalize_and_upload_lulc.py --skip-verify            # trust files, just upload
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import boto3
    import geopandas as gpd
    import numpy as np
    import rasterio
    import rasterio.features
    import requests
    from botocore.config import Config
    from boto3.s3.transfer import TransferConfig
    from dotenv import load_dotenv
    from rasterio.crs import CRS
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
except ImportError as e:
    sys.exit(f"Missing dependency: {e}\nRun: python -m pip install -r requirements.txt")

# ── Import shared config from the main pipeline to stay in sync ───────────────
# (the pipeline module wraps sys.stdout as UTF-8 on import, so don't re-wrap)
from africa_lulc_pipeline import (
    AFRICA_COUNTRIES,
    BOUNDS_DIR,
    ESA_CLASSES,
    ESA_NODATA,
    ESA_DTYPE,
    NE_NAME_MAP,
    OUTPUT_DIR,
    PROCESSING_ORDER,
    R2_BUCKET,
    SUPABASE_HEADERS,
    SUPABASE_URL,
    build_r2_key,
    load_africa_countries,
    r2_safe,
    r2 as _pipeline_r2,     # reuse the authenticated client
)

# ── Logging ────────────────────────────────────────────────────────────────────
def log(msg: str, indent: int = 0) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {'  ' * indent}{msg}", flush=True)


# ── Multipart upload config ────────────────────────────────────────────────────
# 64 MB parts × 10 concurrent ≈ 640 MB in flight.  This bypasses the effective
# single-PUT cap (reports of failures above ~300 MB against R2) and handles
# 1–2 GB rasters (Angola, Zambia, South Africa, Tanzania) reliably.
MPU_CONFIG = TransferConfig(
    multipart_threshold=64 * 1024 * 1024,   # start MPU at 64 MB
    multipart_chunksize=64 * 1024 * 1024,   # 64 MB per part
    max_concurrency=10,
    use_threads=True,
)


def upload_multipart(local_path: Path, r2_key: str, content_type: str) -> None:
    """Upload a file to R2 using multipart (any size, no practical cap)."""
    _pipeline_r2.upload_file(
        Filename=str(local_path),
        Bucket=R2_BUCKET,
        Key=r2_key,
        ExtraArgs={"ContentType": content_type},
        Config=MPU_CONFIG,
    )


# ══════════════════════════════════════════════════════════════════════════════
# PAM SIDECAR RAT WRITER
# ══════════════════════════════════════════════════════════════════════════════
# GDAL PAM (Persistent Auxiliary Metadata) .aux.xml format.  QGIS and ArcGIS
# read the RAT from this sidecar automatically — no osgeo Python bindings
# needed.
#
# Field Usage codes (GFU_*):
#   0 = Generic, 1 = PixelCount, 2 = Name, 3 = MinMax,
#   4 = Red, 5 = Green, 6 = Blue, 7 = Alpha
# Field Type codes (GFT_*):
#   0 = Integer, 1 = Real, 2 = String

def build_pam_rat_xml(existing_aux_xml: Optional[Path] = None) -> str:
    """Produce the PAM .aux.xml content with the ESA WorldCover RAT.
    If an existing sidecar is supplied, its STATISTICS metadata is preserved."""
    root = ET.Element("PAMDataset")
    band = ET.SubElement(root, "PAMRasterBand", band="1")

    # ── Preserve any existing <Metadata> block (STATISTICS_*) from prior sidecar
    if existing_aux_xml and existing_aux_xml.exists():
        try:
            existing = ET.parse(existing_aux_xml).getroot()
            existing_band = existing.find("PAMRasterBand")
            if existing_band is not None:
                for meta in existing_band.findall("Metadata"):
                    band.append(meta)
        except ET.ParseError:
            pass

    ET.SubElement(band, "ColorInterp").text = "Palette"

    # ── Color table ────────────────────────────────────────────────────────────
    ct = ET.SubElement(band, "ColorTable")
    # Build a 256-entry palette (the ESA values are sparse; empty entries stay black/transparent).
    palette = {0: (0, 0, 0, 0), ESA_NODATA: (0, 0, 0, 0)}
    for v, _name, r, g, b in ESA_CLASSES:
        palette[v] = (r, g, b, 255)
    for v in range(256):
        r, g, b, a = palette.get(v, (0, 0, 0, 0))
        ET.SubElement(
            ct, "Entry", c1=str(r), c2=str(g), c3=str(b), c4=str(a),
        )

    # ── Raster Attribute Table (thematic) ──────────────────────────────────────
    rat = ET.SubElement(
        band, "GDALRasterAttributeTable",
        tableType="thematic",
    )
    fields = [
        ("Value",      0, 3),   # Integer,  GFU_MinMax
        ("Class_Name", 2, 2),   # String,   GFU_Name
        ("Red",        0, 4),   # Integer,  GFU_Red
        ("Green",      0, 5),   # Integer,  GFU_Green
        ("Blue",       0, 6),   # Integer,  GFU_Blue
    ]
    for idx, (name, ftype, fusage) in enumerate(fields):
        fd = ET.SubElement(rat, "FieldDefn", index=str(idx))
        ET.SubElement(fd, "Name").text = name
        ET.SubElement(fd, "Type").text = str(ftype)
        ET.SubElement(fd, "Usage").text = str(fusage)

    for row_idx, (value, class_name, r, g, b) in enumerate(ESA_CLASSES):
        row = ET.SubElement(rat, "Row", index=str(row_idx))
        for cell in (str(value), class_name, str(r), str(g), str(b)):
            ET.SubElement(row, "F").text = cell

    # Pretty-print
    ET.indent(root, space="  ", level=0)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")


def write_pam_sidecar(tif_path: Path) -> Path:
    sidecar = tif_path.with_suffix(tif_path.suffix + ".aux.xml")
    xml = build_pam_rat_xml(sidecar if sidecar.exists() else None)
    sidecar.write_text(xml, encoding="utf-8")
    return sidecar


# ══════════════════════════════════════════════════════════════════════════════
# VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════

class VerifyResult:
    __slots__ = ("ok", "warnings", "coverage")
    def __init__(self) -> None:
        self.ok:       bool        = True
        self.warnings: list[str]   = []
        self.coverage: float | None = None


def ensure_colormap(tif_path: Path) -> bool:
    """Write the ESA colormap into the GeoTIFF if missing.  Returns True if
    the colormap is present (either pre-existing or newly written)."""
    with rasterio.open(tif_path) as src:
        try:
            _ = src.colormap(1)
            return True
        except ValueError:
            pass
    # Rewrite — GeoTIFF in r+ mode accepts write_colormap as long as the file
    # is not a strict COG.  For COGs, rasterio silently writes into tags; our
    # sidecar-RAT covers the styling either way, so this is belt-and-suspenders.
    try:
        palette = {v: (r, g, b, 255) for v, _n, r, g, b in ESA_CLASSES}
        palette[ESA_NODATA] = (0, 0, 0, 0)
        with rasterio.open(tif_path, "r+") as dst:
            dst.write_colormap(1, palette)
        return True
    except Exception as exc:
        log(f"  colormap write skipped ({exc})", indent=2)
        return False


def verify_tif(tif_path: Path, country: str, geom, min_coverage: float) -> VerifyResult:
    """Return VerifyResult; sets ok=False only for HARD failures (wrong CRS,
    wrong dtype, unreadable).  Low coverage is a warning, not a failure."""
    r = VerifyResult()
    try:
        with rasterio.open(tif_path) as src:
            # CRS
            if src.crs is None:
                r.ok = False
                r.warnings.append("no CRS")
            elif src.crs.to_epsg() != 4326:
                r.ok = False
                r.warnings.append(f"CRS is EPSG:{src.crs.to_epsg()}, expected 4326")

            # dtype
            if src.dtypes[0] != ESA_DTYPE:
                r.ok = False
                r.warnings.append(f"dtype {src.dtypes[0]}, expected {ESA_DTYPE}")

            # nodata
            if src.nodata != ESA_NODATA:
                r.warnings.append(f"nodata={src.nodata} (expected {ESA_NODATA})")

            # Colormap (soft check — will add if missing)
            try:
                _ = src.colormap(1)
            except ValueError:
                r.warnings.append("no embedded colormap (will add)")

            # Coverage — strip-based to bound memory for large rasters.
            # For each 2048-row strip: rasterize the country mask for just
            # that strip, then read just that strip and count valid pixels.
            # Peak RAM ≈ 2 × 2048 × width (≤ ~400 MB for the largest countries).
            from rasterio.windows import Window
            strip_h           = 2048
            country_pixels    = 0
            valid_in_country  = 0
            for row_start in range(0, src.height, strip_h):
                h = min(strip_h, src.height - row_start)
                win = Window(0, row_start, src.width, h)
                strip_transform = src.window_transform(win)
                mask = rasterio.features.rasterize(
                    [(mapping(geom), 1)],
                    out_shape=(h, src.width),
                    transform=strip_transform,
                    fill=0,
                    all_touched=True,
                    dtype="uint8",
                )
                strip_country = int(mask.sum())
                if strip_country == 0:
                    continue
                band = src.read(1, window=win, out_dtype="uint8")
                country_pixels   += strip_country
                valid_in_country += int(((band != ESA_NODATA) & (mask == 1)).sum())

            if country_pixels == 0:
                r.warnings.append("country mask is empty in raster extent")
                r.coverage = 0.0
            else:
                r.coverage = valid_in_country / country_pixels
                if r.coverage < min_coverage:
                    r.warnings.append(
                        f"coverage {r.coverage:.1%} < {min_coverage:.0%} — possible gaps"
                    )
    except Exception as exc:
        r.ok = False
        r.warnings.append(f"open/read error: {exc}")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# SUPABASE
# ══════════════════════════════════════════════════════════════════════════════

def upsert_supabase(country: str, key: str, size_mb: float) -> None:
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
        log(f"  Supabase upserted → {country}", indent=1)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def resolve_country_from_filename(stem: str) -> Optional[str]:
    """Map '{safe_name}_LULC' back to its Lenga Maps country name."""
    if stem.endswith("_LULC"):
        safe_name = stem[:-len("_LULC")]
    else:
        safe_name = stem
    for c in AFRICA_COUNTRIES:
        if r2_safe(c) == safe_name:
            return c
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--country",      help="Process one country only")
    parser.add_argument("--min-size-mb",  type=float, default=0.0,
                        help="Skip files smaller than this (user rule: >= 100 = final)")
    parser.add_argument("--min-coverage", type=float, default=0.95,
                        help="Warn below this coverage ratio (default 0.95)")
    parser.add_argument("--skip-verify",  action="store_true",
                        help="Skip verification, trust files as-is")
    parser.add_argument("--skip-upload",  action="store_true",
                        help="Write sidecars + verify, no R2 / Supabase writes")
    parser.add_argument("--dry-run",      action="store_true",
                        help="Alias for --skip-upload")
    args = parser.parse_args()

    skip_upload = args.skip_upload or args.dry_run

    # Output dir is OUTPUT_DIR (output/LULC/) per africa_lulc_pipeline.
    tifs = sorted(p for p in OUTPUT_DIR.glob("*_LULC.tif") if ".cog_tmp" not in p.name)
    if args.country:
        tifs = [
            p for p in tifs
            if resolve_country_from_filename(p.stem) == args.country
        ]
        if not tifs:
            sys.exit(f"No file found for country '{args.country}' in {OUTPUT_DIR}")

    # Filter by min size
    if args.min_size_mb > 0:
        before = len(tifs)
        tifs = [p for p in tifs if p.stat().st_size / 1_048_576 >= args.min_size_mb]
        log(f"Size filter: {before} → {len(tifs)} files (>= {args.min_size_mb} MB)")

    log("=" * 72)
    log(f"  Finalize + Upload LULC   ({len(tifs)} files)")
    log(f"  Source dir : {OUTPUT_DIR.resolve()}")
    log(f"  Mode       : {'DRY-RUN (no uploads)' if skip_upload else 'upload to R2 + Supabase'}")
    log("=" * 72)

    # Load boundaries once (needed for verification).
    if not args.skip_verify:
        log("Loading Natural Earth Africa boundaries for coverage check ...")
        africa = load_africa_countries()
        country_geoms: dict[str, object] = {}
        for _, row in africa.iterrows():
            n, g = row["lenga_name"], row.geometry
            if not n or g is None:
                continue
            country_geoms[n] = unary_union([country_geoms[n], g]) if n in country_geoms else g

    summary = {"ok": 0, "warned": 0, "failed": 0, "uploaded": 0}
    per_country_log: list[dict] = []

    for idx, tif in enumerate(tifs, 1):
        country = resolve_country_from_filename(tif.stem)
        size_mb = tif.stat().st_size / 1_048_576
        log(f"\n[{idx:02d}/{len(tifs)}] {country or tif.stem}   ({size_mb:.1f} MB)")
        if country is None:
            log(f"  SKIP: cannot map '{tif.name}' to a country name", indent=1)
            summary["failed"] += 1
            continue

        # ── 1. Ensure colormap ────────────────────────────────────────────────
        has_cmap = ensure_colormap(tif)

        # ── 2. Verify ─────────────────────────────────────────────────────────
        verdict: VerifyResult | None = None
        if not args.skip_verify:
            geom = country_geoms.get(country)
            if geom is None:
                log(f"  WARNING: no boundary for '{country}' — skipping coverage check", indent=1)
            else:
                verdict = verify_tif(tif, country, geom, args.min_coverage)
                cov_str = f"{verdict.coverage:.1%}" if verdict.coverage is not None else "?"
                status  = "OK" if verdict.ok and not verdict.warnings else ("WARN" if verdict.ok else "FAIL")
                log(f"  verify: {status}   coverage={cov_str}", indent=1)
                for w in verdict.warnings:
                    log(f"    - {w}", indent=2)
                if not verdict.ok:
                    summary["failed"] += 1
                    per_country_log.append({
                        "country": country, "file": tif.name, "size_mb": round(size_mb, 2),
                        "coverage": verdict.coverage, "status": "FAIL",
                        "warnings": " | ".join(verdict.warnings),
                    })
                    continue
                if verdict.warnings:
                    summary["warned"] += 1
                else:
                    summary["ok"] += 1

        # ── 3. Write PAM RAT sidecar ──────────────────────────────────────────
        sidecar = write_pam_sidecar(tif)
        log(f"  RAT sidecar written → {sidecar.name} ({sidecar.stat().st_size} B)", indent=1)

        # ── 4. Upload .tif + .aux.xml via multipart ───────────────────────────
        r2_tif_key     = build_r2_key(country)
        r2_sidecar_key = r2_tif_key + ".aux.xml"

        if skip_upload:
            log(f"  [dry-run] would upload:", indent=1)
            log(f"    R2 {r2_tif_key}      ({size_mb:.1f} MB via multipart)", indent=1)
            log(f"    R2 {r2_sidecar_key}  ({sidecar.stat().st_size} B)", indent=1)
            log(f"    Supabase upsert → {country}", indent=1)
        else:
            try:
                t0 = time.time()
                upload_multipart(tif, r2_tif_key, "image/tiff")
                dt = time.time() - t0
                mbps = (size_mb / dt) if dt > 0 else 0
                log(f"  R2 uploaded    {r2_tif_key}  ({size_mb:.1f} MB in {dt:.1f}s ≈ {mbps:.1f} MB/s)", indent=1)

                upload_multipart(sidecar, r2_sidecar_key, "application/xml")
                log(f"  R2 uploaded    {r2_sidecar_key}", indent=1)

                upsert_supabase(country, r2_tif_key, size_mb)
                summary["uploaded"] += 1
            except Exception as exc:
                log(f"  ERROR: upload failed — {exc}", indent=1)
                per_country_log.append({
                    "country": country, "file": tif.name, "size_mb": round(size_mb, 2),
                    "coverage": (verdict.coverage if verdict else None),
                    "status": "UPLOAD_FAIL",
                    "warnings": f"upload_error: {exc}",
                })
                continue

        per_country_log.append({
            "country":  country,
            "file":     tif.name,
            "size_mb":  round(size_mb, 2),
            "coverage": round(verdict.coverage, 4) if verdict and verdict.coverage is not None else None,
            "status":   "OK" if (verdict is None or not verdict.warnings) else "WARN",
            "warnings": " | ".join(verdict.warnings) if verdict else "",
        })

    # Write per-run CSV summary
    run_ts  = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log_dir = Path(__file__).parent / "logs" / "lulc"
    log_dir.mkdir(parents=True, exist_ok=True)
    summary_csv = log_dir / f"finalize_upload_{run_ts}.csv"
    with open(summary_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["country", "file", "size_mb", "coverage", "status", "warnings"])
        w.writeheader(); w.writerows(per_country_log)

    log("\n" + "=" * 72)
    log(f"  Finalize + Upload complete")
    log(f"  Verified OK   : {summary['ok']}")
    log(f"  Verified WARN : {summary['warned']}")
    log(f"  Failed        : {summary['failed']}")
    log(f"  Uploaded      : {summary['uploaded']}")
    log(f"  Summary CSV   : {summary_csv}")
    log("=" * 72)


if __name__ == "__main__":
    main()
