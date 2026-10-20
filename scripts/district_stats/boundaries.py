"""
Download geoBoundaries gbOpen districts for the 54 countries and report
what each country got: admin level, district count and licence.

  python scripts/district_stats/boundaries.py
  python scripts/district_stats/boundaries.py --country ZMB,KEN

Writes output/.cache/geoboundaries/report.json. Any country whose licence
is not CC BY 4.0 is listed at the end so it can be checked before release.
"""

from __future__ import annotations

import argparse
import json
import sys

from common import CACHE_DIR, load_districts, log, targets


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--country")
    args = ap.parse_args()

    report, odd = {}, []
    for iso3, country in targets(args.country):
        try:
            d = load_districts(iso3)
        except Exception as err:
            log(f"{iso3}  FAILED  {err}")
            report[iso3] = {"error": str(err)}
            continue
        lic = d.meta.get("boundary_license") or ""
        report[iso3] = {"country": country, "admin_level": d.admin_level, "districts": d.n, **d.meta,
                        "adm1_missing": int(d.gdf["adm1_name"].isna().sum())}
        flag = "" if "CC BY 4.0" in lic or "Attribution 4.0" in lic else "   <-- licence"
        log(f"{iso3}  ADM{d.admin_level}  {d.n:5d} districts  {lic}{flag}")
        if flag:
            odd.append(iso3)

    out = CACHE_DIR / "geoboundaries" / "report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    log(f"\nReport: {out}")
    if odd:
        log("Not CC BY 4.0: " + ", ".join(f"{i} ({report[i]['boundary_license']})" for i in odd))
    return 0


if __name__ == "__main__":
    sys.exit(main())
