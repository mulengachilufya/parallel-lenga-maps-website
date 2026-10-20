"""
soil-fertility: Topsoil Fertility by District (iSDAsoil 30 m).

Not the same thing as the existing `soil` dataset (WRB soil classes): this
one holds the soil properties farmers, input suppliers and carbon projects
ask for, as district averages.

  python scripts/district_stats/soil_fertility.py
  python scripts/district_stats/soil_fertility.py --country ZMB --workers 4

Source: iSDAsoil Africa 30 m v1 (iSDA / Innovative Solutions for Decision
Agriculture), CC BY 4.0. Read straight from the public cloud-optimised
GeoTIFFs on AWS Open Data (s3://isdasoil); nothing is downloaded whole.

THE BACK-TRANSFORM (the most common error with this dataset)
  iSDAsoil stores most properties as small integers on a log or scaled axis.
  Every pixel is converted back to real units BEFORE anything is averaged:
      pH                    x / 10
      organic carbon        exp(x / 10) - 1      g/kg
      total nitrogen        exp(x / 100) - 1     g/kg
      extractable P, K      exp(x / 10) - 1      ppm (mg/kg)
      CEC                   exp(x / 10) - 1      cmol(+)/kg
      bulk density          x / 100              g/cm³
      clay, sand, silt      x                    %
  Averaging the stored integers and converting the average would give the
  geometric mean instead of the mean (several times too low for P and K).
  Because the integers are exact codes, each district keeps an area-weighted
  histogram of codes; means and percentiles are computed from it exactly.

Masks: pixels iSDAsoil leaves empty (its masks for water, built-up land and
bare rock) are left out. valid_pct = share of the district with values.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np
import requests

from common import (CACHE_DIR, HEADERS, OUTPUT, Column, Manifest, Tile, hist_mean, hist_mode,
                    hist_percentile, load_districts, log, size_mb, targets, today, write_gpkg,
                    zonal_tiles)

SLUG   = "soil-fertility"
FOLDER = OUTPUT / "SoilFertility"
STAC_ROOT = "https://isdasoil.s3.amazonaws.com/catalog.json"
ISDA_DIR  = CACHE_DIR / "isdasoil"
ISDA_API  = "https://api.isda-africa.com"

GDAL_ENV = {"GDAL_HTTP_MAX_RETRY": "8", "GDAL_HTTP_RETRY_DELAY": "3", "GDAL_CACHEMAX": "1024",
            "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
            "GDAL_HTTP_MULTIRANGE": "YES", "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
            "VSI_CACHE": "TRUE", "VSI_CACHE_SIZE": "100000000"}


def _exp10(x):  return np.exp(x / 10.0) - 1.0
def _exp100(x): return np.exp(x / 100.0) - 1.0
def _div10(x):  return x / 10.0
def _div100(x): return x / 100.0
def _ident(x):  return x.astype(np.float64)


@dataclass
class Var:
    out:       str              # column stem
    prop:      str              # iSDAsoil property name
    depth:     str              # "0-20" or "20-50"
    unit:      str
    label:     str
    back:      Callable         # back-transform
    pct:       bool = False     # also p10 / p90
    api_name:  str = ""         # iSDA API property name for the spot check


VARS = [
    Var("ph_h2o",         "ph",                       "0-20",  "pH",         "pH in water",               _div10,  True,  "ph"),
    Var("soc_0_20_gkg",   "carbon_organic",           "0-20",  "g/kg",       "Organic carbon, 0–20 cm",   _exp10,  True,  "carbon_organic"),
    Var("soc_20_50_gkg",  "carbon_organic",           "20-50", "g/kg",       "Organic carbon, 20–50 cm",  _exp10,  True,  "carbon_organic"),
    Var("n_tot_gkg",      "nitrogen_total",           "0-20",  "g/kg",       "Total nitrogen",            _exp100, False, "nitrogen_total"),
    Var("p_ext_ppm",      "phosphorous_extractable",  "0-20",  "ppm",        "Extractable phosphorus",    _exp10,  False, "phosphorous_extractable"),
    Var("k_ext_ppm",      "potassium_extractable",    "0-20",  "ppm",        "Extractable potassium",     _exp10,  False, "potassium_extractable"),
    Var("clay_pct",       "clay_content",             "0-20",  "%",          "Clay content",              _ident,  False, "clay_content"),
    Var("sand_pct",       "sand_content",             "0-20",  "%",          "Sand content",              _ident,  False, "sand_content"),
    Var("silt_pct",       "silt_content",             "0-20",  "%",          "Silt content",              _ident,  False, "silt_content"),
    Var("cec_cmolkg",     "cation_exchange_capacity", "0-20",  "cmol(+)/kg", "Cation exchange capacity",  _exp10,  False, "cation_exchange_capacity"),
    Var("bd_gcm3",        "bulk_density",             "0-20",  "g/cm³",      "Bulk density",              _div100, False, "bulk_density"),
]
TEXTURE = Var("texture_usda", "texture_class", "0-20", "", "USDA texture class (most common)", _ident)

# iSDAsoil texture_class codes (USDA texture triangle).
TEXTURE_NAMES = {1: "Clay", 2: "Silty clay", 3: "Sandy clay", 4: "Clay loam", 5: "Silty clay loam",
                 6: "Sandy clay loam", 7: "Loam", 8: "Silt loam", 9: "Sandy loam", 10: "Silt",
                 11: "Loamy sand", 12: "Sand"}

# Filled in main() before the worker pool forks (workers inherit them).
NODATA: list[Optional[float]] = []


# ── Finding the files (STAC catalogue on the bucket) ─────────────────────────

def _get(url: str) -> dict:
    r = requests.get(url, headers=HEADERS, timeout=120)
    r.raise_for_status()
    return r.json()


def stac_assets() -> dict[tuple[str, str], dict]:
    """
    (property, depth) -> {"href":…, "title":…, "description":…} for the MEAN
    layers, found by walking the iSDAsoil STAC catalogue. Cached to disk.
    """
    cache = ISDA_DIR / "assets.json"
    if cache.exists():
        raw = json.loads(cache.read_text())
        return {tuple(k.split("|")): v for k, v in raw.items()}
    from urllib.parse import urljoin
    found: dict[tuple[str, str], dict] = {}
    queue, seen = [STAC_ROOT], set()
    while queue:
        url = queue.pop()
        if url in seen:
            continue
        seen.add(url)
        doc = _get(url)
        for link in doc.get("links", []):
            if link.get("rel") in ("child", "item"):
                queue.append(urljoin(url, link["href"]))
        if doc.get("type") == "Feature":
            prop = str(doc.get("id", "")).lower()
            for key, a in doc.get("assets", {}).items():
                text = f"{key} {a.get('title', '')}".lower().replace("_", "-").replace(" ", "-")
                if "mean" not in text or any(s in text for s in ("sd", "stdev", "std", "uncert")):
                    continue
                depth = "0-20" if "0-20" in text else "20-50" if "20-50" in text else None
                href = urljoin(url, a["href"])
                if depth and href.lower().endswith((".tif", ".tiff")):
                    for p in [v.prop for v in VARS] + [TEXTURE.prop]:
                        if p in prop or p in href.lower():
                            found[(p, depth)] = {"href": href, "title": a.get("title", ""),
                                                 "description": doc.get("properties", {}).get("description", "")
                                                 or a.get("description", "")}
    ISDA_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({f"{k[0]}|{k[1]}": v for k, v in found.items()}, indent=1))
    return found


def layer_urls() -> list[str]:
    assets = stac_assets()
    urls, missing = [], []
    for v in VARS + [TEXTURE]:
        a = assets.get((v.prop, v.depth))
        if not a:
            missing.append(f"{v.prop} {v.depth}")
            continue
        urls.append(a["href"])
        log(f"  {v.out:15s} ← {a['href']}")
        if a.get("description"):
            log(f"    catalogue says: {a['description'][:200]}")
    if missing:
        raise SystemExit(f"iSDAsoil: no mean layer found for {missing}. Assets seen: {sorted(assets)}")
    return urls


# ── Raster work ──────────────────────────────────────────────────────────────

def soil_codes(arrays):
    out = []
    for a, nd in zip(arrays, NODATA):
        valid = a != nd if nd is not None else None
        out.append((a, valid))
    # Extra histogram: every pixel of the district (for valid_pct).
    out.append((np.zeros_like(arrays[0]), None))
    return out


def chunk_tiles(urls: list[str], bounds: list[tuple], step: float = 5.0) -> list[Tile]:
    tiles = []
    minx = math.floor(min(b[0] for b in bounds) / step) * step
    maxx = math.ceil(max(b[2] for b in bounds) / step) * step
    miny = math.floor(min(b[1] for b in bounds) / step) * step
    maxy = math.ceil(max(b[3] for b in bounds) / step) * step
    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            box = (x, y, x + step, y + step)
            if any(b[0] < box[2] and b[2] > box[0] and b[1] < box[3] and b[3] > box[1] for b in bounds):
                tiles.append(Tile(key=f"isda_{x:+.0f}_{y:+.0f}", paths=[f"/vsicurl/{u}" for u in urls], bbox=box))
            y += step
        x += step
    return tiles


# ── Output ───────────────────────────────────────────────────────────────────

def columns() -> list[Column]:
    cols = [
        Column("shapeID", "", "geoBoundaries unique district ID"),
        Column("shapeName", "", "District name (geoBoundaries)"),
        Column("adm1_name", "", "Province / region name (geoBoundaries ADM1)"),
        Column("iso3", "", "ISO 3166-1 alpha-3 country code"),
        Column("admin_level", "", "2 = district (ADM2); 1 where geoBoundaries has no ADM2"),
    ]
    for v in VARS:
        cols.append(Column(f"{v.out}_mean", v.unit, f"{v.label}: area-weighted mean ({v.depth} cm), back-transformed"))
        if v.pct:
            cols.append(Column(f"{v.out}_p10", v.unit, f"{v.label}: 10th percentile by area ({v.depth} cm)"))
            cols.append(Column(f"{v.out}_p90", v.unit, f"{v.label}: 90th percentile by area ({v.depth} cm)"))
    cols += [
        Column("texture_usda", "", "Most common USDA texture class, 0–20 cm (by area)"),
        Column("texture_usda_code", "", "iSDAsoil texture_class code of texture_usda (1–12)"),
        Column("valid_pct", "%", "Share of the district with iSDAsoil values (water, built-up land and bare rock are masked out)"),
    ]
    return cols


def write_country(iso3, country, districts, hists, layer_info) -> dict:
    gdf = districts.gdf.copy()
    codes = np.arange(256, dtype=np.float64)
    for v, h in zip(VARS, hists[:len(VARS)]):
        vals = v.back(codes)
        gdf[f"{v.out}_mean"] = np.round(hist_mean(h, vals), 3)
        if v.pct:
            gdf[f"{v.out}_p10"] = np.round(hist_percentile(h, vals, 0.10), 3)
            gdf[f"{v.out}_p90"] = np.round(hist_percentile(h, vals, 0.90), 3)
    tex = hist_mode(hists[len(VARS)])
    gdf["texture_usda"] = [TEXTURE_NAMES.get(int(c)) if c > 0 else None for c in tex]
    gdf["texture_usda_code"] = np.where(tex > 0, tex, np.nan)
    valid = hists[0].sum(axis=1)
    every = hists[-1].sum(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        gdf["valid_pct"] = np.round(np.where(every > 0, valid / every * 100, np.nan), 2)

    meta = {
        "title": f"Topsoil Fertility by District (iSDAsoil 30 m): {country}",
        "summary": f"pH, organic carbon, N, P, K, texture, CEC and bulk density per district of {country}, from iSDAsoil Africa 30 m v1.",
        "dataset": SLUG, "country": country, "iso3": iso3,
        "source": "iSDAsoil Africa 30 m v1 (iSDA)",
        "source_version": "v1 (0–20 cm; 20–50 cm for organic carbon)",
        "source_url": "https://registry.opendata.aws/isdasoil/",
        "license": "CC BY 4.0 (iSDAsoil); district boundaries: " + str(districts.meta.get("boundary_license")),
        "citation": ("Hengl, T., Miller, M.A.E., Križan, J., et al. (2021). African soil properties and nutrients "
                     "mapped at 30 m spatial resolution using two-scale ensemble machine learning. "
                     "Scientific Reports 11, 6130. https://doi.org/10.1038/s41598-021-85639-y. "
                     "Data: iSDAsoil, https://www.isda-africa.com/isdasoil/"),
        "back_transform": {v.out: v.back.__name__.lstrip("_") for v in VARS},
        "back_transform_formulas": {"div10": "x/10", "exp10": "exp(x/10)-1", "exp100": "exp(x/100)-1",
                                    "div100": "x/100", "ident": "x"},
        "layers": layer_info,
        "boundaries": districts.meta,
        "method": ("Every 30 m pixel is back-transformed to real units, then averaged by area within the district "
                   "(pixel centre in district). Percentiles are by area. Masked pixels are left out."),
        "crs": "EPSG:4326", "processing_date": today(), "producer": "Lenga Maps (lengamaps.com)",
    }
    out = FOLDER / f"{iso3}_SoilFertility.gpkg"
    write_gpkg(out, "soil_fertility", gdf, columns(), meta)
    return {
        "filename": out.name, "country": country, "iso3": iso3,
        "district_count": districts.n, "admin_level": districts.admin_level,
        "file_size_mb": size_mb(out),
        "valid_pct_median": float(np.nanmedian(gdf["valid_pct"])) if gdf["valid_pct"].notna().any() else None,
        "ph_range": [float(np.nanmin(gdf["ph_h2o_mean"])), float(np.nanmax(gdf["ph_h2o_mean"]))]
                    if gdf["ph_h2o_mean"].notna().any() else None,
        "source": "iSDAsoil Africa 30 m v1", "source_version": "v1", "license": "CC BY 4.0",
        "boundary_license": districts.meta.get("boundary_license"),
    }


# ── Spot check against the iSDA API ──────────────────────────────────────────

def spot_check(urls: list[str], dist: dict, n: int = 20, seed: int = 7) -> dict:
    """
    20 random points: our back-transformed pixel value vs the iSDAsoil API.
    Needs ISDA_USERNAME / ISDA_PASSWORD (free account at isda-africa.com).
    Writes output/SoilFertility/spot_check.json for the QA step.
    """
    import rasterio
    from shapely.geometry import Point
    user, pw = os.environ.get("ISDA_USERNAME"), os.environ.get("ISDA_PASSWORD")
    result = {"points": [], "status": "not_run"}
    if not (user and pw):
        result["status"] = "no_credentials"
        log("  spot check: ISDA_USERNAME / ISDA_PASSWORD not set — skipped (QA will report it)")
        (FOLDER / "spot_check.json").write_text(json.dumps(result, indent=2))
        return result
    tok = requests.post(f"{ISDA_API}/login", data={"username": user, "password": pw}, timeout=60)
    tok.raise_for_status()
    headers = {"Authorization": f"Bearer {tok.json()['access_token']}"}

    rng = random.Random(seed)
    pool = [(iso3, g) for iso3, d in dist.items() for g in d.gdf.geometry.values]
    with rasterio.Env(**GDAL_ENV):
        srcs = [rasterio.open(f"/vsicurl/{u}") for u in urls]
        tries = 0
        while len(result["points"]) < n and tries < n * 20:
            tries += 1
            iso3, g = rng.choice(pool)
            minx, miny, maxx, maxy = g.bounds
            p = Point(rng.uniform(minx, maxx), rng.uniform(miny, maxy))
            if not g.contains(p):
                continue
            from rasterio.warp import transform as wt
            xs, ys = wt("EPSG:4326", srcs[0].crs, [p.x], [p.y])
            raw = [next(s.sample([(xs[0], ys[0])]))[0] for s in srcs[:len(VARS)]]
            if raw[0] == NODATA[0]:
                continue
            row = {"iso3": iso3, "lon": round(p.x, 6), "lat": round(p.y, 6), "values": {}}
            for v, x in zip(VARS, raw):
                ours = float(v.back(np.float64(x)))
                r = requests.get(f"{ISDA_API}/isdasoil/v2/soilproperty", headers=headers, timeout=60,
                                 params={"lat": p.y, "lon": p.x, "property": v.api_name, "depth": v.depth})
                theirs = None
                if r.ok:
                    try:
                        prop = r.json()["property"][v.api_name]
                        theirs = next(e["value"]["value"] for e in prop if e["depth"]["value"] == v.depth)
                    except (KeyError, StopIteration, TypeError):
                        theirs = None
                row["values"][v.out] = {"raw": int(x), "ours": round(ours, 3), "api": theirs}
            result["points"].append(row)
        for s in srcs:
            s.close()
    result["status"] = "ok"
    (FOLDER / "spot_check.json").write_text(json.dumps(result, indent=2))
    return result


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", help="ISO-3 code(s), comma separated")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--chunk-deg", type=float, default=5.0)
    args = ap.parse_args()

    import rasterio
    todo = targets(args.country)
    log("Finding iSDAsoil layers…")
    urls = layer_urls()
    layer_info, grid = [], None
    with rasterio.Env(**GDAL_ENV):
        for u in urls:
            with rasterio.open(f"/vsicurl/{u}") as ds:
                g = (ds.crs.to_string(), tuple(round(c, 6) for c in ds.transform[:6]), ds.width, ds.height)
                if grid is None:
                    grid = g
                elif g != grid:
                    raise SystemExit(f"iSDAsoil layers are not on one grid: {u}")
                if ds.dtypes[0] not in ("uint8", "int8"):
                    raise SystemExit(f"{u}: expected 8-bit codes, found {ds.dtypes[0]}")
                NODATA.append(ds.nodata)
                layer_info.append({"url": u, "nodata": ds.nodata, "crs": ds.crs.to_string(),
                                   "res_m": abs(ds.transform.a)})
    log(f"  grid: {grid[0]}, {grid[2]}×{grid[3]} px")

    log("Loading districts…")
    dist = {iso3: load_districts(iso3) for iso3, _ in todo}
    geoms = {iso3: list(d.gdf.geometry.values) for iso3, d in dist.items()}
    bounds = [tuple(d.gdf.total_bounds) for d in dist.values()]
    tag = "all" if not args.country else "_".join(sorted(geoms))

    FOLDER.mkdir(parents=True, exist_ok=True)
    spot_check(urls, dist)

    n_codes = [256] * (len(VARS) + 1) + [1]
    hists = zonal_tiles(chunk_tiles(urls, bounds, args.chunk_deg), geoms, n_codes, soil_codes,
                        checkpoint=CACHE_DIR / "checkpoints" / f"soil_{tag}", workers=args.workers,
                        env=GDAL_ENV, block=2048)

    manifest = Manifest(FOLDER)
    failed = []
    for iso3, country in todo:
        try:
            manifest.put(write_country(iso3, country, dist[iso3], [h[1:] for h in hists[iso3]], layer_info))
            log(f"  ✓ {iso3}")
        except Exception as err:
            log(f"  [{iso3}] FAILED: {type(err).__name__}: {err}")
            failed.append(iso3)
    log(f"\nsoil-fertility: {len(todo) - len(failed)} packaged, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
