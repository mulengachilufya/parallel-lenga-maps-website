"""
repackage-lulc-with-rat.py

Each LULC GeoTIFF on R2 was uploaded with its `.aux.xml` PAM sidecar (which
holds the Raster Attribute Table — pixel value → class name + colour).
Problem: the `lulc_layers` row points at the `.tif` only. Users download
the `.tif` alone, QGIS / ArcGIS see no sidecar, and the file opens as
opaque numeric pixels.

Fix: package each country's `.tif` + `.aux.xml` into a single
`{Country}_LULC.zip`, upload that to R2, and repoint the Supabase row at
the zip. Users download one file → unzip → open → RAT loads.

Strategy (per country):
  1. Skip if r2_key already ends with `.zip` (already repackaged).
  2. Use the local `output/LULC/{Country}_LULC.tif` if it exists (fast).
     Otherwise stream the .tif from R2 to a temp file.
  3. Use the local `.tif.aux.xml` if it exists. Otherwise pull from R2
     (`lulc/{Country}/{Country}_LULC.tif.aux.xml`). If neither exists,
     skip with a warning — the country needs a sidecar regenerated.
  4. Zip both files together (no extra subdirectory — both sit at the
     archive root with their original filenames so GDAL finds the sidecar
     automatically when the user unzips).
  5. Multipart-upload the zip to `lulc/{Country}/{Country}_LULC.zip`.
  6. Update the Supabase row: `r2_key`, `file_size_mb`, `file_format =
     "GeoTIFF (ZIP)"`.
  7. Optional --delete-old: remove the orphan `.tif` and `.tif.aux.xml`
     from R2 to reclaim storage. Default OFF until the swap is verified.

Usage:
  python scripts/repackage-lulc-with-rat.py --country Zambia
  python scripts/repackage-lulc-with-rat.py --all
  python scripts/repackage-lulc-with-rat.py --all --delete-old
"""
from __future__ import annotations

import argparse
import os
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

try:
    import boto3
    import requests
    from botocore.config import Config
    from boto3.s3.transfer import TransferConfig
    from dotenv import load_dotenv
except ImportError as e:
    sys.exit(f"Missing dep: {e}\nRun: python -m pip install boto3 requests python-dotenv")


# ── Env / clients ─────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

R2_ACCOUNT_ID  = os.environ["CLOUDFLARE_R2_ACCOUNT_ID"]
R2_ACCESS_KEY  = os.environ["CLOUDFLARE_R2_ACCESS_KEY_ID"]
R2_SECRET_KEY  = os.environ["CLOUDFLARE_R2_SECRET_ACCESS_KEY"]
R2_BUCKET      = os.environ["CLOUDFLARE_R2_BUCKET_NAME"]

SUPABASE_URL   = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY   = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto",
    config=Config(s3={"addressing_style": "virtual"}, retries={"max_attempts": 5}),
)

LOCAL_LULC_DIR = Path(__file__).resolve().parent.parent / "output" / "LULC"
MULTIPART = TransferConfig(
    multipart_threshold=64 * 1024 * 1024,   # 64 MB
    multipart_chunksize=64 * 1024 * 1024,
    max_concurrency=4,
    use_threads=True,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def sb_get_layer(country: str) -> Optional[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/lulc_layers",
        headers=SUPABASE_HEADERS,
        params={"country": f"eq.{country}", "select": "*"},
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None


def sb_list_all_layers() -> list[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/lulc_layers?select=*&order=country.asc",
        headers=SUPABASE_HEADERS,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def sb_update_layer(layer_id: int, r2_key: str, size_mb: float) -> None:
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/lulc_layers?id=eq.{layer_id}",
        headers={**SUPABASE_HEADERS, "Prefer": "return=representation"},
        json={
            "r2_key":       r2_key,
            "file_size_mb": round(size_mb, 4),
            "file_format":  "GeoTIFF (ZIP)",
        },
        timeout=30,
    )
    r.raise_for_status()


def r2_object_exists(key: str) -> bool:
    try:
        r2.head_object(Bucket=R2_BUCKET, Key=key)
        return True
    except Exception:
        return False


def r2_download(key: str, dest: Path) -> None:
    r2.download_file(Bucket=R2_BUCKET, Key=key, Filename=str(dest))


def r2_upload_multipart(src: Path, key: str, content_type: str) -> None:
    r2.upload_file(
        Filename=str(src),
        Bucket=R2_BUCKET,
        Key=key,
        Config=MULTIPART,
        ExtraArgs={"ContentType": content_type},
    )


def r2_delete(key: str) -> None:
    r2.delete_object(Bucket=R2_BUCKET, Key=key)


# ── Per-country worker ────────────────────────────────────────────────────────

def repackage_country(layer: dict, *, delete_old: bool, dry_run: bool) -> str:
    """
    Returns one of: 'ok', 'skipped-already-zip', 'skipped-no-sidecar',
                    'skipped-no-tif', 'failed'.
    """
    country = layer["country"]
    layer_id = layer["id"]
    old_key = layer["r2_key"]

    if old_key.endswith(".zip"):
        print(f"  [{country}] already a zip: {old_key} — skip")
        return "skipped-already-zip"

    # ── Source files (local first, R2 fallback) ────────────────────────────
    safe_name = country.replace(" ", "_")
    local_tif     = LOCAL_LULC_DIR / f"{safe_name}_LULC.tif"
    local_sidecar = LOCAL_LULC_DIR / f"{safe_name}_LULC.tif.aux.xml"

    r2_tif_key     = old_key
    r2_sidecar_key = old_key + ".aux.xml"

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        tif_path = local_tif if local_tif.exists() else td / f"{safe_name}_LULC.tif"
        if not local_tif.exists():
            if not r2_object_exists(r2_tif_key):
                print(f"  [{country}] missing .tif on R2 ({r2_tif_key}) — skip")
                return "skipped-no-tif"
            print(f"  [{country}] downloading .tif from R2…")
            r2_download(r2_tif_key, tif_path)

        sidecar_path = local_sidecar if local_sidecar.exists() else td / f"{safe_name}_LULC.tif.aux.xml"
        if not local_sidecar.exists():
            if not r2_object_exists(r2_sidecar_key):
                print(f"  [{country}] no .aux.xml local or on R2 — skip (regenerate via finalize_and_upload_lulc.py)")
                return "skipped-no-sidecar"
            r2_download(r2_sidecar_key, sidecar_path)

        # ── Build the zip ───────────────────────────────────────────────────
        zip_local = td / f"{safe_name}_LULC.zip"
        # ZIP_STORED: TIFFs are already deflate-internally; re-compressing wastes
        # CPU and the ratio gain is < 1%. Sidecar is 14 KB — also not worth.
        with zipfile.ZipFile(zip_local, "w", zipfile.ZIP_STORED, allowZip64=True) as zf:
            zf.write(tif_path,     arcname=tif_path.name)
            zf.write(sidecar_path, arcname=sidecar_path.name)

        size_mb = zip_local.stat().st_size / (1024 * 1024)
        new_key = f"lulc/{safe_name}/{safe_name}_LULC.zip"
        print(f"  [{country}] zip {size_mb:,.1f} MB → {new_key}")

        if dry_run:
            print(f"  [{country}] dry-run: would upload + repoint DB row {layer_id}")
            return "ok"

        # ── Upload + DB update ──────────────────────────────────────────────
        try:
            r2_upload_multipart(zip_local, new_key, "application/zip")
        except Exception as e:
            print(f"  [{country}] upload FAILED: {e}")
            return "failed"

        sb_update_layer(layer_id, new_key, size_mb)
        print(f"  [{country}] ✓ DB repointed at {new_key}")

        if delete_old:
            for k in (r2_tif_key, r2_sidecar_key):
                try:
                    r2_delete(k)
                    print(f"  [{country}]   deleted {k}")
                except Exception as e:
                    print(f"  [{country}]   could not delete {k}: {e}")

        return "ok"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--country", help="Repackage one country (e.g. Zambia)")
    p.add_argument("--all",     action="store_true", help="Repackage every lulc_layers row")
    p.add_argument("--delete-old", action="store_true",
                   help="After successful zip, delete the orphan .tif + .aux.xml from R2")
    p.add_argument("--dry-run", action="store_true",
                   help="Print what would happen but do not upload or update DB")
    args = p.parse_args()

    if not (args.country or args.all):
        p.error("Pass --country NAME or --all")

    if args.country:
        layer = sb_get_layer(args.country)
        if not layer:
            sys.exit(f"No lulc_layers row for country={args.country!r}")
        layers = [layer]
    else:
        layers = sb_list_all_layers()

    print(f"Repackaging {len(layers)} layer(s)"
          + ("  [DRY-RUN]" if args.dry_run else "")
          + ("  [WILL DELETE OLD ON SUCCESS]" if args.delete_old else ""))

    summary: dict[str, int] = {}
    for layer in layers:
        try:
            outcome = repackage_country(layer, delete_old=args.delete_old, dry_run=args.dry_run)
        except Exception as e:
            print(f"  [{layer.get('country')}] CRASHED: {e}")
            outcome = "failed"
        summary[outcome] = summary.get(outcome, 0) + 1

    print()
    for k, v in summary.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
