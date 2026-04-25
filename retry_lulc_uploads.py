"""
retry_lulc_uploads.py

Idempotent retry for specific LULC uploads that failed due to transient network
errors in finalize_and_upload_lulc.py. For each country:
  1. HEAD the R2 keys — skip upload if present and size matches local
  2. Upload .tif and .tif.aux.xml via multipart if missing/wrong size
  3. Upsert Supabase lulc_layers row

Built-in retry on SSL/connection errors (up to 5 attempts with backoff).
Exit non-zero if any country still failing after retries.
"""
from __future__ import annotations

import argparse
import ssl
import sys
import time
from pathlib import Path
from typing import Optional

import requests
from botocore.exceptions import ClientError, ConnectionClosedError, EndpointConnectionError
from botocore.exceptions import SSLError as BotoSSLError

from africa_lulc_pipeline import (
    ESA_CLASSES,
    OUTPUT_DIR,
    R2_BUCKET,
    SUPABASE_HEADERS,
    SUPABASE_URL,
    build_r2_key,
    r2,
    r2_safe,
    r2_upload,
)


LULC_TABLE_URL = f"{SUPABASE_URL}/rest/v1/lulc_layers"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def r2_head(key: str) -> Optional[int]:
    try:
        resp = r2.head_object(Bucket=R2_BUCKET, Key=key)
        return int(resp["ContentLength"])
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "NotFound") or e.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
            return None
        raise


def _abort_stale_mpus(key: str) -> None:
    try:
        resp = r2.list_multipart_uploads(Bucket=R2_BUCKET, Prefix=key)
        for u in resp.get("Uploads", []) or []:
            if u.get("Key") == key:
                try:
                    r2.abort_multipart_upload(Bucket=R2_BUCKET, Key=key, UploadId=u["UploadId"])
                    log(f"    aborted stale MPU {u['UploadId'][:20]}…")
                except Exception:
                    pass
    except Exception:
        pass


def upload_with_retries(local: Path, key: str, content_type: str, max_attempts: int = 5) -> None:
    for attempt in range(1, max_attempts + 1):
        _abort_stale_mpus(key)
        try:
            r2_upload(local, key, content_type)
            return
        except (ConnectionClosedError, EndpointConnectionError, BotoSSLError, ssl.SSLError,
                requests.exceptions.SSLError, requests.exceptions.ConnectionError) as e:
            if attempt >= max_attempts:
                raise
            backoff = min(60, 5 * attempt)
            log(f"    transient {type(e).__name__} (attempt {attempt}/{max_attempts}) — retry in {backoff}s")
            time.sleep(backoff)
        except ClientError as e:
            if attempt >= max_attempts:
                raise
            s = str(e)
            if "SSL" in s or "Connection" in s or "Timeout" in s:
                backoff = min(60, 5 * attempt)
                log(f"    ClientError (attempt {attempt}/{max_attempts}) — retry in {backoff}s")
                time.sleep(backoff)
            else:
                raise


def supa_upsert_with_retries(payload: dict, max_attempts: int = 5) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            resp = requests.post(
                LULC_TABLE_URL,
                headers=SUPABASE_HEADERS,
                json=payload,
                timeout=60,
            )
            resp.raise_for_status()
            return
        except (requests.exceptions.SSLError, requests.exceptions.ConnectionError,
                requests.exceptions.Timeout) as e:
            if attempt >= max_attempts:
                raise
            backoff = min(60, 5 * attempt)
            log(f"    Supabase transient {type(e).__name__} (attempt {attempt}/{max_attempts}) — retry in {backoff}s")
            time.sleep(backoff)


def process_country(country: str, force: bool = False) -> bool:
    log(f"── {country} ──")
    safe = r2_safe(country)
    tif = OUTPUT_DIR / f"{safe}_LULC.tif"
    aux = Path(str(tif) + ".aux.xml")

    if not tif.exists():
        log(f"    ERROR: local tif missing: {tif.name}")
        return False
    if not aux.exists():
        log(f"    ERROR: local sidecar missing: {aux.name}")
        return False

    tif_key = build_r2_key(country)
    aux_key = tif_key + ".aux.xml"

    local_tif_size = tif.stat().st_size
    local_aux_size = aux.stat().st_size

    # TIF
    remote_tif_size = None if force else r2_head(tif_key)
    if remote_tif_size == local_tif_size:
        log(f"    tif already in R2 ({local_tif_size/1048576:.1f} MB) — skipping")
    else:
        if remote_tif_size is not None:
            log(f"    tif size mismatch (remote={remote_tif_size}, local={local_tif_size}) — re-uploading")
        t0 = time.time()
        upload_with_retries(tif, tif_key, "image/tiff")
        dt = time.time() - t0
        log(f"    R2 uploaded tif ({local_tif_size/1048576:.1f} MB in {dt:.1f}s ≈ {local_tif_size/1048576/dt:.1f} MB/s)")

    # AUX
    remote_aux_size = None if force else r2_head(aux_key)
    if remote_aux_size == local_aux_size:
        log(f"    aux.xml already in R2 — skipping")
    else:
        upload_with_retries(aux, aux_key, "application/xml")
        log(f"    R2 uploaded aux.xml")

    # Supabase — schema must match finalize_and_upload_lulc.upsert_supabase()
    payload = {
        "country":      country,
        "layer_type":   "lulc",
        "r2_key":       tif_key,
        "file_size_mb": round(local_tif_size / 1048576, 4),
        "file_format":  "GeoTIFF",
        "source":       "ESA WorldCover 2021 v200",
        "resolution":   "10m",
        "epsg":         4326,
    }
    supa_upsert_with_retries(payload)
    log(f"    Supabase upserted → {country}")
    return True


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--countries", nargs="+", required=True, help="Country names (space-separated)")
    p.add_argument("--force", action="store_true")
    args = p.parse_args()

    log(f"Retry upload for {len(args.countries)} countries")
    results = {}
    for c in args.countries:
        try:
            ok = process_country(c, force=args.force)
        except Exception as e:
            log(f"    FATAL: {type(e).__name__}: {str(e)[:300]}")
            ok = False
        results[c] = ok
        log("")

    log("=" * 60)
    log(f"Summary: {sum(results.values())}/{len(results)} succeeded")
    for c, ok in results.items():
        log(f"  {'OK  ' if ok else 'FAIL'} {c}")
    sys.exit(0 if all(results.values()) else 1)


if __name__ == "__main__":
    main()
