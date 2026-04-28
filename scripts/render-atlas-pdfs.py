"""
render-atlas-pdfs.py

Rasterize every source PDF in atlas-source/ to a kebab-cased PNG inside
public/atlas/. The /atlas page on the site shows the PNGs in a responsive
grid. PDFs deliberately live OUTSIDE public/ so they aren't web-accessible:
the user wanted the maps shown but not downloadable.

Output naming: each PDF gets a kebab-cased PNG name. The mapping is hard-coded
because the source files have spaces and brackets, and we want the URLs on
the site to be tidy.

Idempotent: re-running overwrites the PNGs at the current target DPI.
"""

import sys
from pathlib import Path

import fitz  # pymupdf

ROOT       = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "atlas-source"            # PDFs (not web-served)
OUTPUT_DIR = ROOT / "public" / "atlas"        # PNGs (web-served)
TARGET_DPI = 180  # 180 dpi → ~1700×2200 for an A4 page; sharp on a projector.

# pdf filename → output png filename (kebab-case, no spaces, no brackets)
RENDER_MAP = {
    "Lusaka City Watershed Dealienation.pdf":              "01-lusaka-watershed.png",
    "Southern Africa Soil Map.pdf":                         "02-southern-africa-soil.png",
    "3d Profiling.pdf":                                     "03-mining-3d-profiling.png",
    "Zambia DEM Labelled.pdf":                              "04-zambia-dem.png",
    "African Carbon Credits Produced from 2017-2023.pdf":   "05-african-carbon-credits.png",
    "Boundary Map for Mining Exploration Area [Solwezi].pdf": "06-solwezi-boundary.png",
    "Zambia's Photovoltaic Power Potential mumu.pdf":       "07-zambia-solar-potential.png",
}


def render_one(pdf_path: Path, out_path: Path) -> None:
    """Render the first page of pdf_path to PNG at TARGET_DPI."""
    doc = fitz.open(pdf_path)
    try:
        page = doc.load_page(0)
        # mat = identity * scale; 72 dpi is the PDF base
        zoom = TARGET_DPI / 72.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pix.save(out_path)
    finally:
        doc.close()


def main() -> int:
    if not SOURCE_DIR.exists():
        print(f"atlas source dir not found: {SOURCE_DIR}", file=sys.stderr)
        return 1
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    rendered = 0
    skipped = []
    for pdf_name, png_name in RENDER_MAP.items():
        pdf_path = SOURCE_DIR / pdf_name
        out_path = OUTPUT_DIR / png_name
        if not pdf_path.exists():
            skipped.append(pdf_name)
            continue
        print(f"rendering {pdf_name} -> {png_name} @ {TARGET_DPI} dpi")
        render_one(pdf_path, out_path)
        size_kb = out_path.stat().st_size // 1024
        print(f"  wrote {out_path.name}  ({size_kb} KB)")
        rendered += 1

    print(f"\ndone — {rendered} rendered, {len(skipped)} skipped")
    if skipped:
        print("skipped (file not found):")
        for n in skipped:
            print(f"  - {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
