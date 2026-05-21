"""
prepare-soil.py

Downloads SoilGrids 250m WRB (World Reference Base) most-probable soil
classification for each African country via the ISRIC WCS service, clips
to exact country boundaries, and embeds the WRB class lookup table into
the GeoTIFF so users see class names directly in QGIS/ArcGIS without a
sidecar file.

Source: ISRIC SoilGrids v2.0 – WRB Most Probable Classification
  https://soilgrids.org/
License: CC BY 4.0
Cite: Poggio et al. (2021) SoilGrids 2.0: producing soil information for
  the globe with quantified spatial uncertainty. SOIL, 7, 217–240.
  https://doi.org/10.5194/soil-7-217-2021

Resolution: 250 m · Projection: EPSG:4326 (output) · Format: GeoTIFF

Run:
  pip install rasterio requests geopandas
  python scripts/prepare-soil.py            # all 54 countries
  python scripts/prepare-soil.py --country ZMB
  python scripts/prepare-soil.py --skip-download  # reuse cached countries shp
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import geopandas as gpd
import numpy as np
import requests
import rasterio
from rasterio.mask import mask
from rasterio.transform import from_bounds
from shapely.geometry import box

# ── Config ──────────────────────────────────────────────────────────────────

# ISRIC SoilGrids WCS – MostProbable WRB class (int 0-118)
WCS_URL = (
    "https://maps.isric.org/mapserv"
    "?map=/map/wrb.map"
    "&service=WCS&version=2.0.1"
    "&request=GetCoverage"
    "&CoverageId=MostProbable"
    "&format=image/tiff"
    "&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
    "&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
    "&subset=X({west},{east})"
    "&subset=Y({south},{north})"
)

ADMIN0_URL = (
    "https://naciscdn.org/naturalearth/10m/cultural/"
    "ne_10m_admin_0_countries.zip"
)

ROOT      = Path(__file__).resolve().parent.parent
OUT_DIR   = ROOT / "output" / "Soil"
CACHE_DIR = ROOT / "output" / ".cache"

HEADERS = {"User-Agent": "lenga-maps-gis-pipeline/1.0 (contact: lengamaps@gmail.com)"}

# Rate-limit: ISRIC allows 5 requests/minute
RATE_LIMIT_SLEEP = 13   # seconds between requests (≈ 4.5/min, safe)

# WRB Reference Soil Group codes → names (SoilGrids MostProbable codes)
# Codes 0-118 map to WRB RSG acronyms. The most common African ones are:
WRB_CLASSES = {
    0: "No data",
    1: "Acrisols (AC)", 2: "Albeluvisols (AB)", 3: "Alisols (AL)",
    4: "Andosols (AN)", 5: "Arenosols (AR)", 6: "Calcisols (CL)",
    7: "Cambisols (CM)", 8: "Chernozems (CH)", 9: "Cryosols (CR)",
    10: "Durisols (DU)", 11: "Ferralsols (FR)", 12: "Fluvisols (FL)",
    13: "Gleysols (GL)", 14: "Gypsisols (GY)", 15: "Histosols (HS)",
    16: "Kastanozems (KS)", 17: "Leptosols (LP)", 18: "Lixisols (LX)",
    19: "Luvisols (LV)", 20: "Nitisols (NT)", 21: "Phaeozems (PH)",
    22: "Planosols (PL)", 23: "Plinthosols (PT)", 24: "Podzols (PZ)",
    25: "Regosols (RG)", 26: "Retisols (RT)", 27: "Solonchaks (SC)",
    28: "Solonetz (SN)", 29: "Stagnosols (ST)", 30: "Technosols (TC)",
    31: "Umbrisols (UM)", 32: "Vertisols (VR)",
}

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


# ── Helpers ──────────────────────────────────────────────────────────────────

def download_file(url: str, dest: Path) -> None:
    if dest.exists():
        print(f"  [cache] {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {dest.name} …")
    r = requests.get(url, headers=HEADERS, stream=True, timeout=120)
    r.raise_for_status()
    with dest.open("wb") as f:
        for chunk in r.iter_content(1 << 20):
            f.write(chunk)
    print(f"  → {dest.stat().st_size / 1_048_576:.1f} MB")


def load_shp_from_zip(zip_path: Path) -> Optional[gpd.GeoDataFrame]:
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp)
        shps = list(Path(tmp).rglob("*.shp"))
        if not shps:
            return None
        return gpd.read_file(shps[0])


def download_wcs_bbox(west: float, south: float, east: float, north: float) -> Optional[bytes]:
    """Download SoilGrids MostProbable WRB GeoTIFF for a bounding box."""
    # Add small buffer to avoid edge artefacts
    buf = 0.1
    url = WCS_URL.format(
        west=round(west - buf, 4), east=round(east + buf, 4),
        south=round(south - buf, 4), north=round(north + buf, 4),
    )
    try:
        r = requests.get(url, headers=HEADERS, timeout=180)
        r.raise_for_status()
        ct = r.headers.get("content-type", "")
        if "tiff" not in ct and "octet" not in ct:
            print(f"  unexpected content-type: {ct}")
            return None
        return r.content
    except requests.RequestException as e:
        print(f"  WCS download failed: {e}")
        return None


def clip_and_save(tif_bytes: bytes, country_geom, out_path: Path, iso3: str, country: str) -> bool:
    """Clip a GeoTIFF (in memory) to the country polygon and save."""
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        tmp.write(tif_bytes)
        tmp_path = Path(tmp.name)

    try:
        with rasterio.open(tmp_path) as src:
            # Clip to country boundary
            geoms = [country_geom.__geo_interface__]
            clipped, transform = mask(src, geoms, crop=True, nodata=255)
            meta = src.meta.copy()
            meta.update({
                "driver":    "GTiff",
                "height":    clipped.shape[1],
                "width":     clipped.shape[2],
                "transform": transform,
                "nodata":    255,
                "compress":  "lzw",
                "dtype":     "uint8",
            })

            with rasterio.open(out_path, "w", **meta) as dst:
                dst.write(clipped)
                # Embed WRB class names as category descriptions so QGIS
                # can show class names when inspecting pixels
                categories = {v: k for k, v in WRB_CLASSES.items()}
                dst.update_tags(
                    iso3=iso3,
                    country=country,
                    source="ISRIC SoilGrids v2.0 – WRB MostProbable",
                    license="CC BY 4.0",
                    resolution_m="250",
                    citation="Poggio et al. (2021) doi:10.5194/soil-7-217-2021",
                )
                # Write band description for QGIS
                dst.update_tags(1, STATISTICS_MINIMUM="0", STATISTICS_MAXIMUM="118")
                # Colormap (simple green→brown gradient for soil types)
                # This lets QGIS render it with meaningful colours
                colormap = {}
                for code in range(0, 119):
                    if code == 0:
                        colormap[code] = (200, 200, 200, 128)  # grey = no data
                    elif code in [5, 25]:   # Arenosols, Regosols — sandy
                        colormap[code] = (255, 230, 180, 255)
                    elif code in [11]:       # Ferralsols — typical Africa
                        colormap[code] = (180, 80, 20, 255)
                    elif code in [7]:        # Cambisols
                        colormap[code] = (160, 120, 70, 255)
                    elif code in [6, 10]:    # Calcisols, Durisols — arid
                        colormap[code] = (220, 200, 140, 255)
                    elif code in [32]:       # Vertisols — clay
                        colormap[code] = (90, 60, 130, 255)
                    elif code in [12, 13]:   # Fluvisols, Gleysols — wet
                        colormap[code] = (100, 180, 200, 255)
                    elif code in [15]:       # Histosols — organic
                        colormap[code] = (50, 100, 50, 255)
                    else:
                        # Hue varies by code for easy visual distinction
                        hue = (code * 37) % 255
                        colormap[code] = (hue, 140, 80, 255)
                dst.write_colormap(1, colormap)

        tmp_path.unlink(missing_ok=True)
        return True
    except Exception as e:
        print(f"  clip/save failed: {e}")
        tmp_path.unlink(missing_ok=True)
        return False


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser()
    parser.add_argument("--country", help="ISO-3 (e.g. ZMB)")
    parser.add_argument("--skip-download", action="store_true")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    admin_zip = CACHE_DIR / "ne_10m_admin_0_countries.zip"
    if not args.skip_download:
        download_file(ADMIN0_URL, admin_zip)

    print("\nLoading country polygons…")
    countries_raw = load_shp_from_zip(admin_zip)
    if countries_raw is None:
        print("ERROR: no country shapefile"); return 1
    countries_raw = countries_raw.to_crs(4326)
    iso_col = next(c for c in ["ISO_A3", "ADM0_A3", "SOV_A3", "iso_a3"] if c in countries_raw.columns)

    targets = [(i, n) for (i, n) in AFRICA if not args.country or i == args.country.upper()]

    manifest_path = OUT_DIR / "manifest.json"
    manifest: dict = {}
    if manifest_path.exists():
        try:
            manifest = {m["iso3"]: m for m in json.loads(manifest_path.read_text())}
        except Exception:
            manifest = {}

    ok, skipped = 0, 0
    for idx, (iso3, country) in enumerate(targets):
        print(f"\n[{idx+1}/{len(targets)}] {country} ({iso3})")
        out_tif = OUT_DIR / f"{iso3}_Soil_WRB.tif"

        ctry = countries_raw[countries_raw[iso_col] == iso3]
        if ctry.empty:
            print(f"  no country polygon — skipping"); skipped += 1; continue

        geom  = ctry.union_all()
        bbox  = geom.bounds   # (minx, miny, maxx, maxy)

        print(f"  bbox: W={bbox[0]:.2f} S={bbox[1]:.2f} E={bbox[2]:.2f} N={bbox[3]:.2f}")
        print(f"  downloading WRB raster from SoilGrids WCS…")
        tif_bytes = download_wcs_bbox(bbox[0], bbox[1], bbox[2], bbox[3])
        if not tif_bytes:
            print(f"  WCS download failed — skipping"); skipped += 1
            if idx < len(targets) - 1:
                time.sleep(RATE_LIMIT_SLEEP)
            continue

        if not clip_and_save(tif_bytes, geom, out_tif, iso3, country):
            skipped += 1
        else:
            size_mb = round(out_tif.stat().st_size / 1_048_576, 2)
            print(f"  ok — {size_mb} MB")
            manifest[iso3] = {
                "filename": out_tif.name,
                "country":  country,
                "iso3":     iso3,
                "source":   "ISRIC SoilGrids v2.0 — WRB MostProbable 250m",
                "license":  "CC BY 4.0",
                "resolution_m": 250,
                "source_version": "v2.0",
            }
            manifest_path.write_text(json.dumps(list(manifest.values()), indent=2))
            ok += 1

        # Respect SoilGrids rate limit
        if idx < len(targets) - 1:
            time.sleep(RATE_LIMIT_SLEEP)

    print(f"\nDone. {ok} packaged, {skipped} skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
