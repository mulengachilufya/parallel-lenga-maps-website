"""
combine-vector.py

Step 2 of the continental-bundle build. Merges every per-country source file
for one VECTOR dataset into a single GeoPackage covering all of Africa, with
every country's attribute table embedded in the one .gpkg, ready to drop
straight into QGIS.

Reads the files.json written by scripts/fetch-dataset-files.mjs, so it never
depends on stale local output/<Dataset>/ folders.

What it produces (output/bundles/<slug>_africa.gpkg):
  • Normal datasets  -> one layer, all 54 countries appended, with `country`
    and `iso3` columns added so you can filter/style by country at continental
    scale. Geometry promoted to Multi* so the layer is type-consistent.
  • admin-boundaries -> ADM0 only, two layers in the one file:
        countries_adm0  — 54 country outlines (one feature each)
        africa_outline  — all ADM0 dissolved into a single continent polygon
                          (Africa's "own admin0" outline)

Run (after the fetch step):
  python scripts/combine-vector.py --dataset roads
  python scripts/combine-vector.py --dataset admin-boundaries
  python scripts/combine-vector.py --dataset roads --src output/_bundle_src/roads

Then: node scripts/seed-bundles.mjs

Requires: geopandas (already used by the other prepare-*.py scripts).
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd
from shapely.geometry import (
    MultiLineString, MultiPoint, MultiPolygon,
)

ROOT        = Path(__file__).resolve().parent.parent
BUNDLES_DIR = ROOT / "output" / "bundles"

VECTOR_SLUGS = {
    "rivers", "lakes", "watersheds", "aquifer", "roads",
    "protected-areas", "population", "admin-boundaries",
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def to_multi(geom):
    """Promote single-part geometries to their Multi* equivalent so a GeoPackage
    layer holds one consistent geometry type (QGIS is happiest this way)."""
    if geom is None or geom.is_empty:
        return geom
    t = geom.geom_type
    if t == "Polygon":
        return MultiPolygon([geom])
    if t == "LineString":
        return MultiLineString([geom])
    if t == "Point":
        return MultiPoint([geom])
    return geom  # already Multi*, or GeometryCollection — leave as-is


def load_any(path: Path, tmproot: str) -> Optional[gpd.GeoDataFrame]:
    """Read a per-country source file regardless of packaging: .gpkg, .geojson,
    or a zipped shapefile / geopackage."""
    suf = path.suffix.lower()
    if suf in (".gpkg", ".geojson", ".json"):
        return gpd.read_file(path)
    if suf == ".zip":
        d = tempfile.mkdtemp(dir=tmproot)
        with zipfile.ZipFile(path) as zf:
            zf.extractall(d)
        for pat in ("*.gpkg", "*.shp", "*.geojson"):
            hits = list(Path(d).rglob(pat))
            if hits:
                return gpd.read_file(hits[0])
        raise RuntimeError(f"no .gpkg/.shp/.geojson inside {path.name}")
    # Last resort — let GDAL try.
    return gpd.read_file(path)


def geom_name(gdf: gpd.GeoDataFrame) -> str:
    try:
        return str(gdf.geom_type.mode().iloc[0])
    except Exception:
        return "Geometry"


def merge_entries(entries, src_dir: Path, tmproot: str):
    """Load + normalise every entry and concat into one GeoDataFrame."""
    frames, n_countries = [], 0
    for e in entries:
        fpath = src_dir / e["local_path"]
        if not fpath.exists():
            print(f"  [{e['iso3']}] missing {e['local_path']} — skipping")
            continue
        try:
            g = load_any(fpath, tmproot)
        except Exception as ex:
            print(f"  [{e['iso3']}] read error: {ex} — skipping")
            continue
        if g is None or g.empty:
            print(f"  [{e['iso3']}] empty — skipping")
            continue
        if g.crs is None:
            g = g.set_crs(4326, allow_override=True)
        g = g.to_crs(4326)
        # Stamp country identity so the merged layer is filterable by country.
        g["country"] = e["country"]
        g["iso3"]    = e["iso3"]
        g["geometry"] = g.geometry.apply(to_multi)
        frames.append(g)
        n_countries += 1
        print(f"  {e['country']:<34} ({e['iso3']}) — {len(g):,} features")

    if not frames:
        return None, 0
    merged = gpd.GeoDataFrame(
        pd.concat(frames, ignore_index=True, sort=False),
        crs="EPSG:4326",
        geometry="geometry",
    )
    return merged, n_countries


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, help=f"one of: {', '.join(sorted(VECTOR_SLUGS))}")
    ap.add_argument("--src", help="source dir with files.json (default output/_bundle_src/<slug>)")
    args = ap.parse_args()

    slug = args.dataset.lower()
    if slug not in VECTOR_SLUGS:
        print(f"ERROR: '{slug}' is not a vector dataset. Choose from: {', '.join(sorted(VECTOR_SLUGS))}")
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

    BUNDLES_DIR.mkdir(parents=True, exist_ok=True)
    out_gpkg = BUNDLES_DIR / f"{slug}_africa.gpkg"
    if out_gpkg.exists():
        out_gpkg.unlink()

    print(f"\nCombining {slug} → {out_gpkg.name}\n")
    layers_meta: list[dict] = []
    feature_count = 0
    file_count = 0

    with tempfile.TemporaryDirectory() as tmproot:
        if slug == "admin-boundaries":
            # ADM0 only (fetch already filtered admin_level=0, but be safe).
            adm0 = [e for e in entries if e.get("admin_level") in (0, "0", None)]
            countries, file_count = merge_entries(adm0, src_dir, tmproot)
            if countries is None:
                print("ERROR: no ADM0 features merged."); return 1

            countries.to_file(out_gpkg, driver="GPKG", layer="countries_adm0")
            layers_meta.append({
                "name": "countries_adm0",
                "geometry": geom_name(countries),
                "features": int(len(countries)),
            })
            feature_count += int(len(countries))

            # Africa's own outline: dissolve every country into one polygon.
            print("\n  dissolving → africa_outline …")
            africa = countries.dissolve()
            africa = africa[["geometry"]].reset_index(drop=True)
            africa["name"] = "Africa"
            africa["iso3"] = "AFR"
            africa["geometry"] = africa.geometry.apply(to_multi)
            africa = gpd.GeoDataFrame(africa, crs="EPSG:4326", geometry="geometry")
            africa.to_file(out_gpkg, driver="GPKG", layer="africa_outline")
            layers_meta.append({
                "name": "africa_outline",
                "geometry": geom_name(africa),
                "features": int(len(africa)),
            })
            feature_count += int(len(africa))
        else:
            merged, file_count = merge_entries(entries, src_dir, tmproot)
            if merged is None:
                print("ERROR: nothing merged."); return 1
            layer_name = slug.replace("-", "_")
            merged.to_file(out_gpkg, driver="GPKG", layer=layer_name)
            layers_meta.append({
                "name": layer_name,
                "geometry": geom_name(merged),
                "features": int(len(merged)),
            })
            feature_count = int(len(merged))

    size_bytes = out_gpkg.stat().st_size
    size_mb = round(size_bytes / 1_048_576, 2)
    print(f"\n✓ {out_gpkg.name} — {file_count} countries · "
          f"{feature_count:,} features · {size_mb} MB")

    # Update the bundles manifest (replace any prior entry for this dataset).
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
        "filename":      out_gpkg.name,
        "r2_key":        f"bundles/{out_gpkg.name}",
        "file_format":   "GeoPackage",
        "file_size_mb":  size_mb,
        "bytes":         size_bytes,
        "file_count":    file_count,
        "feature_count": feature_count,
        "layers":        layers_meta,
    })
    manifest.sort(key=lambda m: m["dataset_id"])
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"  manifest → {manifest_path.relative_to(ROOT)}")
    print(f"\nNext: node scripts/seed-bundles.mjs\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
