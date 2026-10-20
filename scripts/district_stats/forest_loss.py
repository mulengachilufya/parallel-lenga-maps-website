"""
forest-loss: Forest Cover and Tree Cover Loss by District (EUDR-ready).

For each of the 54 countries: one GeoPackage, one polygon per district
(geoBoundaries ADM2), with tree cover in 2000, tree cover loss per year,
loss since the EUDR cut-off (31 Dec 2020) and JRC forest cover in 2020.

  python scripts/district_stats/forest_loss.py                 # all countries
  python scripts/district_stats/forest_loss.py --country CIV,COD,ZMB
  python scripts/district_stats/forest_loss.py --workers 4

Sources
  * Hansen/UMD/Google/USGS/NASA Global Forest Change (GFC), 30 m, CC BY 4.0.
    The newest published version is used (v1.13 = 2000–2025 when it is out,
    else v1.12 = 2000–2024); --hansen-version forces one.
  * EC JRC Global Forest Cover 2020 (GFC2020), 10 m, the EUDR reference map.
    Its licence is checked on the JRC data catalogue before the column is
    produced; if the catalogue does not state CC BY 4.0 the column is left
    out and the run says so (--skip-jrc leaves it out regardless).

Method
  * tc2000_ha: area of pixels with treecover2000 ≥ 30 % (Hansen's default).
  * loss_YYYY_ha: area of pixels whose lossyear is YYYY, counted only inside
    that ≥ 30 % tree cover.
  * forest2020_ha: area of JRC GFC2020 forest pixels.
  * Every pixel counts with its own area on the WGS84 ellipsoid (in ha), and
    belongs to the district that contains its centre.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import numpy as np
import requests

from common import (CACHE_DIR, HEADERS, OUTPUT, Column, Manifest, Tile,
                    load_districts, log, size_mb, targets, today, write_gpkg, zonal_tiles)

SLUG    = "forest-loss"
FOLDER  = OUTPUT / "ForestLoss"
HANSEN_BASE = "https://storage.googleapis.com/earthenginepartners-hansen"
HANSEN_VERSIONS = [("GFC-2025-v1.13", 2025), ("GFC-2024-v1.12", 2024)]
HANSEN_DIR = CACHE_DIR / "hansen"
JRC_BASE = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/FOREST/GFC2020/LATEST/"
JRC_CATALOGUE = "https://data.jrc.ec.europa.eu/dataset/10d1b337-b7d1-4938-a048-686c8185b290"
JRC_DIR = CACHE_DIR / "jrc_gfc2020"
CANOPY = 30
EUDR_CUTOFF_YEAR = 2020     # loss "since 2021" = after 31 Dec 2020

FIELD_NOTE = ("Tree cover loss is not the same as deforestation: it includes plantation "
              "harvest and fire. GFC2020 overestimates forest in cocoa and coffee agroforestry.")

GDAL_ENV = {"GDAL_HTTP_MAX_RETRY": "5", "GDAL_HTTP_RETRY_DELAY": "2", "GDAL_CACHEMAX": "512",
            "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif"}


# ── Hansen ───────────────────────────────────────────────────────────────────

def _exists(url: str) -> bool:
    try:
        r = requests.head(url, headers=HEADERS, timeout=60, allow_redirects=True)
        return r.status_code == 200
    except requests.RequestException:
        return False


def hansen_version(forced: str | None) -> tuple[str, int]:
    if forced:
        for v, y in HANSEN_VERSIONS:
            if v == forced:
                return v, y
        m = re.match(r"GFC-(\d{4})-v1\.\d+", forced)
        if not m:
            raise SystemExit(f"Unrecognised Hansen version {forced}")
        return forced, int(m.group(1))
    for v, y in HANSEN_VERSIONS:
        # "Released and documented": the version's download page AND its tiles exist.
        if _exists(f"{HANSEN_BASE}/{v}/download.html") and \
           _exists(f"{HANSEN_BASE}/{v}/Hansen_{v}_lossyear_00N_020E.tif"):
            return v, y
    raise SystemExit("No Hansen GFC version reachable")


def _lat_label(top: int) -> str:
    return f"{abs(top):02d}{'N' if top >= 0 else 'S'}"


def _lon_label(left: int) -> str:
    return f"{abs(left):03d}{'E' if left >= 0 else 'W'}"


def hansen_tiles(version: str, bounds: list[tuple], keep: bool) -> list[Tile]:
    tiles = []
    for top in range(40, -40, -10):
        for left in range(-30, 60, 10):
            box = (left, top - 10, left + 10, top)
            if not any(b[0] < box[2] and b[2] > box[0] and b[1] < box[3] and b[3] > box[1] for b in bounds):
                continue
            name = f"{_lat_label(top)}_{_lon_label(left)}"

            files = [f"Hansen_{version}_{layer}_{name}.tif" for layer in ("treecover2000", "lossyear")]
            tiles.append(Tile(key=f"hansen_{name}", cleanup=not keep,
                              downloads=[(f"{HANSEN_BASE}/{version}/{fn}", str(HANSEN_DIR / version / fn)) for fn in files]))
    return tiles


def hansen_codes(arrays):
    tc, ly = arrays
    cls = np.where(tc >= CANOPY, ly.astype(np.int16) + 1, 0)
    return [(cls, None)]


# ── JRC GFC2020 ──────────────────────────────────────────────────────────────

def jrc_licence_ok() -> tuple[bool, str]:
    """Read the licence from the JRC data catalogue rather than assuming it."""
    try:
        r = requests.get(JRC_CATALOGUE, headers=HEADERS, timeout=60)
        r.raise_for_status()
    except requests.RequestException as err:
        return False, f"could not read the JRC catalogue ({err})"
    text = r.text
    if re.search(r"creativecommons\.org/licenses/by/4\.0|CC[- ]BY[- ]4\.0|Creative Commons Attribution 4\.0", text, re.I):
        return True, "CC BY 4.0 (stated on the JRC data catalogue)"
    return False, "the JRC catalogue page does not state CC BY 4.0"


def _links(url: str) -> list[str]:
    r = requests.get(url, headers=HEADERS, timeout=120)
    r.raise_for_status()
    return [urljoin(url, h) for h in re.findall(r'href="([^"?#]+)"', r.text)
            if not h.startswith(("/", "..", "http")) or h.startswith(url)]


def jrc_index() -> list[dict]:
    """Every GFC2020 tile with its bounds, found by walking the FTP listing."""
    idx_path = JRC_DIR / "index.json"
    if idx_path.exists():
        return json.loads(idx_path.read_text())
    import rasterio
    tifs, queue, seen = [], [JRC_BASE], set()
    while queue:
        url = queue.pop()
        if url in seen:
            continue
        seen.add(url)
        for link in _links(url):
            if link.lower().endswith((".tif", ".tiff")):
                tifs.append(link)
            elif link.endswith("/") and link.startswith(JRC_BASE) and link.count("/") - JRC_BASE.count("/") <= 2:
                queue.append(link)
    tifs = sorted(set(tifs))
    log(f"  JRC GFC2020: {len(tifs)} tiles listed; reading their extents…")
    out = []
    with rasterio.Env(**GDAL_ENV):
        for url in tifs:
            with rasterio.open(f"/vsicurl/{url}") as ds:
                b = ds.bounds if ds.crs.is_geographic else rasterio.warp.transform_bounds(ds.crs, 4326, *ds.bounds)
                out.append({"url": url, "bounds": list(b)})
    JRC_DIR.mkdir(parents=True, exist_ok=True)
    idx_path.write_text(json.dumps(out, indent=1))
    return out


def jrc_tiles(bounds: list[tuple], keep: bool) -> list[Tile]:
    tiles = []
    for t in jrc_index():
        b = t["bounds"]
        if not any(c[0] < b[2] and c[2] > b[0] and c[1] < b[3] and c[3] > b[1] for c in bounds):
            continue
        url, fn = t["url"], t["url"].rsplit("/", 1)[-1]
        tiles.append(Tile(key=f"jrc_{fn}", downloads=[(url, str(JRC_DIR / fn))], cleanup=not keep))
    return tiles


def jrc_codes(arrays):
    (v,) = arrays
    return [((v == 1).astype(np.uint8), None)]


# ── Output ───────────────────────────────────────────────────────────────────

def columns(level: int, years: list[int], with_jrc: bool) -> list[Column]:
    cols = [
        Column("shapeID", "", "geoBoundaries unique district ID"),
        Column("shapeName", "", "District name (geoBoundaries)"),
        Column("adm1_name", "", "Province / region name (geoBoundaries ADM1)"),
        Column("iso3", "", "ISO 3166-1 alpha-3 country code"),
        Column("admin_level", "", "2 = district (ADM2); 1 where geoBoundaries has no ADM2"),
        Column("district_ha", "ha", "District area (ellipsoidal)"),
        Column("tc2000_ha", "ha", f"Tree cover in 2000 at ≥{CANOPY}% canopy (Hansen GFC)"),
    ]
    cols += [Column(f"loss_{y}_ha", "ha", f"Tree cover loss in {y}, inside ≥{CANOPY}% tree cover of 2000") for y in years]
    cols += [
        Column("loss_total_ha", "ha", f"Tree cover loss {years[0]}–{years[-1]}"),
        Column("loss_since_2021_ha", "ha", f"Tree cover loss after the EUDR cut-off of 31 Dec 2020 (2021–{years[-1]})"),
        Column("pct_loss_since_2000", "%", "loss_total_ha / tc2000_ha × 100"),
    ]
    if with_jrc:
        cols.append(Column("forest2020_ha", "ha", "Forest cover in 2020, EC JRC GFC2020 (EUDR reference map)"))
    return cols


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", help="ISO-3 code(s), comma separated")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--hansen-version")
    ap.add_argument("--skip-jrc", action="store_true")
    ap.add_argument("--keep-tiles", action="store_true", help="keep downloaded tiles (default: delete after use)")
    args = ap.parse_args()

    todo = targets(args.country)
    log("Loading districts…")
    dist = {iso3: load_districts(iso3) for iso3, _ in todo}
    geoms = {iso3: list(d.gdf.geometry.values) for iso3, d in dist.items()}
    bounds = [tuple(d.gdf.total_bounds) for d in dist.values()]
    tag = "all" if not args.country else "_".join(sorted(geoms))

    version, last_year = hansen_version(args.hansen_version)
    years = list(range(2001, last_year + 1))
    log(f"Hansen {version}: loss years {years[0]}–{years[-1]}")
    hans = zonal_tiles(hansen_tiles(version, bounds, args.keep_tiles), geoms, [len(years) + 2], hansen_codes,
                       checkpoint=CACHE_DIR / "checkpoints" / f"forest_hansen_{version}_{tag}",
                       workers=args.workers, env=GDAL_ENV)

    with_jrc, jrc_note = False, "skipped (--skip-jrc)"
    jrc = {}
    if not args.skip_jrc:
        with_jrc, jrc_note = jrc_licence_ok()
        if with_jrc:
            log(f"JRC GFC2020 licence: {jrc_note}")
            jrc = zonal_tiles(jrc_tiles(bounds, args.keep_tiles), geoms, [2], jrc_codes,
                              checkpoint=CACHE_DIR / "checkpoints" / f"forest_jrc_{tag}",
                              workers=args.workers, env=GDAL_ENV)
        else:
            log(f"!! JRC GFC2020 column LEFT OUT: {jrc_note}")

    manifest = Manifest(FOLDER)
    failed = []
    for iso3, country in todo:
        try:
            manifest.put(write_country(iso3, country, dist[iso3], hans[iso3][0][1:],
                                       jrc[iso3][0][1:] if with_jrc else None,
                                       version, years, jrc_note))
            log(f"  ✓ {iso3}")
        except Exception as err:
            log(f"  [{iso3}] FAILED: {type(err).__name__}: {err}")
            failed.append(iso3)
    log(f"\nforest-loss: {len(todo) - len(failed)} packaged, {len(failed)} failed")
    return 1 if failed else 0


def write_country(iso3, country, districts, h, hj, version, years, jrc_note) -> dict:
    import geopandas as gpd
    gdf = districts.gdf.copy()
    gdf["district_ha"] = (gpd.GeoSeries(gdf.geometry, crs=4326).to_crs("+proj=cea +datum=WGS84").area / 10_000).round(1)
    forest = h[:, 1:]                       # code ≥ 1 = inside ≥30% tree cover
    gdf["tc2000_ha"] = forest.sum(axis=1).round(2)
    loss = h[:, 2:2 + len(years)]          # code 1 + year offset = loss in that year
    for k, y in enumerate(years):
        gdf[f"loss_{y}_ha"] = loss[:, k].round(2)
    gdf["loss_total_ha"] = loss.sum(axis=1).round(2)
    gdf["loss_since_2021_ha"] = loss[:, (EUDR_CUTOFF_YEAR + 1 - 2001):].sum(axis=1).round(2)
    with np.errstate(invalid="ignore", divide="ignore"):
        pct = np.where(gdf["tc2000_ha"] > 0, loss.sum(axis=1) / forest.sum(axis=1) * 100, np.nan)
    gdf["pct_loss_since_2000"] = np.round(pct, 3)
    if hj is not None:
        gdf["forest2020_ha"] = hj[:, 1].round(2)

    meta = {
        "title": f"Forest Cover and Tree Cover Loss by District: {country}",
        "summary": (f"Tree cover 2000 (≥{CANOPY}% canopy), yearly tree cover loss {years[0]}–{years[-1]}, "
                    f"loss since the EUDR cut-off and JRC forest cover 2020 per district of {country}."),
        "dataset": SLUG, "country": country, "iso3": iso3,
        "sources": [
            {"name": "Hansen/UMD/Google/USGS/NASA Global Forest Change", "version": version,
             "license": "CC BY 4.0", "url": "https://glad.earthengine.app/view/global-forest-change",
             "citation": ("Hansen, M. C., P. V. Potapov, R. Moore, M. Hancher, S. A. Turubanova, A. Tyukavina, "
                          "D. Thau, S. V. Stehman, S. J. Goetz, T. R. Loveland, A. Kommareddy, A. Egorov, L. Chini, "
                          "C. O. Justice, and J. R. G. Townshend. 2013. High-Resolution Global Maps of "
                          "21st-Century Forest Cover Change. Science 342 (15 November): 850–53. "
                          f"Data available on-line from: https://glad.earthengine.app/view/global-forest-change ({version}).")},
            {"name": "EC JRC Global Forest Cover 2020 (GFC2020)", "version": "LATEST",
             "license": jrc_note, "url": JRC_CATALOGUE, "included": hj is not None,
             "citation": ("Bourgoin, C., Verhegghen, A., Degreve, L., Ameztoy, I., Carboni, S., Colditz, R., "
                          "Achard, F. (2024). Global map of forest cover 2020 – version 2. European Commission, "
                          "Joint Research Centre (JRC). http://data.europa.eu/89h/e554d6fb-6340-45d5-9309-332337e5bc26")},
        ],
        "license": "CC BY 4.0 (Hansen GFC; JRC GFC2020); district boundaries: " + str(districts.meta.get("boundary_license")),
        "boundaries": districts.meta,
        "canopy_threshold_pct": CANOPY,
        "eudr_cutoff": "2020-12-31",
        "field_note": FIELD_NOTE,
        "method": "Pixel areas on the WGS84 ellipsoid; each pixel counts for the district containing its centre.",
        "crs": "EPSG:4326", "processing_date": today(), "producer": "Lenga Maps (lengamaps.com)",
    }
    out = FOLDER / f"{iso3}_ForestLoss.gpkg"
    write_gpkg(out, "forest_loss", gdf, columns(districts.admin_level, years, hj is not None), meta)
    return {
        "filename": out.name, "country": country, "iso3": iso3,
        "district_count": districts.n, "admin_level": districts.admin_level,
        "file_size_mb": size_mb(out),
        "tc2000_ha": round(float(gdf["tc2000_ha"].sum()), 1),
        "loss_total_ha": round(float(gdf["loss_total_ha"].sum()), 1),
        "loss_since_2021_ha": round(float(gdf["loss_since_2021_ha"].sum()), 1),
        "loss_by_year_ha": {str(y): round(float(gdf[f"loss_{y}_ha"].sum()), 1) for y in years},
        "forest2020_ha": round(float(gdf["forest2020_ha"].sum()), 1) if hj is not None else None,
        "year_start": years[0], "year_end": years[-1],
        "source": f"Hansen/UMD GFC {version}" + (" + JRC GFC2020" if hj is not None else ""),
        "source_version": version, "license": "CC BY 4.0",
        "boundary_license": districts.meta.get("boundary_license"),
        "field_note": FIELD_NOTE,
    }


if __name__ == "__main__":
    sys.exit(main())
