"""
prepare-protected-areas.py

Builds per-country Protected Areas shapefiles for all 54 African nations
using OpenStreetMap data via the Overpass API.

Why OSM and not WDPA:
    WDPA (UNEP-WCMC + IUCN) is the canonical authority on protected areas.
    Their public CDN (https://d1gam3xoknrgr2.cloudfront.net/...) was
    deprecated in 2025 in favour of an async-poll download flow that needs
    a session token, and the REST API requires a free token tied to an
    account. Neither works for an unattended pipeline. OSM's
    `boundary=protected_area` and `leisure=nature_reserve` tags cover the
    vast majority of named protected areas in Africa (national parks, game
    reserves, forest reserves, conservancies, marine protected areas) with
    no auth and a stable, well-documented Overpass API. We attribute the
    output as OSM-derived so users know what they're getting.

Source attribution:
    OpenStreetMap contributors / © OpenStreetMap Foundation
    License: Open Database License (ODbL) — share-alike, attribution required.
    https://www.openstreetmap.org/copyright

Output per country:
    output/ProtectedAreas/{ISO3}_ProtectedAreas.zip
      shapefile attributes:
        osm_id, osm_type, name, name_en, protect_class, protection_title,
        operator, owner, leisure, boundary, iso3, country, area_km2

Also writes output/ProtectedAreas/manifest.json with per-country totals.

Requires:  pip install geopandas pandas requests shapely osm2geojson

Run:       python scripts/prepare-protected-areas.py
           python scripts/prepare-protected-areas.py --country ZMB    # one country
"""

from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import sys
import tempfile
import time
import zipfile

# Force UTF-8 on Windows so ✓, ·, and other unicode in our log lines don't
# blow up the script with a cp1252 codec error AFTER successfully writing
# the shapefile.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import geopandas as gpd
import osm2geojson
import pandas as pd
import requests
from shapely.geometry import shape

# ── Config ──────────────────────────────────────────────────────────────────

# 54 African countries (ISO-3 / common name).
AFRICA = [
    ("DZA", "Algeria"),               ("AGO", "Angola"),
    ("BEN", "Benin"),                  ("BWA", "Botswana"),
    ("BFA", "Burkina Faso"),           ("BDI", "Burundi"),
    ("CPV", "Cabo Verde"),             ("CMR", "Cameroon"),
    ("CAF", "Central African Republic"), ("TCD", "Chad"),
    ("COM", "Comoros"),                ("COG", "Congo"),
    ("COD", "Democratic Republic of the Congo"),
    ("CIV", "Cote d'Ivoire"),          ("DJI", "Djibouti"),
    ("EGY", "Egypt"),                  ("GNQ", "Equatorial Guinea"),
    ("ERI", "Eritrea"),                ("SWZ", "Eswatini"),
    ("ETH", "Ethiopia"),               ("GAB", "Gabon"),
    ("GMB", "Gambia"),                 ("GHA", "Ghana"),
    ("GIN", "Guinea"),                 ("GNB", "Guinea-Bissau"),
    ("KEN", "Kenya"),                  ("LSO", "Lesotho"),
    ("LBR", "Liberia"),                ("LBY", "Libya"),
    ("MDG", "Madagascar"),             ("MWI", "Malawi"),
    ("MLI", "Mali"),                   ("MRT", "Mauritania"),
    ("MUS", "Mauritius"),              ("MAR", "Morocco"),
    ("MOZ", "Mozambique"),             ("NAM", "Namibia"),
    ("NER", "Niger"),                  ("NGA", "Nigeria"),
    ("RWA", "Rwanda"),                 ("STP", "Sao Tome and Principe"),
    ("SEN", "Senegal"),                ("SYC", "Seychelles"),
    ("SLE", "Sierra Leone"),           ("SOM", "Somalia"),
    ("ZAF", "South Africa"),           ("SSD", "South Sudan"),
    ("SDN", "Sudan"),                  ("TZA", "Tanzania"),
    ("TGO", "Togo"),                   ("TUN", "Tunisia"),
    ("UGA", "Uganda"),                 ("ZMB", "Zambia"),
    ("ZWE", "Zimbabwe"),
]

OUT_DIR = Path(__file__).resolve().parent.parent / "output" / "ProtectedAreas"

# Overpass mirrors. We rotate on transient failures.
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]

# Per-country query timeout. Some countries (Algeria, DRC, Sudan) have a
# lot of features — give them more headroom.
OVERPASS_TIMEOUT_SEC = 600
HTTP_TIMEOUT_SEC     = 720

# Equal-area projection for area computation in km² (World Cylindrical).
EQUAL_AREA_CRS = "ESRI:54034"


# ── Overpass query ──────────────────────────────────────────────────────────

def overpass_query(iso3: str) -> str:
    """Build an Overpass QL query for protected-area features in a country.
    Uses the country's ISO 3166-1 alpha-3 area as the bounding scope.
    Pulls both relations (multipolygons) and ways (closed polygons).
    `out geom` returns inline geometry so the response is self-contained."""
    return f"""
[out:json][timeout:{OVERPASS_TIMEOUT_SEC}];
area["ISO3166-1:alpha3"="{iso3}"]->.country;
(
  relation["boundary"="protected_area"](area.country);
  relation["leisure"="nature_reserve"](area.country);
  way["boundary"="protected_area"](area.country);
  way["leisure"="nature_reserve"](area.country);
);
out geom tags;
""".strip()


def fetch_overpass(iso3: str, max_retries: int = 3) -> Optional[dict]:
    """POST the query to Overpass, rotating mirrors on failure."""
    query = overpass_query(iso3)
    for attempt in range(max_retries):
        endpoint = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
        try:
            print(f"  [{iso3}] querying {endpoint}")
            r = requests.post(
                endpoint,
                data={"data": query},
                timeout=HTTP_TIMEOUT_SEC,
                headers={"User-Agent": "lenga-maps-protected-areas-pipeline/1.0"},
            )
            if r.status_code == 200:
                return r.json()
            if r.status_code in (429, 504):
                # Rate-limited or timed-out — back off then try next mirror.
                wait = 30 * (attempt + 1)
                print(f"  [{iso3}] HTTP {r.status_code}, sleeping {wait}s before retry")
                time.sleep(wait)
                continue
            print(f"  [{iso3}] HTTP {r.status_code}: {r.text[:120]}")
        except requests.RequestException as exc:
            print(f"  [{iso3}] {endpoint} failed: {exc}")
            time.sleep(5)
    print(f"  [{iso3}] all Overpass mirrors failed after {max_retries} attempts")
    return None


# ── Conversion ──────────────────────────────────────────────────────────────

def osm_to_gdf(osm_json: dict, iso3: str, country: str) -> Optional[gpd.GeoDataFrame]:
    """Convert raw Overpass JSON into a clean GeoDataFrame in EPSG:4326."""
    if not osm_json or not osm_json.get("elements"):
        return None

    geojson = osm2geojson.json2geojson(osm_json)
    feats = geojson.get("features", [])
    if not feats:
        return None

    rows = []
    for f in feats:
        geom = shape(f["geometry"])
        if geom.is_empty:
            continue
        props = f.get("properties", {}) or {}
        # osm2geojson stores OSM tags under 'tags' (sometimes 'properties').
        tags = props.get("tags") if isinstance(props.get("tags"), dict) else props
        rows.append({
            "osm_id":            props.get("id") or props.get("osm_id"),
            "osm_type":          props.get("type") or props.get("osm_type"),
            "name":              tags.get("name", "")[:200],
            "name_en":           tags.get("name:en", "")[:200],
            "protect_class":     str(tags.get("protect_class", ""))[:20],
            "protection_title":  tags.get("protection_title", "")[:120],
            "operator":          tags.get("operator", "")[:200],
            "owner":             tags.get("owner", "")[:200],
            "leisure":           tags.get("leisure", "")[:50],
            "boundary":          tags.get("boundary", "")[:50],
            "iso3":              iso3,
            "country":           country,
            "geometry":          geom,
        })

    if not rows:
        return None

    gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")

    # Drop pure-point or pure-line features — protected areas should be polygonal.
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    if gdf.empty:
        return None

    # Compute area in km² using an equal-area projection.
    equal_area = gdf.to_crs(EQUAL_AREA_CRS)
    gdf["area_km2"] = (equal_area.geometry.area / 1_000_000).round(3)

    return gdf.reset_index(drop=True)


def designation_summary(gdf: gpd.GeoDataFrame) -> str:
    """Build a short '23 nature reserves · 12 national parks' summary."""
    if gdf.empty:
        return ""
    labels: list[str] = []
    for _, row in gdf.iterrows():
        title = (row.get("protection_title") or "").strip().lower()
        if title:
            labels.append(title)
            continue
        if (row.get("leisure") or "").strip() == "nature_reserve":
            labels.append("nature reserve")
            continue
        boundary = (row.get("boundary") or "").strip().lower()
        if boundary == "protected_area":
            labels.append("protected area")
    counts = Counter(labels)
    top = counts.most_common(4)
    if not top:
        return ""
    return " · ".join(f"{n} {label}{'s' if n != 1 and not label.endswith('s') else ''}"
                      for label, n in top)


# ── Per-country pipeline ────────────────────────────────────────────────────

def process_country(iso3: str, country: str, source_version: str) -> Optional[dict]:
    """Download from Overpass, build shapefile, ZIP it, return manifest entry."""
    print(f"\n{country} ({iso3})")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_zip = OUT_DIR / f"{iso3}_ProtectedAreas.zip"

    osm_json = fetch_overpass(iso3)
    if not osm_json:
        return None

    gdf = osm_to_gdf(osm_json, iso3, country)
    if gdf is None or gdf.empty:
        print(f"  [{iso3}] no protected-area polygons returned — skipping")
        return None

    feature_count   = len(gdf)
    total_area_km2  = float(gdf["area_km2"].sum())
    desig_summary   = designation_summary(gdf)

    # Marine area: rough proxy — features tagged with `leisure=nature_reserve`
    # or `boundary=protected_area` AND with `marine=yes` aren't always tagged
    # in OSM. We compute area for features that intersect a coastline only as
    # a refinement. For now leave marine_area_km2 as None — it'll come back
    # when WDPA reactivates.
    marine_area_km2 = None

    # Write to a temp shapefile then ZIP into the output ZIP.
    with tempfile.TemporaryDirectory(prefix=f"pa_{iso3}_") as tmp:
        shp_dir = Path(tmp) / "shp"
        shp_dir.mkdir()
        shp_path = shp_dir / f"{iso3}_ProtectedAreas.shp"
        gdf.to_file(shp_path, driver="ESRI Shapefile")

        with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zout:
            for sidecar in shp_dir.iterdir():
                zout.write(sidecar, arcname=sidecar.name)
            zout.writestr(
                "ATTRIBUTION.txt",
                "OpenStreetMap contributors / © OpenStreetMap Foundation\n"
                "Licensed under the Open Database License (ODbL).\n"
                "https://www.openstreetmap.org/copyright\n"
                f"Snapshot: {source_version}\n"
                "Filtered to: boundary=protected_area OR leisure=nature_reserve.\n",
            )

    size_mb = out_zip.stat().st_size / (1024 * 1024)
    print(f"  ✓ {feature_count} features · {total_area_km2:,.0f} km² · {size_mb:.2f} MB")

    return {
        "filename":            out_zip.name,
        "country":             country,
        "iso3":                iso3,
        "feature_count":       feature_count,
        "total_area_km2":      round(total_area_km2, 2),
        "marine_area_km2":     marine_area_km2,
        "designation_summary": desig_summary,
        "source":              "OpenStreetMap contributors · ODbL · www.openstreetmap.org/copyright",
        "source_version":      source_version,
    }


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--country", help="Process a single ISO-3 (e.g. ZMB).")
    args = parser.parse_args()

    # Pin the snapshot to today's UTC date so re-runs are reproducible
    # without overwriting the source_version of older builds unintentionally.
    source_version = "OSM " + datetime.now(timezone.utc).strftime("%b %Y")

    targets = [(i, n) for (i, n) in AFRICA if not args.country or i == args.country.upper()]
    if not targets:
        print(f"Unknown country code {args.country}")
        return 1

    print(f"Source:    {source_version}")
    print(f"Output:    {OUT_DIR}")
    print(f"Countries: {len(targets)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / "manifest.json"
    manifest: list[dict] = []
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            manifest = []
    by_iso = {m["iso3"]: m for m in manifest}

    for iso3, country in targets:
        try:
            entry = process_country(iso3, country, source_version)
        except Exception as exc:
            print(f"  [{iso3}] FAILED: {exc}")
            continue
        if entry:
            by_iso[iso3] = entry
        # Write manifest after every country so a crash mid-run doesn't lose progress.
        manifest_path.write_text(json.dumps(list(by_iso.values()), indent=2))

    print(f"\nDone. {len(by_iso)} countries packaged. Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
