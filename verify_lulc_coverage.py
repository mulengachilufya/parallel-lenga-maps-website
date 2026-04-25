"""
verify_lulc_coverage.py

Quick coverage check for every local LULC .tif. For each file, computes the
fraction of country pixels that have valid (non-255) data. Reports a sorted
table so we can confidently say which files are broken vs just well-compressed.

Reuses the strip-based approach from finalize_and_upload_lulc.py so memory
stays bounded for large rasters.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio import features
from rasterio.windows import Window

from africa_lulc_pipeline import ESA_NODATA, OUTPUT_DIR, load_africa_countries, r2_safe


STRIP_ROWS = 2048


def coverage_for(country: str, tif: Path, geom) -> tuple[float, int, int]:
    with rasterio.open(tif) as src:
        h, w = src.height, src.width
        country_pixels = 0
        valid_in_country = 0
        for top in range(0, h, STRIP_ROWS):
            rows = min(STRIP_ROWS, h - top)
            win = Window(0, top, w, rows)
            mask = features.rasterize(
                [(geom, 1)],
                out_shape=(rows, w),
                transform=src.window_transform(win),
                fill=0,
                dtype="uint8",
                all_touched=False,
            )
            strip_country = int(mask.sum())
            if strip_country == 0:
                continue
            band = src.read(1, window=win, out_dtype="uint8")
            country_pixels += strip_country
            valid_in_country += int(((band != ESA_NODATA) & (mask == 1)).sum())
        cov = valid_in_country / country_pixels if country_pixels > 0 else 0.0
        return cov, country_pixels, valid_in_country


def main() -> None:
    tifs = sorted(p for p in OUTPUT_DIR.glob("*_LULC.tif"))
    print(f"Verifying {len(tifs)} LULC files\n")

    print("Loading Natural Earth Africa boundaries ...")
    africa = load_africa_countries()
    geom_for = {row["lenga_name"]: row.geometry for _, row in africa.iterrows()}

    rows = []
    for tif in tifs:
        stem = tif.stem.replace("_LULC", "")
        candidates = [c for c in geom_for if r2_safe(c) == stem]
        if not candidates:
            print(f"  ?? unknown country for {tif.name}")
            continue
        country = candidates[0]
        size_mb = tif.stat().st_size / 1048576
        t0 = time.time()
        try:
            cov, total, valid = coverage_for(country, tif, geom_for[country])
        except Exception as e:
            print(f"  {country:<28s} {size_mb:>8.1f} MB  ERROR: {type(e).__name__}: {str(e)[:120]}")
            continue
        dt = time.time() - t0
        flag = "OK  " if cov >= 0.95 else ("WARN" if cov >= 0.50 else "BAD ")
        print(f"  {flag} {country:<28s} {size_mb:>8.1f} MB  cov={cov*100:>5.1f}%  ({dt:.0f}s)")
        rows.append((country, size_mb, cov))

    print("\nBy coverage (worst first):")
    for country, size_mb, cov in sorted(rows, key=lambda r: r[2]):
        flag = "OK  " if cov >= 0.95 else ("WARN" if cov >= 0.50 else "BAD ")
        print(f"  {flag} {country:<28s} {size_mb:>8.1f} MB  cov={cov*100:>5.1f}%")


if __name__ == "__main__":
    main()
