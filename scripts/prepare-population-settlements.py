"""
prepare-population-settlements.py

Builds per-country Population & Settlements shapefiles for all 54 African
nations by combining authoritative boundaries + population from UN OCHA's
Common Operational Datasets (COD) hosted on HDX.

Sources (every row auditable):
  Boundaries (COD-AB):  geometries published by UN OCHA / national mapping agencies.
  Population (COD-PS):  subnational population figures compiled from the latest
                        national census or official projection, country by country.

Output per country:  output/PopulationSettlements/{Country}_Population_{Level}_{Year}.zip
  containing a shapefile with these attributes:
    iso3, adm0_name, adm1_name, adm1_pcode,
    adm2_name, adm2_pcode,              (if ADM2 available)
    population, ref_year, source, hdx_url

Also writes output/PopulationSettlements/manifest.json with per-country totals
and metadata for the seed-population-settlements.ts script to consume.

Requires:  pip install geopandas pandas openpyxl requests

Run:       python scripts/prepare-population-settlements.py
"""

from __future__ import annotations

import io
import json
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd
import requests

# ── Config ──────────────────────────────────────────────────────────────────

HDX_API = "https://data.humdata.org/api/3/action/package_show"

# 54 African countries (ISO-3, common name used in filenames)
AFRICA = [
    ("DZA", "Algeria"),      ("AGO", "Angola"),       ("BEN", "Benin"),
    ("BWA", "Botswana"),     ("BFA", "Burkina-Faso"), ("BDI", "Burundi"),
    ("CPV", "Cabo-Verde"),   ("CMR", "Cameroon"),     ("CAF", "Central-African-Republic"),
    ("TCD", "Chad"),         ("COM", "Comoros"),      ("COG", "Congo"),
    ("COD", "DR-Congo"),     ("CIV", "Cote-dIvoire"), ("DJI", "Djibouti"),
    ("EGY", "Egypt"),        ("GNQ", "Equatorial-Guinea"), ("ERI", "Eritrea"),
    ("SWZ", "Eswatini"),     ("ETH", "Ethiopia"),     ("GAB", "Gabon"),
    ("GMB", "Gambia"),       ("GHA", "Ghana"),        ("GIN", "Guinea"),
    ("GNB", "Guinea-Bissau"),("KEN", "Kenya"),        ("LSO", "Lesotho"),
    ("LBR", "Liberia"),      ("LBY", "Libya"),        ("MDG", "Madagascar"),
    ("MWI", "Malawi"),       ("MLI", "Mali"),         ("MRT", "Mauritania"),
    ("MUS", "Mauritius"),    ("MAR", "Morocco"),      ("MOZ", "Mozambique"),
    ("NAM", "Namibia"),      ("NER", "Niger"),        ("NGA", "Nigeria"),
    ("RWA", "Rwanda"),       ("STP", "Sao-Tome-and-Principe"), ("SEN", "Senegal"),
    ("SYC", "Seychelles"),   ("SLE", "Sierra-Leone"), ("SOM", "Somalia"),
    ("ZAF", "South-Africa"), ("SSD", "South-Sudan"),  ("SDN", "Sudan"),
    ("TZA", "Tanzania"),     ("TGO", "Togo"),         ("TUN", "Tunisia"),
    ("UGA", "Uganda"),       ("ZMB", "Zambia"),       ("ZWE", "Zimbabwe"),
]

OUT_DIR = Path(__file__).resolve().parent.parent / "output" / "PopulationSettlements"

# Candidate column names across COD-PS workbooks (varies per country)
PCODE_CANDIDATES = ["ADM2_PCODE", "admin2Pcode", "admin2RefPcode",
                    "ADM1_PCODE", "admin1Pcode", "admin1RefPcode"]
POP_TOTAL_CANDIDATES = ["T_TL", "t_tl", "Total", "TOTAL", "T_00_99_T",
                       "Population", "POP", "T_15_49_T"]
NAME_CANDIDATES = ["ADM2_EN", "ADM2_NAME", "admin2Name_en",
                   "ADM1_EN", "ADM1_NAME", "admin1Name_en"]
YEAR_CANDIDATES = ["reference_year", "ref_year", "year", "YEAR"]


# ── Helpers ─────────────────────────────────────────────────────────────────

def hdx_package(name: str) -> Optional[dict]:
    """Fetch an HDX package by ID (e.g. 'cod-ab-zmb'). Returns None on 404."""
    try:
        r = requests.get(HDX_API, params={"id": name}, timeout=30)
        if r.status_code != 200:
            return None
        j = r.json()
        return j.get("result") if j.get("success") else None
    except requests.RequestException as exc:
        print(f"  HDX API error for {name}: {exc}")
        return None


def pick_resource(pkg: dict, predicate) -> Optional[dict]:
    """Return the first resource matching predicate (lambda resource -> bool)."""
    for res in pkg.get("resources", []):
        if predicate(res):
            return res
    return None


def download(url: str) -> bytes:
    r = requests.get(url, timeout=180, stream=True)
    r.raise_for_status()
    return r.content


def detect_col(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    """Case-insensitive match of the first candidate present in df.columns."""
    lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in lower:
            return lower[cand.lower()]
    return None


def detect_pop_col(df: pd.DataFrame) -> Optional[str]:
    """
    Find the population total column. HDX COD-PS workbooks vary:
      - Standard: 'T_TL' (or 'Total', 'TOTAL')
      - Some use: 'Pop_YYYY' / 'T_YYYY' (year-coded; pick the latest)
      - Some use: 'Population' / 'POP'
    Falls back to year-coded patterns when no exact match exists.
    """
    exact = detect_col(df, POP_TOTAL_CANDIDATES)
    if exact:
        return exact

    year_cols: list[tuple[int, str]] = []
    for c in df.columns:
        m = re.fullmatch(r"(?i)(t|pop)_?(\d{4})", str(c))
        if m:
            year_cols.append((int(m.group(2)), c))
    if year_cols:
        year_cols.sort(reverse=True)
        return year_cols[0][1]

    return None


def detect_pcode_col(df: pd.DataFrame, level: Optional[str] = None) -> Optional[str]:
    """Find the PCODE column, preferring one matching the requested level."""
    if level == "ADM2":
        for c in df.columns:
            if re.fullmatch(r"(?i)adm(in)?_?2.*pcode", str(c)):
                return c
    elif level == "ADM1":
        for c in df.columns:
            if re.fullmatch(r"(?i)adm(in)?_?1.*pcode", str(c)):
                return c
    return detect_col(df, PCODE_CANDIDATES)


def read_pop_table(xlsx_bytes: bytes, level: Optional[str] = None) -> Optional[pd.DataFrame]:
    """
    Read the population table from a COD-PS Excel file at the requested admin
    level. Returns None if no sheet at that level has both PCODE and pop cols.
    """
    try:
        xls = pd.ExcelFile(io.BytesIO(xlsx_bytes), engine="openpyxl")
    except Exception as e:
        print(f"    cannot read xlsx: {e}")
        return None

    if level == "ADM2":
        sheet_match = lambda n: bool(re.search(r"adm(in)?_?2(?!\d)", n.lower()))
    elif level == "ADM1":
        sheet_match = lambda n: bool(re.search(r"adm(in)?_?1(?!\d)", n.lower()))
    else:
        sheet_match = lambda n: True

    candidates = [s for s in xls.sheet_names if sheet_match(s)]
    # If no sheet name carries the level marker, fall back to scanning all.
    if not candidates:
        candidates = list(xls.sheet_names)

    for sheet in candidates:
        df = xls.parse(sheet)
        if detect_pcode_col(df, level) and detect_pop_col(df):
            return df
    return None


# ── Core per-country pipeline ───────────────────────────────────────────────

def process_country(iso3: str, country: str, work_dir: Path) -> Optional[dict]:
    """
    Returns a manifest dict on success, or None if the country was skipped.
    """
    print(f"\n── {country} ({iso3}) ──")

    # 1) Fetch COD-AB package
    ab_pkg = hdx_package(f"cod-ab-{iso3.lower()}")
    if not ab_pkg:
        print("  no COD-AB dataset on HDX — skipping")
        return None

    # Prefer shapefile (.zip/.shp.zip), any admin level polygon resource
    ab_res = pick_resource(
        ab_pkg,
        lambda r: (r.get("format", "").lower() in ("shp", "zipped shapefile", "shapefile", "zip"))
                  and "adm" in (r.get("name") or r.get("description") or "").lower(),
    )
    if not ab_res:
        ab_res = pick_resource(
            ab_pkg,
            lambda r: (r.get("url") or "").lower().endswith(".zip") and "shp" in (r.get("url") or "").lower(),
        )
    if not ab_res:
        print("  no COD-AB shapefile resource — skipping")
        return None

    # 2) Fetch COD-PS package
    ps_pkg = hdx_package(f"cod-ps-{iso3.lower()}")
    if not ps_pkg:
        print("  no COD-PS dataset on HDX — skipping")
        return None

    # Prefer the actual population workbook (xxx_admpop_*.xlsx) — many HDX
    # COD-PS packages also include a separate "AdminBoundaries_TabularData.xlsx"
    # which is metadata, not population, and matches the older predicate.
    def _is_pop_xlsx(r: dict) -> bool:
        if r.get("format", "").lower() not in ("xlsx", "xls"):
            return False
        text = ((r.get("name") or "") + " " + (r.get("description") or "")
                + " " + (r.get("url") or "")).lower()
        return "admpop" in text or "_pop_" in text or "pop_" in text or "_pop." in text

    ps_res = pick_resource(ps_pkg, _is_pop_xlsx)
    if not ps_res:
        ps_res = pick_resource(
            ps_pkg,
            lambda r: (r.get("format", "").lower() in ("xlsx", "xls"))
                      and "adm" in (r.get("name") or r.get("description") or "").lower(),
        )
    if not ps_res:
        ps_res = pick_resource(
            ps_pkg,
            lambda r: (r.get("url") or "").lower().endswith((".xlsx", ".xls")),
        )
    if not ps_res:
        print("  no COD-PS xlsx resource — skipping")
        return None

    # 3) Download both
    print(f"  downloading boundaries: {ab_res['url'].rsplit('/', 1)[-1]}")
    ab_bytes = download(ab_res["url"])
    print(f"  downloading population: {ps_res['url'].rsplit('/', 1)[-1]}")
    ps_bytes = download(ps_res["url"])

    # 4) Unzip boundaries → find best admin level
    country_tmp = work_dir / iso3
    country_tmp.mkdir(exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(ab_bytes)) as zf:
        zf.extractall(country_tmp)

    # Available boundary levels — ADM2 preferred, ADM1 used as fallback when
    # the COD-PS workbook lacks an ADM2 sheet (e.g. Cameroon, Cote d'Ivoire).
    # HDX naming varies: `xxx_adm2_*.shp`, `xxx_admin2.shp`, `xxx_adm_2_*.shp`, etc.
    shp_candidates = sorted(country_tmp.rglob("*.shp"))
    adm2 = [p for p in shp_candidates if re.search(r"adm(in)?_?2(?!\d)", p.stem.lower())]
    adm1 = [p for p in shp_candidates if re.search(r"adm(in)?_?1(?!\d)", p.stem.lower())]
    level_options: list[tuple[str, Path]] = []
    if adm2: level_options.append(("ADM2", adm2[0]))
    if adm1: level_options.append(("ADM1", adm1[0]))
    if not level_options:
        print("  no ADM1/ADM2 shapefile in archive — skipping")
        return None

    out: Optional[gpd.GeoDataFrame] = None
    level: str = ""
    ref_year: int = 0
    total_pop: int = 0
    feature_count: int = 0

    for try_level, try_shp in level_options:
        print(f"  trying {try_level} boundaries: {try_shp.name}")

        gdf = gpd.read_file(try_shp)
        if gdf.crs is None or gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)

        df = read_pop_table(ps_bytes, level=try_level)
        if df is None:
            print(f"    no {try_level} sheet in COD-PS xlsx — trying next")
            continue

        pcode_col = detect_pcode_col(df, try_level)
        pop_col   = detect_pop_col(df)
        year_col  = detect_col(df, YEAR_CANDIDATES)

        gdf_pcode_col = detect_pcode_col(gdf, try_level)
        if not gdf_pcode_col:
            print(f"    boundaries missing PCODE column — trying next")
            continue
        if not pcode_col or not pop_col:
            print(f"    pop xlsx missing pcode/pop column — trying next")
            continue

        df[pcode_col] = df[pcode_col].astype(str).str.strip()
        gdf[gdf_pcode_col] = gdf[gdf_pcode_col].astype(str).str.strip()

        pop_df = df.groupby(pcode_col, as_index=False)[pop_col].sum()
        pop_df = pop_df.rename(columns={pcode_col: gdf_pcode_col, pop_col: "population"})

        merged = gdf.merge(pop_df, on=gdf_pcode_col, how="left")
        missing = merged["population"].isna().sum()
        merged["population"] = merged["population"].fillna(0).astype("Int64")

        try_total = int(merged["population"].sum())
        if try_total == 0:
            print(f"    {try_level} join produced 0 pop (PCODE mismatch) — trying next")
            continue
        if missing:
            print(f"    warning: {missing} polygon(s) without population match — left as 0")

        # Reference year — try, in order: `year` column, year embedded in the
        # pop column name (e.g. `Pop_2020`), then dataset title.
        ref_year = 0
        if year_col and year_col in df.columns:
            yrs = pd.to_numeric(df[year_col], errors="coerce").dropna().astype(int)
            if len(yrs): ref_year = int(yrs.max())
        if not ref_year:
            m = re.search(r"(19|20)\d{2}", str(pop_col))
            if m: ref_year = int(m.group(0))
        if not ref_year:
            m = re.search(r"(19|20)\d{2}", ps_pkg.get("title", "") + " " + (ps_res.get("name") or ""))
            ref_year = int(m.group(0)) if m else 0

        adm1_name = detect_col(merged, ["ADM1_EN", "ADM1_NAME", "admin1Name_en"])
        adm1_pc   = detect_col(merged, ["ADM1_PCODE", "admin1Pcode"])
        adm2_name = detect_col(merged, ["ADM2_EN", "ADM2_NAME", "admin2Name_en"])
        adm2_pc   = detect_col(merged, ["ADM2_PCODE", "admin2Pcode"])

        out = gpd.GeoDataFrame({
            "iso3":        iso3,
            "adm0_name":   country.replace("-", " "),
            "adm1_name":   merged[adm1_name] if adm1_name else "",
            "adm1_pcode":  merged[adm1_pc]   if adm1_pc   else "",
            "adm2_name":   merged[adm2_name] if adm2_name else "",
            "adm2_pcode":  merged[adm2_pc]   if adm2_pc   else "",
            "population":  merged["population"],
            "ref_year":    ref_year,
            "source":      f"HDX COD-PS ({ps_pkg.get('title','')[:80]})",
            "hdx_url":     f"https://data.humdata.org/dataset/{ps_pkg.get('name','')}",
            "geometry":    merged.geometry,
        }, geometry="geometry", crs=merged.crs)
        level = try_level
        total_pop = try_total
        feature_count = len(out)
        print(f"    ✓ {try_level} join: {feature_count} features · pop {total_pop:,}")
        break

    if out is None:
        print("  no admin level produced a valid pop join — skipping")
        return None

    # 7) Write shapefile + zip
    out_name = f"{country}_Population_{level}_{ref_year}"
    shp_dir = work_dir / "out" / out_name
    shp_dir.mkdir(parents=True, exist_ok=True)
    out.to_file(shp_dir / f"{out_name}.shp", driver="ESRI Shapefile")

    zip_path = OUT_DIR / f"{out_name}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in shp_dir.iterdir():
            zf.write(f, arcname=f.name)

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"  ✓ wrote {zip_path.name}  ({size_mb:.2f} MB · {feature_count} features · pop {total_pop:,})")

    return {
        "filename":        zip_path.name,
        "country":         country.replace("-", " "),
        "iso3":            iso3,
        "admin_level":     level,
        "ref_year":        ref_year,
        "total_population":total_pop,
        "feature_count":   feature_count,
        "source":          f"HDX COD-PS ({ps_pkg.get('title','')[:120]})",
        "hdx_url":         f"https://data.humdata.org/dataset/{ps_pkg.get('name','')}",
    }


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / "manifest.json"
    existing = {}
    if manifest_path.exists():
        existing = {m["filename"]: m for m in json.loads(manifest_path.read_text())}

    results: list[dict] = list(existing.values())
    done_files = set(existing.keys())

    with tempfile.TemporaryDirectory() as td:
        work_dir = Path(td)
        (work_dir / "out").mkdir()

        for iso3, country in AFRICA:
            # Skip if any zip for this country already exists in OUT_DIR
            if any(p.name.startswith(f"{country}_Population_") for p in OUT_DIR.glob("*.zip")):
                matching = [m for m in results if m["iso3"] == iso3]
                if matching:
                    print(f"\n── {country} ({iso3}) ── already prepared, skipping")
                    continue

            try:
                meta = process_country(iso3, country, work_dir)
            except Exception as e:
                print(f"  ERROR for {iso3}: {e}")
                continue
            if meta and meta["filename"] not in done_files:
                results.append(meta)
                done_files.add(meta["filename"])
                manifest_path.write_text(json.dumps(results, indent=2))

    manifest_path.write_text(json.dumps(results, indent=2))
    print(f"\nDone. {len(results)} countries prepared. Manifest → {manifest_path}")


if __name__ == "__main__":
    sys.exit(main())
