"""
recover-zambia.py

One-off recovery for Zambia. The main pipeline skipped Zambia because the
HDX COD-AB shapefile uses a different PCODE scheme (ZM101, ZM102, …) from
the COD-PS workbook (ZM10, ZM20, …). The administrative *names* match,
so we join on lowercased name instead of pcode.

Writes: output/PopulationSettlements/Zambia_Population_ADM1_2020.zip
Appends an entry to the manifest, then the existing
seed-population-settlements.ts will pick it up on its next run.
"""
from __future__ import annotations

import io
import json
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests

OUT_DIR = Path(__file__).resolve().parent.parent / "output" / "PopulationSettlements"
HDX_API = "https://data.humdata.org/api/3/action/package_show"


def hdx_resource_url(pkg_id: str, predicate) -> str:
    pkg = requests.get(HDX_API, params={"id": pkg_id}, timeout=30).json()["result"]
    for r in pkg["resources"]:
        if predicate(r):
            return r["url"]
    raise RuntimeError(f"no matching resource in {pkg_id}")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    ab_url = hdx_resource_url(
        "cod-ab-zmb",
        lambda r: r.get("format", "").upper() == "SHP",
    )
    ps_url = hdx_resource_url(
        "cod-ps-zmb",
        lambda r: r.get("format", "").lower() in ("xlsx", "xls")
                  and "admpop" in (r.get("name") or "").lower(),
    )

    print(f"boundaries: {ab_url.rsplit('/', 1)[-1]}")
    print(f"population: {ps_url.rsplit('/', 1)[-1]}")

    ab_bytes = requests.get(ab_url, timeout=180).content
    ps_bytes = requests.get(ps_url, timeout=180).content

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        with zipfile.ZipFile(io.BytesIO(ab_bytes)) as zf:
            zf.extractall(td)

        shp_path = next(td.rglob("zmb_admin1.shp"))
        gdf = gpd.read_file(shp_path)
        if gdf.crs is None or gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)

        # Population from the ADM1 sheet of the COD-PS workbook
        df = pd.read_excel(io.BytesIO(ps_bytes), sheet_name="zmb_admpop_adm1_2020", engine="openpyxl")
        df["join_key"] = df["ADM1_EN"].astype(str).str.strip().str.lower()
        gdf["join_key"] = gdf["adm1_name"].astype(str).str.strip().str.lower()

        # Collapse pop in case of any duplicates, then merge by lowercased name
        pop = df.groupby("join_key", as_index=False)["Both_TOTL"].sum()
        merged = gdf.merge(pop, on="join_key", how="left")
        missing = int(merged["Both_TOTL"].isna().sum())
        if missing:
            print(f"warning: {missing} polygon(s) without population match — left as 0")
        merged["population"] = merged["Both_TOTL"].fillna(0).astype("Int64")

        ref_year = 2020
        out = gpd.GeoDataFrame({
            "iso3":        "ZMB",
            "adm0_name":   "Zambia",
            "adm1_name":   merged["adm1_name"],
            "adm1_pcode":  merged["adm1_pcode"],
            "adm2_name":   "",
            "adm2_pcode":  "",
            "population":  merged["population"],
            "ref_year":    ref_year,
            "source":      "HDX COD-PS (Zambia - Subnational Population Statistics, 2020) joined by name",
            "hdx_url":     "https://data.humdata.org/dataset/cod-ps-zmb",
            "geometry":    merged.geometry,
        }, geometry="geometry", crs=merged.crs)

        total_pop = int(out["population"].sum())
        feature_count = len(out)
        print(f"join: {feature_count} features · pop {total_pop:,}")
        if total_pop == 0:
            raise RuntimeError("name join produced 0 pop — bailing")

        out_name = f"Zambia_Population_ADM1_{ref_year}"
        shp_dir = td / "out"
        shp_dir.mkdir(exist_ok=True)
        out.to_file(shp_dir / f"{out_name}.shp", driver="ESRI Shapefile")

        zip_path = OUT_DIR / f"{out_name}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in shp_dir.iterdir():
                zf.write(f, arcname=f.name)
        size_mb = zip_path.stat().st_size / (1024 * 1024)
        print(f"wrote {zip_path.name}  ({size_mb:.2f} MB)")

    # Append to manifest if not already present
    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    entry = {
        "filename":         f"Zambia_Population_ADM1_{ref_year}.zip",
        "country":          "Zambia",
        "iso3":             "ZMB",
        "admin_level":      "ADM1",
        "ref_year":         ref_year,
        "total_population": total_pop,
        "feature_count":    feature_count,
        "source":           "HDX COD-PS (Zambia - Subnational Population Statistics, 2020) joined by name",
        "hdx_url":          "https://data.humdata.org/dataset/cod-ps-zmb",
    }
    manifest = [m for m in manifest if m.get("iso3") != "ZMB"] + [entry]
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"manifest updated → {len(manifest)} entries")


if __name__ == "__main__":
    main()
