#!/usr/bin/env python3
"""
Re-zip all DEM/slope TIFs after recompression.
Replaces existing .zip files with new ones containing the smaller TIFs.

Usage:
  python rezip_dems.py
"""

from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

OUTPUT_DIR = Path(__file__).parent / "output" / "DEMs"


def main():
    tifs = sorted(OUTPUT_DIR.glob("*.tif"))
    tifs = [t for t in tifs if not t.name.startswith("_")]

    if not tifs:
        print("No TIF files found.")
        return

    print(f"Re-zipping {len(tifs)} files...\n")

    for tif in tifs:
        zip_path = tif.with_suffix(".zip")
        old_zip_size = zip_path.stat().st_size / (1024 * 1024) if zip_path.exists() else 0

        with ZipFile(zip_path, "w", ZIP_DEFLATED, compresslevel=1) as zf:
            zf.write(tif, tif.name)

        new_zip_size = zip_path.stat().st_size / (1024 * 1024)
        print(f"  {zip_path.name}: {old_zip_size:.0f} MB -> {new_zip_size:.0f} MB")

    print("\nDone!")


if __name__ == "__main__":
    main()
