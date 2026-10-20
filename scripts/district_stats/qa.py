"""
QA for the district-statistics datasets. A dataset must PASS before it is
seeded (scripts/seed-district-stats.mjs refuses to upload without a passing
qa_report.json written by this script).

  python scripts/district_stats/qa.py crop-production
  python scripts/district_stats/qa.py forest-loss
  python scripts/district_stats/qa.py soil-fertility
  python scripts/district_stats/qa.py all

Checks, per country file
  * file listed in manifest.json exists; one feature layer (+ crops_long for crops)
  * EPSG:4326; every geometry valid and non-empty; district count equals
    the geoBoundaries district count; shapeID unique and present
  * no negative values; unit sanity ranges (pH 3–10, SOC 0–300 g/kg, …)
  * metadata inside the file: source, licence, citation, processing date
    and a unit for every column
Checks, per dataset
  * crop-production: every country's total per crop and variable within
    ±1 % of SPAM's own national total
  * forest-loss: national tree cover 2000 and loss within ±2 % of Global
    Forest Watch for Côte d'Ivoire, DR Congo and Zambia
  * soil-fertility: 20 random points match the iSDAsoil API
Verdict: PASS, PASS-WITH-WARNINGS or FAIL (exit code 1 on FAIL).
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path

import numpy as np
import requests

from common import AFRICA, CACHE_DIR, HEADERS, OUTPUT, load_districts, today

HERE = Path(__file__).resolve().parent
DATASETS = {
    "crop-production": {"folder": "CropProduction", "layer": "crops", "suffix": "CropProduction"},
    "forest-loss":     {"folder": "ForestLoss",     "layer": "forest_loss", "suffix": "ForestLoss"},
    "soil-fertility":  {"folder": "SoilFertility",  "layer": "soil_fertility", "suffix": "SoilFertility"},
}

# (column pattern, low, high) — values outside are FAIL. NaN is allowed only
# where the column's description says it can be empty.
RANGES = {
    "soil-fertility": [
        ("ph_h2o_", 3, 10), ("soc_0_20_gkg_", 0, 300), ("soc_20_50_gkg_", 0, 300),
        ("n_tot_gkg_", 0, 30), ("p_ext_ppm_", 0, 2000), ("k_ext_ppm_", 0, 5000),
        ("clay_pct_", 0, 100), ("sand_pct_", 0, 100), ("silt_pct_", 0, 100),
        ("cec_cmolkg_", 0, 200), ("bd_gcm3_", 0.5, 2.5), ("valid_pct", 0, 100),
    ],
    "forest-loss": [("pct_loss_since_2000", 0, 100)],
    "crop-production": [("_yield_kgha", 0, 250_000)],   # sugarcane can pass 100 t/ha
}
GFW_TEST = ["CIV", "COD", "ZMB"]


class Report:
    def __init__(self, slug: str):
        self.slug, self.fails, self.warns, self.info = slug, [], [], {}

    def fail(self, msg): self.fails.append(msg)
    def warn(self, msg): self.warns.append(msg)

    @property
    def verdict(self) -> str:
        return "FAIL" if self.fails else "PASS-WITH-WARNINGS" if self.warns else "PASS"


def check_file(slug: str, iso3: str, path: Path, rep: Report) -> None:
    import geopandas as gpd
    import pyogrio
    spec = DATASETS[slug]
    tag = f"{iso3}:"
    layers = {name: geom for name, geom in pyogrio.list_layers(path)}
    feature_layers = [n for n, g in layers.items() if g is not None]
    if feature_layers != [spec["layer"]]:
        rep.fail(f"{tag} feature layers {feature_layers}, expected ['{spec['layer']}']")
        return
    if slug == "crop-production" and "crops_long" not in layers:
        rep.fail(f"{tag} crops_long table missing")

    g = gpd.read_file(path, layer=spec["layer"])
    if g.crs is None or g.crs.to_epsg() != 4326:
        rep.fail(f"{tag} CRS is {g.crs}, expected EPSG:4326")
    if g.empty:
        rep.fail(f"{tag} no districts"); return
    if (~g.is_valid).any():
        rep.fail(f"{tag} {(~g.is_valid).sum()} invalid geometries")
    if (g.geometry.is_empty | g.geometry.isna()).any():
        rep.fail(f"{tag} empty geometries")
    if g["shapeID"].isna().any() or g["shapeID"].duplicated().any():
        rep.fail(f"{tag} shapeID missing or duplicated")
    expected = load_districts(iso3).n
    if len(g) != expected:
        rep.fail(f"{tag} {len(g)} districts, geoBoundaries has {expected}")
    for col in ("shapeName", "adm1_name"):
        if col not in g or g[col].isna().any():
            rep.fail(f"{tag} {col} missing on some districts")

    num = g.select_dtypes("number")
    neg = [c for c in num.columns if c not in ("fid",) and (num[c] < -1e-9).any()]
    if neg:
        rep.fail(f"{tag} negative values in {neg}")
    for pat, lo, hi in RANGES.get(slug, []):
        for c in [c for c in num.columns if pat in c]:
            v = num[c].dropna()
            bad = v[(v < lo) | (v > hi)]
            if len(bad):
                rep.fail(f"{tag} {c} outside {lo}–{hi}: {bad.min():.3g}…{bad.max():.3g}")

    # Dataset-specific consistency
    if slug == "forest-loss":
        if (g["loss_total_ha"] > g["tc2000_ha"] * 1.0001 + 0.01).any():
            rep.fail(f"{tag} loss_total_ha exceeds tc2000_ha")
        if (g["loss_since_2021_ha"] > g["loss_total_ha"] + 0.01).any():
            rep.fail(f"{tag} loss_since_2021_ha exceeds loss_total_ha")
        if (g["tc2000_ha"] > g["district_ha"] * 1.01 + 1).any():
            rep.fail(f"{tag} tc2000_ha larger than the district")
        if "forest2020_ha" in g and (g["forest2020_ha"] > g["district_ha"] * 1.01 + 1).any():
            rep.fail(f"{tag} forest2020_ha larger than the district")
    if slug == "soil-fertility":
        nodata = g["valid_pct"].isna() | (g["valid_pct"] == 0)
        if nodata.any():
            rep.warn(f"{tag} {int(nodata.sum())} district(s) with no iSDAsoil values (fully masked)")
        means = [c for c in g.columns if c.endswith("_mean")]
        if g.loc[~nodata, means].isna().any().any():
            rep.fail(f"{tag} districts with valid pixels but empty means")
        tex = (g["sand_pct_mean"] + g["silt_pct_mean"] + g["clay_pct_mean"]).dropna()
        if len(tex) and ((tex < 90) | (tex > 110)).any():
            rep.warn(f"{tag} sand+silt+clay off 100 % by >10 in {int(((tex < 90) | (tex > 110)).sum())} districts")
    if slug == "crop-production":
        h = [c for c in g.columns if c.endswith("_harv_ha")]
        for c in h:
            y = c.replace("_harv_ha", "_yield_kgha")
            if ((g[c] == 0) & g[y].notna()).any():
                rep.fail(f"{tag} {y} filled where harvested area is 0")

    # Metadata inside the file
    con = sqlite3.connect(path)
    try:
        md = con.execute("SELECT metadata FROM gpkg_metadata WHERE mime_type = 'application/json'").fetchone()
        units = dict(con.execute("SELECT column_name, description FROM gpkg_data_columns WHERE table_name = ?",
                                 (spec["layer"],)).fetchall())
    finally:
        con.close()
    if not md:
        rep.fail(f"{tag} no metadata record in gpkg_metadata")
    else:
        meta = json.loads(md[0])
        for k in ("license", "processing_date"):
            if not meta.get(k):
                rep.fail(f"{tag} metadata has no {k}")
        if not (meta.get("source") or meta.get("sources")):
            rep.fail(f"{tag} metadata has no source")
        if not (meta.get("citation") or all(s.get("citation") for s in meta.get("sources", []))):
            rep.fail(f"{tag} metadata has no citation")
        cols = meta.get("columns", {}).get(spec["layer"], {})
        missing = [c for c in g.columns if c != "geometry" and c not in cols]
        if missing:
            rep.fail(f"{tag} no unit/description for {missing}")
    if set(c for c in g.columns if c != "geometry") - set(units):
        rep.fail(f"{tag} gpkg_data_columns incomplete")


# ── Dataset-level checks ─────────────────────────────────────────────────────

def crop_national(manifest: list[dict], rep: Report) -> None:
    worst = 0.0
    for m in manifest:
        for var, crops in m.get("national_check", {}).items():
            for crop, (ours, spam) in crops.items():
                # Below 1 ha / 1 t a relative error means nothing; compare absolutely.
                if spam < 1:
                    if abs(ours - spam) > 1:
                        rep.fail(f"{m['iso3']}: {crop} {var} {ours} vs SPAM {spam}")
                    continue
                rel = abs(ours - spam) / spam
                worst = max(worst, rel)
                if rel > 0.01:
                    rep.fail(f"{m['iso3']}: {crop} {var} {ours:,.0f} vs SPAM {spam:,.0f} ({rel:.2%})")
    rep.info["national_worst_rel_diff"] = worst


def gfw_reference(year_end: int) -> dict:
    """
    National tree cover 2000 and loss for the test countries from the Global
    Forest Watch Data API (GADM boundaries, 30 % canopy). Needs GFW_API_KEY
    (free at globalforestwatch.org). Cached under output/.cache/gfw/.
    A hand-made reference/gfw_country_totals.json is used if present.
    """
    manual = HERE / "reference" / "gfw_country_totals.json"
    if manual.exists():
        return json.loads(manual.read_text())
    cache = CACHE_DIR / "gfw" / "country_totals.json"
    if cache.exists():
        return json.loads(cache.read_text())
    key = os.environ.get("GFW_API_KEY")
    if not key:
        out = gfw_spreadsheet()
        if out:
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(out, indent=2))
        return out
    base = "https://data-api.globalforestwatch.org/dataset"
    hdr = {**HEADERS, "x-api-key": key}
    isos = ",".join(f"'{i}'" for i in GFW_TEST)

    def q(dataset: str, sql: str) -> list[dict]:
        r = requests.get(f"{base}/{dataset}/latest/query/json", params={"sql": sql}, headers=hdr, timeout=300)
        r.raise_for_status()
        return r.json()["data"]

    loss = q("gadm__tcl__iso_change",
             "SELECT iso, umd_tree_cover_loss__year AS year, SUM(umd_tree_cover_loss__ha) AS ha FROM data "
             f"WHERE umd_tree_cover_density_2000__threshold = 30 AND iso IN ({isos}) GROUP BY iso, umd_tree_cover_loss__year")
    ext = q("gadm__tcl__iso_summary",
            "SELECT iso, SUM(umd_tree_cover_extent_2000__ha) AS ha FROM data "
            f"WHERE umd_tree_cover_density_2000__threshold = 30 AND iso IN ({isos}) GROUP BY iso")
    out = {i: {"tc2000_ha": None, "loss_by_year_ha": {}} for i in GFW_TEST}
    for r in ext:
        out[r["iso"]]["tc2000_ha"] = r["ha"]
    for r in loss:
        out[r["iso"]]["loss_by_year_ha"][str(r["year"])] = r["ha"]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out, indent=2))
    return out


GFW_XLSX = "https://gfw2-data.s3.amazonaws.com/country-pages/country_stats/download/global_country_stats.xlsx"
GFW_NAMES = {"CIV": ("côte d'ivoire", "cote d'ivoire", "ivory coast"),
             "COD": ("democratic republic of the congo", "dr congo", "congo, the democratic republic of the"),
             "ZMB": ("zambia",)}


def gfw_spreadsheet() -> dict:
    """
    The country statistics workbook behind the GFW dashboards' "Download
    data" button (no API key needed): tree cover extent 2000 and loss per
    year, by country and canopy threshold.
    """
    import pandas as pd
    from common import download
    try:
        path = download(GFW_XLSX, CACHE_DIR / "gfw" / "global_country_stats.xlsx")
    except Exception:
        return {}
    sheets = pd.read_excel(path, sheet_name=None)
    sheet = next((df for name, df in sheets.items() if "country" in name.lower() and "loss" in name.lower()), None)
    if sheet is None:
        return {}
    cols = {c.lower(): c for c in sheet.columns}
    ccol = next((cols[c] for c in cols if c in ("country", "name", "iso")), None)
    tcol = next((cols[c] for c in cols if "threshold" in c), None)
    ecol = next((cols[c] for c in cols if "extent_2000" in c), None)
    lcols = {c.rsplit("_", 1)[-1]: cols[c] for c in cols if c.startswith("tc_loss_ha_")}
    if not (ccol and tcol and ecol and lcols):
        return {}
    sub = sheet[sheet[tcol] == 30]
    out = {}
    for iso3, names in GFW_NAMES.items():
        row = sub[sub[ccol].astype(str).str.strip().str.lower().isin(names + (iso3.lower(),))]
        if row.empty:
            continue
        r = row.iloc[0]
        out[iso3] = {"tc2000_ha": float(r[ecol]),
                     "loss_by_year_ha": {y: float(r[c]) for y, c in lcols.items()},
                     "reference": "GFW global_country_stats.xlsx (threshold 30)"}
    return out


def forest_national(manifest: list[dict], rep: Report) -> None:
    by_iso = {m["iso3"]: m for m in manifest}
    if not all(i in by_iso for i in GFW_TEST):
        rep.fail(f"GFW check needs {GFW_TEST} built; have {sorted(set(GFW_TEST) & set(by_iso))}")
        return
    year_end = by_iso[GFW_TEST[0]]["year_end"]
    try:
        ref = gfw_reference(year_end)
    except Exception as err:
        rep.fail(f"GFW reference could not be fetched: {err}")
        return
    if not ref:
        rep.fail("GFW reference missing: the GFW country workbook could not be read; set GFW_API_KEY or add reference/gfw_country_totals.json")
        return
    rows = {}
    for iso3 in GFW_TEST:
        ours, theirs = by_iso[iso3], ref.get(iso3) or {}
        years = [y for y in ours["loss_by_year_ha"] if y in theirs.get("loss_by_year_ha", {})]
        ol = sum(ours["loss_by_year_ha"][y] for y in years)
        tl = sum(float(theirs["loss_by_year_ha"][y]) for y in years)
        rows[iso3] = {"years": f"{min(years)}–{max(years)}" if years else None,
                      "loss_ours": ol, "loss_gfw": tl,
                      "tc2000_ours": ours["tc2000_ha"], "tc2000_gfw": theirs.get("tc2000_ha")}
        for what, a, b in (("loss", ol, tl), ("tc2000", ours["tc2000_ha"], theirs.get("tc2000_ha"))):
            if not b:
                rep.fail(f"{iso3}: GFW has no {what} figure")
                continue
            rel = abs(a - float(b)) / float(b)
            rows[iso3][f"{what}_rel_diff"] = rel
            if rel > 0.02:
                rep.fail(f"{iso3}: {what} {a:,.0f} ha vs GFW {float(b):,.0f} ha ({rel:.2%} > 2%)")
    rep.info["gfw_check"] = rows


def soil_spot(folder: Path, rep: Report) -> None:
    p = folder / "spot_check.json"
    if not p.exists():
        rep.fail("spot_check.json missing (run soil_fertility.py)"); return
    sc = json.loads(p.read_text())
    if sc.get("status") != "ok":
        rep.fail(f"iSDAsoil API spot check not run ({sc.get('status')}): set ISDA_USERNAME / ISDA_PASSWORD")
        return
    pts = sc["points"]
    if len(pts) < 20:
        rep.fail(f"spot check has {len(pts)} points, need 20")
    mism = []
    for p_ in pts:
        for var, v in p_["values"].items():
            if v["api"] is None:
                mism.append(f"{p_['lon']},{p_['lat']} {var}: API gave no value")
                continue
            tol = 0.051 if var == "ph_h2o" else max(0.02 * abs(float(v["api"])), 0.051)
            if abs(v["ours"] - float(v["api"])) > tol:
                mism.append(f"{p_['lon']},{p_['lat']} {var}: ours {v['ours']} vs API {v['api']}")
    if mism:
        rep.fail(f"spot check: {len(mism)} mismatches, e.g. {mism[:5]}")
    rep.info["spot_check_points"] = len(pts)


def run(slug: str) -> Report:
    spec = DATASETS[slug]
    folder = OUTPUT / spec["folder"]
    rep = Report(slug)
    mpath = folder / "manifest.json"
    if not mpath.exists():
        rep.fail(f"{mpath} missing")
        return rep
    manifest = json.loads(mpath.read_text())
    have = {m["iso3"] for m in manifest}
    missing = [i for i, _ in AFRICA if i not in have]
    if missing:
        rep.fail(f"{len(missing)} countries missing from manifest: {', '.join(missing)}")
    for m in manifest:
        path = folder / m["filename"]
        if m["filename"] != f"{m['iso3']}_{spec['suffix']}.gpkg":
            rep.fail(f"{m['iso3']}: file name {m['filename']}")
        if not path.exists():
            rep.fail(f"{m['iso3']}: {path.name} missing"); continue
        try:
            check_file(slug, m["iso3"], path, rep)
        except Exception as err:
            rep.fail(f"{m['iso3']}: could not check ({type(err).__name__}: {err})")
        lic = m.get("boundary_license") or ""
        if "ShareAlike" in lic or "Open Database" in lic:
            rep.warn(f"{m['iso3']}: district boundaries are {lic} (share-alike)")
    if slug == "crop-production":
        crop_national(manifest, rep)
    elif slug == "forest-loss":
        forest_national(manifest, rep)
    elif slug == "soil-fertility":
        soil_spot(folder, rep)

    out = {"dataset": slug, "verdict": rep.verdict, "date": today(), "countries": len(manifest),
           "fails": rep.fails, "warnings": rep.warns, "info": rep.info}
    (folder / "qa_report.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    return rep


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    slugs = list(DATASETS) if which == "all" else [which]
    worst = 0
    for slug in slugs:
        rep = run(slug)
        print(f"\n{slug}: {rep.verdict}  ({len(rep.fails)} fails, {len(rep.warns)} warnings)")
        for f in rep.fails[:40]:
            print(f"  FAIL  {f}")
        for w in rep.warns[:20]:
            print(f"  warn  {w}")
        if rep.info:
            print("  info  " + json.dumps(rep.info, default=float)[:1500])
        worst = max(worst, 1 if rep.fails else 0)
    return worst


if __name__ == "__main__":
    sys.exit(main())
