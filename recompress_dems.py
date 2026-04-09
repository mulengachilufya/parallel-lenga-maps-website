#!/usr/bin/env python3
"""
Recompress existing DEM/slope GeoTIFFs with DEFLATE + predictor for much smaller files.
- DEMs: float32 → int16, DEFLATE, predictor=2  (expect ~70-80% size reduction)
- Slopes: keep float32, DEFLATE, predictor=2    (expect ~40-50% size reduction)

Usage:
  python recompress_dems.py                    # process all
  python recompress_dems.py --country Zambia   # process one country
"""

import os
import sys
import argparse
from pathlib import Path

import numpy as np
import rasterio

OUTPUT_DIR = Path(__file__).parent / "output" / "DEMs"


def recompress_file(src_path: Path, is_dem: bool):
    tmp_path = src_path.with_suffix(".tmp.tif")

    with rasterio.open(src_path) as src:
        meta = src.meta.copy()

        if is_dem:
            meta.update({
                "compress": "deflate", "predictor": 2, "zlevel": 6,
                "dtype": "int16", "nodata": -9999,
                "tiled": True, "blockxsize": 512, "blockysize": 512,
                "BIGTIFF": "IF_SAFER",
            })
        else:
            meta.update({
                "compress": "deflate", "predictor": 2, "zlevel": 6,
                "dtype": "float32", "nodata": np.nan,
                "tiled": True, "blockxsize": 512, "blockysize": 512,
                "BIGTIFF": "IF_SAFER",
            })

        BLOCK = 2048
        with rasterio.open(tmp_path, "w", **meta) as dst:
            for rs in range(0, src.height, BLOCK):
                re = min(rs + BLOCK, src.height)
                win = rasterio.windows.Window(0, rs, src.width, re - rs)
                data = src.read(1, window=win).astype(np.float32)

                if is_dem:
                    data = np.where(np.isnan(data), -9999, np.clip(data, -9999, 32767)).astype(np.int16)

                dst.write(data[np.newaxis], window=win)

    # Replace original with compressed version
    old_size = src_path.stat().st_size / (1024 * 1024)
    new_size = tmp_path.stat().st_size / (1024 * 1024)
    src_path.unlink()
    tmp_path.rename(src_path)

    reduction = (1 - new_size / old_size) * 100 if old_size > 0 else 0
    print(f"  {src_path.name}: {old_size:.0f} MB -> {new_size:.0f} MB ({reduction:.0f}% smaller)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--country", help="Process only this country (e.g. Zambia)")
    args = parser.parse_args()

    tifs = sorted(OUTPUT_DIR.glob("*.tif"))
    if args.country:
        tifs = [t for t in tifs if args.country.lower().replace(" ", "_") in t.name.lower()]

    if not tifs:
        print("No TIF files found.")
        return

    print(f"Recompressing {len(tifs)} files...\n")

    for tif in tifs:
        if tif.name.startswith("_"):
            continue
        is_dem = "_DEM" in tif.name
        try:
            recompress_file(tif, is_dem)
        except Exception as e:
            print(f"  ERROR {tif.name}: {e}")

    print("\nDone!")


if __name__ == "__main__":
    main()
