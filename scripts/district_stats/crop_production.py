"""
crop-production: Crop Production by District (MapSPAM 2020).

For each of the 54 countries: one GeoPackage, one polygon per district
(geoBoundaries ADM2), with physical area, harvested area, production and
yield of the 15 crops that matter most in Africa, plus an attribute table
(crops_long) with all 46 SPAM crops.

  python scripts/district_stats/crop_production.py
  python scripts/district_stats/crop_production.py --country ZMB,KEN

Source: IFPRI, Global Spatially-Disaggregated Crop Production Statistics
Data for 2020 Version 1.0 (SPAM 2020 v1.0), Harvard Dataverse,
doi:10.7910/DVN/SWPENT. CC BY 4.0. 5 arc-minute grid.

How a district total is built
-----------------------------
SPAM publishes one row per 5-arcmin cell, already assigned to a country.
For each of the country's cells we take the share of the cell's area that
falls in each district (exactextract coverage fractions) and split the
cell's hectares and tonnes in those shares. Shares are taken of the part of
the cell that lies inside the country's districts, so a coastal or border
cell gives all of its crop to the country's districts rather than losing
the part over the sea or across a border that SPAM already accounted for.
A SPAM cell no district touches at all (a boundary mismatch, usually a few
coastal cells) goes to the nearest district. Country totals therefore
reproduce SPAM's own national totals, which the QA step checks (±1 %).

Units: area in hectares, production in metric tonnes, yield in kg/ha
(production ÷ harvested area; empty where harvested area is 0). Every
value is for all production systems together (SPAM technology "A").
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from common import (CACHE_DIR, OUTPUT, Column, Manifest, download, load_districts,
                    log, run_countries, size_mb, today, write_gpkg)

SLUG     = "crop-production"
FOLDER   = OUTPUT / "CropProduction"
SPAM_DIR = CACHE_DIR / "spam2020"
DOI      = "doi:10.7910/DVN/SWPENT"
DATAVERSE = "https://dataverse.harvard.edu"
RES      = 1 / 12          # 5 arc-minutes
VARIABLES = {"A": "phys_ha", "H": "harv_ha", "P": "prod_t"}

CROP_NAMES = {
    "whea": "wheat", "rice": "rice", "maiz": "maize", "barl": "barley",
    "mill": "pearl millet", "smil": "small millet", "sorg": "sorghum",
    "ocer": "other cereals", "pota": "potato", "swpo": "sweet potato",
    "yams": "yams", "cass": "cassava", "orts": "other roots", "bean": "bean",
    "chic": "chickpea", "cowp": "cowpea", "pige": "pigeon pea", "lent": "lentil",
    "opul": "other pulses", "soyb": "soybean", "grou": "groundnut",
    "cnut": "coconut", "oilp": "oil palm", "sunf": "sunflower", "rape": "rapeseed",
    "sesa": "sesame seed", "ooil": "other oil crops", "sugc": "sugarcane",
    "sugb": "sugar beet", "cott": "cotton", "ofib": "other fibre crops",
    "acof": "arabica coffee", "rcof": "robusta coffee", "coco": "cocoa",
    "teas": "tea", "toba": "tobacco", "bana": "banana", "plnt": "plantain",
    "citr": "citrus", "trof": "other tropical fruit", "temf": "temperate fruit",
    "toma": "tomato", "onio": "onion", "vege": "other vegetables",
    "rubb": "rubber", "rest": "rest of crops",
}

# The 15 headline crops: column prefix -> SPAM codes added together.
MAIN_CROPS = {
    "maize": ["maiz"], "cassava": ["cass"], "sorghum": ["sorg"],
    "millet": ["mill", "smil"], "rice": ["rice"], "wheat": ["whea"],
    "beans": ["bean"], "groundnut": ["grou"], "soybean": ["soyb"],
    "cocoa": ["coco"], "coffee": ["acof", "rcof"], "cotton": ["cott"],
    "tobacco": ["toba"], "sugarcane": ["sugc"], "banana_plantain": ["bana", "plnt"],
}

# SPAM 2020 identifies countries by FIPS 10-4 code (FIPS0) and/or name.
FIPS_TO_ISO3 = {
    "AG": "DZA", "AO": "AGO", "BN": "BEN", "BC": "BWA", "UV": "BFA", "BY": "BDI",
    "CV": "CPV", "CM": "CMR", "CT": "CAF", "CD": "TCD", "CN": "COM", "CF": "COG",
    "CG": "COD", "IV": "CIV", "DJ": "DJI", "EG": "EGY", "EK": "GNQ", "ER": "ERI",
    "WZ": "SWZ", "ET": "ETH", "GB": "GAB", "GA": "GMB", "GH": "GHA", "GV": "GIN",
    "PU": "GNB", "KE": "KEN", "LT": "LSO", "LI": "LBR", "LY": "LBY", "MA": "MDG",
    "MI": "MWI", "ML": "MLI", "MR": "MRT", "MP": "MUS", "MO": "MAR", "MZ": "MOZ",
    "WA": "NAM", "NG": "NER", "NI": "NGA", "RW": "RWA", "TP": "STP", "SG": "SEN",
    "SE": "SYC", "SL": "SLE", "SO": "SOM", "SF": "ZAF", "OD": "SSD", "SU": "SDN",
    "TZ": "TZA", "TO": "TGO", "TS": "TUN", "UG": "UGA", "ZA": "ZMB", "ZI": "ZWE",
}

CITATION = ("International Food Policy Research Institute (IFPRI), 2024. Global "
            "Spatially-Disaggregated Crop Production Statistics Data for 2020 Version 1.0. "
            "Harvard Dataverse, https://doi.org/10.7910/DVN/SWPENT")


# ── SPAM tables ──────────────────────────────────────────────────────────────

def spam_files() -> dict[str, Path]:
    """Download the SPAM 2020 per-cell CSVs (one per variable) from Dataverse."""
    listing = SPAM_DIR / "dataset.json"
    download(f"{DATAVERSE}/api/datasets/:persistentId/?persistentId={DOI}", listing)
    files = json.loads(listing.read_text())["data"]["latestVersion"]["files"]
    found: dict[str, Path] = {}
    for f in files:
        df = f["dataFile"]
        name = df.get("filename", "")
        if "csv" not in name.lower():
            continue
        for var in VARIABLES:
            # e.g. spam2020V1r0_global_physical_area.csv.zip / ..._P_TA.csv
            pat = {"A": r"physical|_A_T?A\b|_A\.", "H": r"harvest|_H_T?A\b|_H\.",
                   "P": r"production|_P_T?A\b|_P\."}[var]
            if re.search(pat, name, re.I) and var not in found:
                found[var] = download(f"{DATAVERSE}/api/access/datafile/{df['id']}", SPAM_DIR / name)
    missing = set(VARIABLES) - set(found)
    if missing:
        raise RuntimeError(f"SPAM 2020: no CSV found for {sorted(missing)} in {DOI}; "
                           f"files listed: {[f['dataFile'].get('filename') for f in files]}")
    return found


def _read_csv(path: Path) -> pd.DataFrame:
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as zf:
            names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            with zf.open(names[0]) as fh:
                return pd.read_csv(io.TextIOWrapper(fh, encoding="latin-1"), low_memory=False)
    return pd.read_csv(path, encoding="latin-1", low_memory=False)


_TABLES: dict[str, pd.DataFrame] = {}


def spam_table(var: str) -> pd.DataFrame:
    """Per-cell table for one variable: iso3, x, y, <crop> (46 columns)."""
    if var in _TABLES:
        return _TABLES[var]
    cache = SPAM_DIR / f"africa_{var}.parquet"
    if cache.exists():
        _TABLES[var] = pd.read_parquet(cache)
        return _TABLES[var]
    raw = _read_csv(spam_files()[var])
    cols = {c.lower(): c for c in raw.columns}
    if "iso3" in cols:
        iso = raw[cols["iso3"]].astype(str).str.upper()
    elif "fips0" in cols:
        iso = raw[cols["fips0"]].astype(str).str.upper().map(FIPS_TO_ISO3)
    else:
        raise RuntimeError(f"SPAM {var}: no iso3/FIPS0 column in {list(raw.columns)[:20]}")
    if not all(k in cols for k in ("x", "y")):
        raise RuntimeError(f"SPAM {var}: no x/y columns")
    # Technology "A" (all systems) columns: <crop>_a
    crop_cols = {m.group(1): c for lc, c in cols.items() if (m := re.fullmatch(r"([a-z]{4})_a", lc))}
    if len(crop_cols) < 40:
        raise RuntimeError(f"SPAM {var}: expected ~46 crop columns, found {sorted(crop_cols)}")
    t = pd.DataFrame({"iso3": iso, "x": raw[cols["x"]].astype(float), "y": raw[cols["y"]].astype(float)})
    for code, c in sorted(crop_cols.items()):
        t[code] = pd.to_numeric(raw[c], errors="coerce").fillna(0.0).astype("float64")
    t = t[t["iso3"].isin(set(FIPS_TO_ISO3.values()))].reset_index(drop=True)
    cache.parent.mkdir(parents=True, exist_ok=True)
    t.to_parquet(cache)
    _TABLES[var] = t
    return t


def crop_codes() -> list[str]:
    return [c for c in spam_table("A").columns if c not in ("iso3", "x", "y")]


def national_totals(iso3: str) -> dict[str, dict[str, float]]:
    """SPAM's own national total per crop and variable (for the QA check)."""
    out = {}
    for var, label in VARIABLES.items():
        t = spam_table(var)
        out[label] = t[t["iso3"] == iso3].drop(columns=["iso3", "x", "y"]).sum().to_dict()
    return out


# ── Cell → district shares ───────────────────────────────────────────────────

def cell_shares(districts, cells: pd.DataFrame) -> pd.DataFrame:
    """
    (district, cell) share table: for every SPAM cell of the country, the
    fraction of it that belongs to each district. Shares of one cell add to 1.
    """
    import rasterio
    from rasterio.transform import from_origin
    from exactextract import exact_extract

    gdf = districts.gdf
    minx, miny, maxx, maxy = gdf.total_bounds
    minx = min(minx, cells.x.min() - RES); maxx = max(maxx, cells.x.max() + RES)
    miny = min(miny, cells.y.min() - RES); maxy = max(maxy, cells.y.max() + RES)
    c0 = int(np.floor((minx + 180) / RES)); c1 = int(np.ceil((maxx + 180) / RES))
    r0 = int(np.floor((90 - maxy) / RES));  r1 = int(np.ceil((90 - miny) / RES))
    ncol, nrow = c1 - c0, r1 - r0
    transform = from_origin(-180 + c0 * RES, 90 - r0 * RES, RES, RES)

    idx = np.arange(nrow * ncol, dtype=np.float64).reshape(nrow, ncol)
    mem = rasterio.io.MemoryFile()
    with mem.open(driver="GTiff", width=ncol, height=nrow, count=1, dtype="float64",
                  crs="EPSG:4326", transform=transform) as ds:
        ds.write(idx, 1)
    with mem.open() as ds:
        res = exact_extract(ds, gdf[["geometry"]].reset_index(drop=True),
                            ["values", "coverage"], output="pandas")

    rows = []
    for d, (vals, cov) in enumerate(zip(res["values"], res["coverage"])):
        vals, cov = np.asarray(vals), np.asarray(cov)
        keep = cov > 0
        rows.append(pd.DataFrame({"d": d, "cell": vals[keep].astype(np.int64), "cov": cov[keep]}))
    cov = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=["d", "cell", "cov"])

    col = np.floor((cells.x.values + 180) / RES).astype(np.int64) - c0
    row = np.floor((90 - cells.y.values) / RES).astype(np.int64) - r0
    cell_id = row * ncol + col
    spam = pd.DataFrame({"i": np.arange(len(cells)), "cell": cell_id})

    m = spam.merge(cov, on="cell", how="left")
    hit = m.dropna(subset=["d"]).copy()
    hit["share"] = hit["cov"] / hit.groupby("i")["cov"].transform("sum")

    lost = spam[~spam["i"].isin(hit["i"])]
    if len(lost):
        import geopandas as gpd
        pts = gpd.GeoDataFrame({"i": lost["i"].values},
                               geometry=gpd.points_from_xy(cells.x.values[lost["i"]], cells.y.values[lost["i"]]),
                               crs=4326).to_crs(6933)
        near = gpd.sjoin_nearest(pts, gdf[["geometry"]].to_crs(6933).reset_index(names="d"), how="left")
        near = near.drop_duplicates("i")
        hit = pd.concat([hit[["i", "d", "share"]],
                         pd.DataFrame({"i": near["i"].values, "d": near["d"].values, "share": 1.0})],
                        ignore_index=True)
    return hit[["i", "d", "share"]].astype({"i": np.int64, "d": np.int64}), len(lost)


# ── Per country ──────────────────────────────────────────────────────────────

def build(iso3: str, country: str) -> dict | None:
    districts = load_districts(iso3)
    tables = {label: spam_table(var) for var, label in VARIABLES.items()}
    cells = tables["phys_ha"]
    cells = cells[cells["iso3"] == iso3].reset_index(drop=True)
    if cells.empty:
        log(f"  [{iso3}] SPAM has no cells for this country — skipping")
        return None
    codes = crop_codes()

    # The three variables share SPAM's cell list; align them on (x, y).
    key = cells[["x", "y"]].round(6)
    aligned = {}
    for label, t in tables.items():
        sub = t[t["iso3"] == iso3].copy()
        sub[["x", "y"]] = sub[["x", "y"]].round(6)
        aligned[label] = key.merge(sub, on=["x", "y"], how="left")[codes].fillna(0.0).to_numpy()
    # Cells that only appear in harvested/production tables are not expected,
    # but count them so a silent loss would show up in the national check.

    shares, n_lost = cell_shares(districts, cells[["x", "y"]])
    n = districts.n
    W = np.zeros((n, len(cells)))
    np.add.at(W, (shares["d"].values, shares["i"].values), shares["share"].values)
    per = {label: W @ arr for label, arr in aligned.items()}    # (districts, crops)

    gdf = districts.gdf.copy()
    ci = {c: k for k, c in enumerate(codes)}
    columns = base_columns(districts.admin_level)
    for prefix, members in MAIN_CROPS.items():
        idx = [ci[m] for m in members if m in ci]
        phys = per["phys_ha"][:, idx].sum(axis=1)
        harv = per["harv_ha"][:, idx].sum(axis=1)
        prod = per["prod_t"][:, idx].sum(axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            yld = np.where(harv > 0, prod * 1000.0 / harv, np.nan)
        label = prefix.replace("_", "/")
        gdf[f"{prefix}_phys_ha"]    = phys.round(2)
        gdf[f"{prefix}_harv_ha"]    = harv.round(2)
        gdf[f"{prefix}_prod_t"]     = prod.round(2)
        gdf[f"{prefix}_yield_kgha"] = np.round(yld, 1)
        columns += [
            Column(f"{prefix}_phys_ha", "ha", f"{label}: physical area (land under the crop)"),
            Column(f"{prefix}_harv_ha", "ha", f"{label}: harvested area (counts each harvest)"),
            Column(f"{prefix}_prod_t", "t", f"{label}: production, metric tonnes"),
            Column(f"{prefix}_yield_kgha", "kg/ha", f"{label}: yield = production / harvested area; empty where harvested area is 0"),
        ]
    total_phys = per["phys_ha"].sum(axis=1)
    top = per["phys_ha"].argmax(axis=1)
    gdf["total_phys_ha"] = total_phys.round(2)
    gdf["top_crop"] = [CROP_NAMES.get(codes[k], codes[k]) if total_phys[d] > 0 else None
                       for d, k in enumerate(top)]
    gdf["top_crop_phys_ha"] = np.where(total_phys > 0, per["phys_ha"][np.arange(n), top], np.nan).round(2)
    columns += [
        Column("total_phys_ha", "ha", "Physical area of all 46 SPAM crops together"),
        Column("top_crop", "", "SPAM crop with the largest physical area in the district"),
        Column("top_crop_phys_ha", "ha", "Physical area of top_crop"),
    ]

    long_rows = []
    for k, code in enumerate(codes):
        harv = per["harv_ha"][:, k]
        prod = per["prod_t"][:, k]
        with np.errstate(invalid="ignore", divide="ignore"):
            yld = np.where(harv > 0, prod * 1000.0 / harv, np.nan)
        long_rows.append(pd.DataFrame({
            "shapeID": gdf["shapeID"].values, "crop": CROP_NAMES.get(code, code), "spam_code": code.upper(),
            "phys_ha": per["phys_ha"][:, k].round(2), "harv_ha": harv.round(2),
            "prod_t": prod.round(2), "yield_kgha": np.round(yld, 1),
        }))
    crops_long = pd.concat(long_rows, ignore_index=True)
    long_cols = [
        Column("shapeID", "", "geoBoundaries district ID (joins to the crops layer)"),
        Column("crop", "", "SPAM crop name"),
        Column("spam_code", "", "SPAM 2020 crop code"),
        Column("phys_ha", "ha", "Physical area"),
        Column("harv_ha", "ha", "Harvested area"),
        Column("prod_t", "t", "Production, metric tonnes"),
        Column("yield_kgha", "kg/ha", "Production / harvested area; empty where harvested area is 0"),
    ]

    # Conservation check numbers, kept in the manifest for QA.
    nat = national_totals(iso3)
    check = {}
    for label in VARIABLES.values():
        ours = dict(zip(codes, per[label].sum(axis=0)))
        check[label] = {c: [round(float(ours[c]), 2), round(float(nat[label][c]), 2)] for c in codes}

    out = FOLDER / f"{iso3}_CropProduction.gpkg"
    write_gpkg(out, "crops", gdf, columns, dataset_meta(iso3, country, districts),
               attribute_tables={"crops_long": (crops_long, long_cols)})
    return {
        "filename": out.name, "country": country, "iso3": iso3,
        "district_count": districts.n, "admin_level": districts.admin_level,
        "file_size_mb": size_mb(out),
        "total_phys_ha": round(float(total_phys.sum()), 1),
        "top_crop": CROP_NAMES.get(codes[int(per["phys_ha"].sum(axis=0).argmax())]),
        "spam_cells": len(cells), "spam_cells_nearest": int(n_lost),
        "source": "IFPRI MapSPAM 2020 v1.0", "source_version": "SPAM 2020 v1.0",
        "license": "CC BY 4.0", "boundary_license": districts.meta.get("boundary_license"),
        "national_check": check,
    }


def base_columns(level: int) -> list[Column]:
    return [
        Column("shapeID", "", "geoBoundaries unique district ID"),
        Column("shapeName", "", "District name (geoBoundaries)"),
        Column("adm1_name", "", "Province / region name (geoBoundaries ADM1)"),
        Column("iso3", "", "ISO 3166-1 alpha-3 country code"),
        Column("admin_level", "", "2 = district (ADM2); 1 where geoBoundaries has no ADM2"),
    ]


def dataset_meta(iso3: str, country: str, districts) -> dict:
    return {
        "title": f"Crop Production by District (MapSPAM 2020): {country}",
        "summary": (f"Physical area, harvested area, production and yield of 15 key crops "
                    f"per district of {country}, from IFPRI MapSPAM 2020 v1.0."),
        "dataset": SLUG, "country": country, "iso3": iso3,
        "source": "IFPRI Spatial Production Allocation Model (MapSPAM) 2020",
        "source_version": "SPAM 2020 v1.0 (5 arc-minute grid), technology: all systems",
        "source_url": "https://doi.org/10.7910/DVN/SWPENT",
        "license": "CC BY 4.0 (data © IFPRI); district boundaries: " + str(districts.meta.get("boundary_license")),
        "citation": CITATION,
        "boundaries": districts.meta,
        "method": ("Each SPAM cell is split between districts in proportion to the share of its "
                   "in-country area each district covers (exactextract coverage fractions); "
                   "cells no district touches go to the nearest district. Country totals equal SPAM's."),
        "crs": "EPSG:4326",
        "processing_date": today(),
        "producer": "Lenga Maps (lengamaps.com)",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", help="ISO-3 code(s), comma separated")
    args = ap.parse_args()
    return run_countries("crop-production", args.country, build, Manifest(FOLDER))


if __name__ == "__main__":
    sys.exit(main())
