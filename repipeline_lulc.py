"""
repipeline_lulc.py

Orchestrates re-running africa_lulc_pipeline.py for the broken + missing
countries, smallest-first. For each country:
  1. Delete any stale local file/sidecar (so the pipeline regenerates clean)
  2. Run `python africa_lulc_pipeline.py --country "Foo"`
  3. On failure, retry up to N times with exponential backoff
  4. Log progress to a CSV

Resume-safe: skips countries whose local file already exists with > MIN_OK_MB
size and whose Supabase row exists. Only flags as done after a successful
pipeline exit, since the pipeline itself uploads to R2 + Supabase.
"""
from __future__ import annotations

import argparse
import csv
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

from africa_lulc_pipeline import (
    OUTPUT_DIR,
    SUPABASE_HEADERS,
    SUPABASE_URL,
    r2_safe,
)


LOG_DIR = Path("logs/lulc")
LOG_DIR.mkdir(parents=True, exist_ok=True)
RUN_TS  = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
CSV_LOG = LOG_DIR / f"repipeline_{RUN_TS}.csv"


# Size order, smallest area first. Includes the 4 broken + 1 borderline + 19 missing.
DEFAULT_QUEUE = [
    # ── re-pipeline broken (small, cheap) ─────────────────────────────────────
    "Comoros",                  # 1,862 km²  (broken: 61% cov)
    "Mauritius",                # 2,040 km²  (missing)
    "Gambia",                   # 11,295 km² (broken: 0% cov!)
    "Djibouti",                 # 23,200 km² (broken: 34% cov)
    "Rwanda",                   # 26,338 km² (missing)
    "Guinea-Bissau",            # 36,125 km² (broken: 27% cov)
    # ── missing — medium ───────────────────────────────────────────────────────
    "Ivory Coast",              # 322,463 km²
    "Congo",                    # 342,000 km²  (Republic of Congo)
    "Morocco",                  # 446,550 km²
    "Central African Republic", # 622,984 km²
    "Somalia",                  # 637,657 km²
    "South Sudan",              # 644,329 km²
    "Mozambique",               # 801,590 km²
    "Nigeria",                  # 923,768 km²
    "Egypt",                    # 1,001,449 km²
    "Ethiopia",                 # 1,104,300 km²
    # ── re-pipeline broken (large) ─────────────────────────────────────────────
    "South Africa",             # 1,221,037 km² (broken: 58% cov)
    # ── missing — large ────────────────────────────────────────────────────────
    "Mali",                     # 1,240,192 km²
    "Niger",                    # 1,267,000 km²
    "Chad",                     # 1,284,000 km²
    "Libya",                    # 1,759,540 km²
    "Sudan",                    # 1,861,484 km²
    "Democratic Republic of the Congo",  # 2,344,858 km²
    "Algeria",                  # 2,381,741 km²
]


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def supabase_has_row(country: str) -> bool:
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/lulc_layers?country=eq.{requests.utils.quote(country)}&select=country",
            headers=SUPABASE_HEADERS,
            timeout=15,
        )
        return r.ok and len(r.json()) > 0
    except Exception:
        return False


def already_done(country: str, min_ok_mb: float) -> bool:
    safe = r2_safe(country)
    tif = OUTPUT_DIR / f"{safe}_LULC.tif"
    if not tif.exists():
        return False
    if tif.stat().st_size < min_ok_mb * 1048576:
        return False
    return supabase_has_row(country)


def delete_stale(country: str) -> None:
    safe = r2_safe(country)
    for suffix in ("_LULC.tif", "_LULC.tif.aux.xml", "_LULC.cog_tmp.tif"):
        p = OUTPUT_DIR / f"{safe}{suffix}"
        if p.exists():
            p.unlink()
            log(f"    deleted stale {p.name}")


def run_pipeline(country: str, max_attempts: int = 3) -> bool:
    """Call africa_lulc_pipeline.py --country X. Return True on exit code 0."""
    for attempt in range(1, max_attempts + 1):
        log(f"    attempt {attempt}/{max_attempts}: pipeline --country '{country}'")
        proc = subprocess.run(
            [sys.executable, "africa_lulc_pipeline.py", "--country", country],
            cwd=str(Path(__file__).parent),
        )
        if proc.returncode == 0:
            return True
        log(f"    pipeline exited code {proc.returncode}")
        if attempt < max_attempts:
            backoff = 30 * attempt
            log(f"    backing off {backoff}s before retry")
            time.sleep(backoff)
    return False


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--queue", nargs="*", help="Override default queue with these countries")
    p.add_argument("--limit", type=int, default=0, help="Process at most N countries (0 = all)")
    p.add_argument("--min-ok-mb", type=float, default=0.5,
                   help="Local files smaller than this are considered stale (default: 0.5)")
    p.add_argument("--force", action="store_true",
                   help="Re-run even if Supabase row + local file already look healthy")
    p.add_argument("--delete-broken", nargs="*", default=[],
                   help="Always delete local file for these countries before running "
                        "(use for files that exist but are broken)")
    args = p.parse_args()

    queue = args.queue if args.queue else DEFAULT_QUEUE
    if args.limit > 0:
        queue = queue[: args.limit]

    log("=" * 65)
    log(f"  Re-pipeline LULC — {len(queue)} countries (smallest-first)")
    log(f"  CSV log : {CSV_LOG}")
    log("=" * 65)

    # Initialize CSV
    with CSV_LOG.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["timestamp_utc", "country", "result", "duration_s", "note"])

    delete_set = {c.lower() for c in args.delete_broken}
    delete_set.update({"comoros", "gambia", "djibouti", "guinea-bissau", "south africa"})

    results = {}
    t_total = time.time()
    for idx, country in enumerate(queue, 1):
        log(f"\n[{idx:02d}/{len(queue)}] {country}")
        if not args.force and already_done(country, args.min_ok_mb):
            log(f"    already done (local + Supabase) — skipping")
            results[country] = "skip"
            with CSV_LOG.open("a", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow([time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), country, "skip", 0, "already done"])
            continue
        if country.lower() in delete_set:
            delete_stale(country)
        t0 = time.time()
        ok = run_pipeline(country)
        dt = time.time() - t0
        results[country] = "ok" if ok else "fail"
        with CSV_LOG.open("a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow([time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), country, results[country], int(dt), ""])
        log(f"    >>> {country}: {results[country].upper()}  ({dt/60:.1f} min)")

    log("\n" + "=" * 65)
    log(f"  Done — total {(time.time() - t_total)/60:.1f} min")
    ok_count = sum(1 for v in results.values() if v == "ok")
    log(f"  OK   : {ok_count}")
    log(f"  Fail : {sum(1 for v in results.values() if v == 'fail')}")
    log(f"  Skip : {sum(1 for v in results.values() if v == 'skip')}")
    log("=" * 65)
    sys.exit(0 if all(v != "fail" for v in results.values()) else 1)


if __name__ == "__main__":
    main()
