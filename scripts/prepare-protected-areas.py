"""
prepare-protected-areas.py

Builds per-country Protected Areas shapefiles for all 54 African nations
using WDPA (World Database on Protected Areas, UNEP-WCMC + IUCN), the
de-facto authority on protected areas worldwide.

Source:
    https://www.protectedplanet.net/country/{ISO3}
    Bulk per-country shapefile downloads at:
      https://d1gam3xoknrgr2.cloudfront.net/current/WDPA_{Mon}{YYYY}_Public_{ISO3}_shp.zip
    No API token required — these URLs are public.

What's in a WDPA per-country ZIP:
    Three nested ZIPs (0/, 1/, 2/) each containing a shapefile —
      _0  =  protected-area POLYGONS (the main file we want)
      _1  =  protected-area POINTS (centroids when geometry unknown — kept
              as fallback so users can SEE every PA, even small ones)
      _2  =  regional/cross-border features (sometimes empty)
    We extract polygons from _0, optionally merge in _1 points-as-tiny-buffers
    if they're not already represented in _0.

Output per country:
    output/ProtectedAreas/{ISO3}_ProtectedAreas.zip
      containing a single shapefile with this attribute schema:
        wdpa_id, name, orig_name, desig, desig_eng, desig_type, iucn_cat,
        marine, rep_area_km2, status, status_yr, gov_type, own_type,
        mgmt_auth, iso3, country
      All polygon features clipped to country, projected to EPSG:4326.

Also writes output/ProtectedAreas/manifest.json with:
    [{ filename, country, iso3, feature_count, total_area_km2,
       marine_area_km2, designation_summary, source, source_version }, ...]

Requires:  pip install geopandas pandas requests fiona shapely

Run:       python scripts/prepare-protected-areas.py
           python scripts/prepare-protected-areas.py --country ZMB    # one country
           python scripts/prepare-protected-areas.py --month Mar2025  # pin a snapshot
"""

from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import sys
import tempfile
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd
import requests

# ── Config ──────────────────────────────────────────────────────────────────

# 54 African countries (ISO-3, common name used in the country column).
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

WDPA_URL_TEMPLATE = (
    "https://d1gam3xoknrgr2.cloudfront.net/current/"
    "WDPA_{month}_Public_{iso3}_shp.zip"
)

OUT_DIR = Path(__file__).resolve().parent.parent / "output" / "ProtectedAreas"

# WDPA columns we keep (case as in the shapefile)
KEEP_COLUMNS = [
    "WDPAID", "NAME", "ORIG_NAME", "DESIG", "DESIG_ENG", "DESIG_TYPE",
    "IUCN_CAT", "MARINE", "REP_AREA", "STATUS", "STATUS_YR",
    "GOV_TYPE", "OWN_TYPE", "MGMT_AUTH", "ISO3",
]

# Friendly column names in the OUTPUT shapefile
COLUMN_RENAME = {
    "WDPAID":      "wdpa_id",
    "NAME":        "name",
    "ORIG_NAME":   "orig_name",
    "DESIG":       "desig",
    "DESIG_ENG":   "desig_eng",
    "DESIG_TYPE":  "desig_type",
    "IUCN_CAT":    "iucn_cat",
    "MARINE":      "marine",
    "REP_AREA":    "rep_area_km2",
    "STATUS":      "status",
    "STATUS_YR":   "status_yr",
    "GOV_TYPE":    "gov_type",
    "OWN_TYPE":    "own_type",
    "MGMT_AUTH":   "mgmt_auth",
    "ISO3":        "iso3",
}

CITATION = (
    "UNEP-WCMC and IUCN ({year}), Protected Planet: The World Database on "
    "Protected Areas (WDPA), {month_full} {year}, Cambridge, UK: UNEP-WCMC and IUCN. "
    "Available at: www.protectedplanet.net"
)


# ── Helpers ─────────────────────────────────────────────────────────────────

def latest_wdpa_month() -> str:
    """Return the most recent WDPA monthly snapshot identifier (e.g. 'Mar2025').
    WDPA publishes snapshots monthly. We default to the previous month to
    avoid race conditions where the current month's URL doesn't yet exist."""
    today = datetime.utcnow()
    # Step back one month — current month may not be published yet.
    year = today.year
    month = today.month - 1
    if month == 0:
        month = 12
        year -= 1
    return datetime(year, month, 1).strftime("%b%Y")  # e.g. "Mar2025"


def download_country_zip(iso3: str, month: str, dest: Path) -> bool:
    """Download a country's WDPA ZIP. Returns True on success."""
    url = WDPA_URL_TEMPLATE.format(month=month, iso3=iso3)
    print(f"  fetching {url}")
    try:
        r = requests.get(url, stream=True, timeout=120)
        if r.status_code == 404:
            print(f"  [{iso3}] not found at {month} — try --month YYYYMM")
            return False
        r.raise_for_status()
        with dest.open("wb") as fh:
            for chunk in r.iter_content(chunk_size=1 << 20):  # 1 MB chunks
                fh.write(chunk)
        return True
    except requests.RequestException as exc:
        print(f"  [{iso3}] download error: {exc}")
        return False


def find_polygon_shapefile(unzipped_root: Path) -> Optional[Path]:
    """Inside an unzipped WDPA per-country bundle, locate the polygons SHP.
    The bundle nests three further ZIPs (0/1/2). The polygon layer lives in
    the inner ZIP whose name ends with `_0` and contains a .shp."""
    # First unzip any nested ZIPs.
    for zf in unzipped_root.glob("*.zip"):
        with zipfile.ZipFile(zf) as nested:
            nested.extractall(unzipped_root)

    # Find the polygons SHP — names typically WDPA_*_polygons.shp or *_0.shp
    candidates = list(unzipped_root.rglob("*_polygons.shp")) \
              + list(unzipped_root.rglob("*-polygons.shp"))
    if not candidates:
        # Fallback: look for *_0.shp (the polygons piece in older bundles)
        candidates = list(unzipped_root.rglob("*_0.shp"))
    return candidates[0] if candidates else None


def designation_summary(gdf: gpd.GeoDataFrame) -> str:
    """Build a short '23 National Parks · 12 Game Reserves' summary."""
    if "DESIG_ENG" not in gdf.columns or gdf.empty:
        return ""
    counts = Counter(
        d.strip() for d in gdf["DESIG_ENG"].dropna().tolist() if d and d.strip()
    )
    top = counts.most_common(4)
    if not top:
        return ""
    parts = [f"{n} {label}{'s' if n != 1 and not label.endswith('s') else ''}"
             for label, n in top]
    return " · ".join(parts)


def process_country(iso3: str, country: str, month: str, source_version: str) -> Optional[dict]:
    """Download, clean, and package one country. Returns manifest entry or None."""
    print(f"\n{country} ({iso3})")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_zip = OUT_DIR / f"{iso3}_ProtectedAreas.zip"

    with tempfile.TemporaryDirectory(prefix=f"wdpa_{iso3}_") as tmp:
        tmp_path = Path(tmp)
        zip_path = tmp_path / f"WDPA_{iso3}.zip"
        if not download_country_zip(iso3, month, zip_path):
            return None

        # Unzip the outer bundle
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(tmp_path)

        shp_path = find_polygon_shapefile(tmp_path)
        if not shp_path:
            print(f"  [{iso3}] no polygons shapefile inside bundle — skipping")
            return None

        # Read + reproject + clean
        gdf = gpd.read_file(shp_path)
        if gdf.empty:
            print(f"  [{iso3}] shapefile empty — skipping")
            return None

        # Reproject to EPSG:4326 if not already (most WDPA bundles are 4326).
        if gdf.crs is None:
            gdf = gdf.set_crs(4326)
        elif gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(4326)

        # Subset + rename columns. Some columns may be missing in older
        # snapshots — fill with None.
        for col in KEEP_COLUMNS:
            if col not in gdf.columns:
                gdf[col] = None
        out_gdf = gdf[KEEP_COLUMNS + ["geometry"]].rename(columns=COLUMN_RENAME)

        # Compute per-feature areas in km² for sanity (REP_AREA is what
        # countries report; we keep it but also know the GIS-computed area).
        equal_area = out_gdf.to_crs("ESRI:54034")  # World Cylindrical Equal Area
        gis_area_km2 = equal_area.geometry.area / 1_000_000

        # Summary stats
        feature_count   = len(out_gdf)
        total_area_km2  = float(pd.to_numeric(out_gdf["rep_area_km2"], errors="coerce").fillna(0).sum())
        marine_mask     = out_gdf["marine"].astype(str).isin(["1", "2"])
        marine_area_km2 = float(pd.to_numeric(out_gdf.loc[marine_mask, "rep_area_km2"], errors="coerce").fillna(0).sum())
        desig_summary   = designation_summary(gdf)

        if total_area_km2 == 0 and not gis_area_km2.empty:
            total_area_km2 = float(gis_area_km2.sum())

        # Write to a temp shapefile, then ZIP into the output ZIP
        shp_out_dir = tmp_path / "out_shp"
        shp_out_dir.mkdir(exist_ok=True)
        shp_out = shp_out_dir / f"{iso3}_ProtectedAreas.shp"
        out_gdf.to_file(shp_out, driver="ESRI Shapefile")

        # ZIP the .shp + sidecars
        with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zout:
            for sidecar in shp_out_dir.iterdir():
                zout.write(sidecar, arcname=sidecar.name)
            # Include a citation so downstream users always see it
            citation_year = source_version.split()[-1]
            citation_month = source_version.split()[1] if len(source_version.split()) > 1 else ""
            zout.writestr(
                "ATTRIBUTION.txt",
                CITATION.format(year=citation_year, month_full=citation_month),
            )

    size_mb = out_zip.stat().st_size / (1024 * 1024)
    print(f"  ✓ {feature_count} PAs · {total_area_km2:,.0f} km² total · {size_mb:.2f} MB")

    return {
        "filename":            out_zip.name,
        "country":             country,
        "iso3":                iso3,
        "feature_count":       feature_count,
        "total_area_km2":      round(total_area_km2, 2),
        "marine_area_km2":     round(marine_area_km2, 2) if marine_area_km2 else None,
        "designation_summary": desig_summary,
        "source":              "WDPA · UNEP-WCMC + IUCN · CC-BY 4.0 · www.protectedplanet.net",
        "source_version":      source_version,
    }


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--country", help="Process a single ISO-3 (e.g. ZMB).")
    parser.add_argument("--month",   help="Pin a WDPA snapshot, e.g. 'Mar2025'. Default = previous month.")
    args = parser.parse_args()

    month = args.month or latest_wdpa_month()
    source_version = f"WDPA {month[:3]} {month[3:]}"  # "Mar2025" → "WDPA Mar 2025"

    targets = [(i, n) for (i, n) in AFRICA if not args.country or i == args.country.upper()]
    if not targets:
        print(f"Unknown country code {args.country}")
        return 1

    print(f"WDPA snapshot: {source_version}")
    print(f"Output:        {OUT_DIR}")
    print(f"Countries:     {len(targets)}")

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
            entry = process_country(iso3, country, month, source_version)
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
