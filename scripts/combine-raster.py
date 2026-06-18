"""
combine-raster.py

Step 2 (raster variant) of the continental-bundle build. Mosaics every
per-country GeoTIFF for one COARSE climate dataset (rainfall, temperature,
drought-index) into a single Cloud-Optimized GeoTIFF covering all of Africa —
one continuous surface you can drop straight into QGIS instead of stitching 54
country rasters by hand.

Reads the files.json written by scripts/fetch-dataset-files.mjs, so it never
depends on stale local output/ folders.

Scope: only the ~5 km climate rasters. Soil (250 m) and LULC (10 m) are
intentionally NOT combined here — an Africa-wide mosaic at native resolution is
far too large to host/download; those stay per-country.

Each per-country file is a zipped GeoTIFF (EPSG:4326, NoData -9999). The schema
allows several variable_name values per country (e.g. 'Annual Total' vs
'Monthly Means'), so we group by variable_name and mosaic ONE coherent variable
(consistent band count): the one covering the most countries, unless you
override with --variable.

Run (after the fetch step):
  python scripts/combine-raster.py --dataset rainfall
  python scripts/combine-raster.py --dataset temperature --variable "Annual Total"

Then: node scripts/seed-bundles.mjs

Requires: rasterio + numpy (already used by the LULC/DEM/soil scripts).
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path

import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.merge import merge

ROOT        = Path(__file__).resolve().parent.parent
BUNDLES_DIR = ROOT / "output" / "bundles"

# Coarse climate rasters only — slugs match the dataset registry.
RASTER_SLUGS = {"rainfall", "temperature", "drought-index"}

NODATA = -9999


def extract_tif(zip_path: Path, tmproot: str) -> Path | None:
    """Pull the first GeoTIFF out of a per-country zip."""
    d = tempfile.mkdtemp(dir=tmproot)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(d)
    tifs = sorted(Path(d).rglob("*.tif")) + sorted(Path(d).rglob("*.tiff"))
    return tifs[0] if tifs else None


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, help=f"one of: {', '.join(sorted(RASTER_SLUGS))}")
    ap.add_argument("--src", help="source dir with files.json (default output/_bundle_src/<slug>)")
    ap.add_argument("--variable", help="force a specific variable_name (else the most-covered one)")
    args = ap.parse_args()

    slug = args.dataset.lower()
    if slug not in RASTER_SLUGS:
        print(f"ERROR: '{slug}' is not a combinable raster dataset. "
              f"Choose from: {', '.join(sorted(RASTER_SLUGS))}. "
              f"(soil & lulc are intentionally excluded — too large at native res.)")
        return 1

    src_dir = Path(args.src) if args.src else ROOT / "output" / "_bundle_src" / slug
    files_json = src_dir / "files.json"
    if not files_json.exists():
        print(f"ERROR: {files_json} not found. Run first:\n"
              f"  node scripts/fetch-dataset-files.mjs --dataset {slug}")
        return 1

    entries = json.loads(files_json.read_text(encoding="utf-8")).get("files", [])
    if not entries:
        print("ERROR: files.json has no files."); return 1

    # Group by variable_name; mosaic one coherent variable (consistent bands).
    groups: dict[str, list] = defaultdict(list)
    for e in entries:
        groups[e.get("variable_name") or "(unnamed)"].append(e)

    if args.variable:
        if args.variable not in groups:
            print(f"ERROR: --variable '{args.variable}' not found. Available: "
                  f"{', '.join(sorted(groups))}")
            return 1
        chosen = args.variable
    else:
        chosen = max(groups, key=lambda k: len(groups[k]))

    chosen_entries = groups[chosen]
    print(f"\nCombining {slug} — variable '{chosen}' ({len(chosen_entries)} countries)")
    if len(groups) > 1:
        others = {k: len(v) for k, v in groups.items() if k != chosen}
        print(f"  (other variables present, NOT included: {others} — use --variable to pick one)")

    BUNDLES_DIR.mkdir(parents=True, exist_ok=True)
    out_tif = BUNDLES_DIR / f"{slug}_africa.tif"
    if out_tif.exists():
        out_tif.unlink()

    opened: list = []
    n_countries = 0
    ref_crs = None
    with tempfile.TemporaryDirectory() as tmproot:
        for e in chosen_entries:
            zpath = src_dir / e["local_path"]
            if not zpath.exists():
                print(f"  [{e['country']}] missing {e['local_path']} — skipping")
                continue
            tif = extract_tif(zpath, tmproot)
            if tif is None:
                print(f"  [{e['country']}] no .tif inside {e['local_path']} — skipping")
                continue
            ds = rasterio.open(tif)
            opened.append(ds)
            if ref_crs is None:
                ref_crs = ds.crs
            n_countries += 1
            print(f"  {e['country']:<34} — {ds.count} band(s), {ds.width}x{ds.height}")

        if not opened:
            print("ERROR: nothing to mosaic."); return 1

        print("\n  mosaicking …")
        mosaic, out_transform = merge(opened, nodata=NODATA)
        bands, height, width = mosaic.shape

        profile = {
            "driver":    "COG",
            "dtype":     mosaic.dtype,
            "count":     bands,
            "height":    height,
            "width":     width,
            "crs":       ref_crs or CRS.from_epsg(4326),
            "transform": out_transform,
            "nodata":    NODATA,
            "compress":  "DEFLATE",
        }
        try:
            with rasterio.open(out_tif, "w", **profile) as dst:
                dst.write(mosaic)
        except Exception as ex:
            # Fallback if the GDAL COG driver isn't available: tiled GeoTIFF
            # with manually built overviews (still QGIS-friendly).
            print(f"  COG driver unavailable ({ex}); writing tiled GeoTIFF + overviews")
            profile.update(driver="GTiff", tiled=True, blockxsize=512, blockysize=512)
            with rasterio.open(out_tif, "w", **profile) as dst:
                dst.write(mosaic)
                dst.build_overviews([2, 4, 8, 16], Resampling.average)
                dst.update_tags(ns="rio_overview", resampling="average")

        for ds in opened:
            ds.close()

    size_bytes = out_tif.stat().st_size
    size_mb = round(size_bytes / 1_048_576, 2)
    print(f"\n✓ {out_tif.name} — {n_countries} countries · {bands} band(s) · "
          f"{width}x{height} · {size_mb} MB")

    # Update the shared bundles manifest (replace any prior entry for this slug).
    manifest_path = BUNDLES_DIR / "bundles-manifest.json"
    manifest = []
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = []
    manifest = [m for m in manifest if m.get("dataset_id") != slug]
    manifest.append({
        "dataset_id":    slug,
        "filename":      out_tif.name,
        "r2_key":        f"bundles/{out_tif.name}",
        "file_format":   "GeoTIFF (COG)",
        "file_size_mb":  size_mb,
        "bytes":         size_bytes,
        "file_count":    n_countries,
        "feature_count": None,
        "layers":        [{"name": slug.replace("-", "_"), "bands": bands, "variable": chosen}],
    })
    manifest.sort(key=lambda m: m["dataset_id"])
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"  manifest → {manifest_path.relative_to(ROOT)}")
    print(f"\nNext: node scripts/seed-bundles.mjs --dataset {slug}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
