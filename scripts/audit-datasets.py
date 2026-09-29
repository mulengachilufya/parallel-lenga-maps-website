#!/usr/bin/env python3
"""
Open every catalogue file the way a GIS user would, and report what is broken.

For each file listed in the dataset tables it downloads the object from R2
and checks, with GDAL / OGR:
  * the object exists and is not empty;
  * it opens (zip → the shapefile / GeoPackage / GeoTIFF inside);
  * vectors: at least one layer, at least one feature, a CRS, attribute
    fields (not geometry only), and valid geometry on a sample;
  * rasters: a CRS, a nodata value, and real values (min/max not all nodata).

Writes audit-report.md and audit-report.csv, and fails the run if any file is
broken so the problem is visible in GitHub.

--gpkg also writes a single-file GeoPackage next to every zipped shapefile
(same key, .gpkg), attributes kept, EPSG:4326. The original zip is not
touched; downloads can switch to the .gpkg once reviewed.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the CLOUDFLARE_R2_* keys.
Needs gdal-bin and python3-gdal.
Usage: audit-datasets.py [--only TEXT] [--gpkg] [--limit N]
"""
import argparse, csv, json, os, re, shutil, subprocess, sys, tempfile, urllib.request, zipfile

import boto3
from botocore.config import Config

TABLES = {
    'admin_boundaries': 'admin-boundaries', 'hydrology_layers': 'hydrology', 'aquifer_layers': 'aquifer',
    'lulc_layers': 'lulc', 'rainfall_climate_layers': 'climate', 'population_settlements_layers': 'population',
    'river_layers': 'rivers', 'road_layers': 'roads', 'soil_layers': 'soil', 'protected_areas_layers': 'protected-areas',
}


def env(n):
    v = os.environ.get(n)
    if not v:
        sys.exit(f'Missing {n}')
    return v


def rows(table):
    base, tok = env('SUPABASE_URL').rstrip('/'), env('SUPABASE_SERVICE_ROLE_KEY')
    req = urllib.request.Request(f'{base}/rest/v1/{table}?select=*', headers={'apikey': tok, 'Authorization': f'Bearer {tok}'})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def inner(path, work):
    """The GIS file a download really contains."""
    if not zipfile.is_zipfile(path):
        return path, None
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if '__MACOSX' not in n]
        z.extractall(work, members=names)
    for ext in ('.gpkg', '.shp', '.geojson', '.tif', '.tiff'):
        hits = [n for n in names if n.lower().endswith(ext)]
        if hits:
            if ext == '.shp':
                stem = hits[0][:-4]
                missing = [e for e in ('.shx', '.dbf', '.prj') if not any(n.lower() == (stem + e).lower() for n in names)]
                return os.path.join(work, hits[0]), missing
            return os.path.join(work, hits[0]), None
    return None, None


def check_vector(path):
    code, out, err = run(['ogrinfo', '-json', '-so', '-al', path])
    if code:
        return 'broken', f'does not open: {err.strip()[-200:]}', {}
    info = json.loads(out)
    layers = info.get('layers', [])
    if not layers:
        return 'broken', 'no layers', {}
    problems, feats = [], 0
    for l in layers:
        feats += l.get('featureCount', 0) or 0
        if not l.get('fields'):
            problems.append(f"layer {l.get('name')} has no attribute fields")
        geo = (l.get('geometryFields') or [{}])[0]
        if not geo.get('coordinateSystem'):
            problems.append(f"layer {l.get('name')} has no CRS")
    if feats == 0:
        return 'broken', 'no features', {'features': 0}
    # Geometry validity on a sample, via SQLite dialect.
    lname = layers[0]['name']
    code, out, _ = run(['ogrinfo', '-q', '-dialect', 'SQLite', '-sql',
                        f'SELECT COUNT(*) AS bad FROM (SELECT * FROM "{lname}" LIMIT 2000) WHERE NOT ST_IsValid(GEOMETRY)', path])
    m = re.search(r'bad \(Integer\) = (\d+)', out)
    if m and int(m.group(1)) > 0:
        problems.append(f'{m.group(1)} invalid geometries in the first 2000')
    return ('warn' if problems else 'ok'), '; '.join(problems), {'features': feats, 'layers': len(layers)}


def check_raster(path):
    code, out, err = run(['gdalinfo', '-json', '-stats', path])
    if code:
        return 'broken', f'does not open: {err.strip()[-200:]}', {}
    info = json.loads(out)
    problems = []
    if not (info.get('coordinateSystem') or {}).get('wkt'):
        problems.append('no CRS')
    b = info['bands'][0]
    if b.get('noDataValue') is None:
        problems.append('no nodata value')
    mn, mx = b.get('minimum'), b.get('maximum')
    if mn is None or mx is None:
        return 'broken', 'no valid pixels', {}
    return ('warn' if problems else 'ok'), '; '.join(problems), {'min': round(mn, 3), 'max': round(mx, 3), 'size': f"{info['size'][0]}x{info['size'][1]}"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--gpkg', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()

    bucket = env('CLOUDFLARE_R2_BUCKET_NAME')
    s3 = boto3.client('s3', endpoint_url=f"https://{env('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
                      aws_access_key_id=env('CLOUDFLARE_R2_ACCESS_KEY_ID'), aws_secret_access_key=env('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
                      region_name='auto', config=Config(retries={'max_attempts': 8}))
    files = []
    for t, ds in TABLES.items():
        for r in rows(t):
            k = (r.get('r2_key') or '').strip()
            label = ds if ds != 'hydrology' and ds != 'climate' else f"{ds}:{r.get('layer_type')}"
            if a.only.lower() in (k + label).lower():
                files.append((label, r.get('country', ''), k))
    print(f'{len(files)} files to check')

    results = []
    for n, (ds, country, key) in enumerate(files):
        if a.limit and n >= a.limit:
            break
        work = tempfile.mkdtemp(prefix='audit-')
        status, note, facts = 'ok', '', {}
        try:
            if not key:
                raise RuntimeError('no file key in the database')
            head = s3.head_object(Bucket=bucket, Key=key)
            if head['ContentLength'] == 0:
                raise RuntimeError('file is empty (0 bytes)')
            local = os.path.join(work, os.path.basename(key))
            s3.download_file(bucket, key, local)
            path, missing = inner(local, work)
            if not path:
                raise RuntimeError('archive has no GIS file inside')
            if missing:
                note = f"shapefile is missing {', '.join(missing)}"
            if path.lower().endswith(('.tif', '.tiff')):
                status, n2, facts = check_raster(path)
            else:
                status, n2, facts = check_vector(path)
                if a.gpkg and status != 'broken' and path.lower().endswith('.shp'):
                    out = os.path.join(work, 'out.gpkg')
                    code, _, err = run(['ogr2ogr', '-f', 'GPKG', '-t_srs', 'EPSG:4326', '-nlt', 'PROMOTE_TO_MULTI', '-makevalid', out, path])
                    if code == 0:
                        gk = re.sub(r'\.zip$', '', key, flags=re.I) + '.gpkg'
                        s3.upload_file(out, bucket, gk, ExtraArgs={'ContentType': 'application/geopackage+sqlite3'})
                        facts['gpkg'] = gk
                    else:
                        n2 = (n2 + '; ' if n2 else '') + f'GeoPackage conversion failed: {err.strip()[-120:]}'
            if missing and status == 'ok':
                status = 'warn'
            note = '; '.join(x for x in (note, n2) if x)
        except s3.exceptions.ClientError:
            status, note = 'broken', 'file not found in storage'
        except Exception as e:  # report and carry on with the rest
            status, note = 'broken', str(e)[:200]
        finally:
            shutil.rmtree(work, ignore_errors=True)
        results.append({'dataset': ds, 'country': country, 'key': key, 'status': status, 'note': note, **{k: facts.get(k, '') for k in ('features', 'min', 'max', 'size', 'gpkg')}})
        print(f"[{status:6}] {ds:28} {country:30} {note}")

    cols = ['dataset', 'country', 'status', 'note', 'features', 'min', 'max', 'size', 'gpkg', 'key']
    with open('audit-report.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(results)
    bad = [r for r in results if r['status'] == 'broken']
    warn = [r for r in results if r['status'] == 'warn']
    with open('audit-report.md', 'w') as f:
        f.write(f'# Dataset audit\n\n{len(results)} files: {len(results) - len(bad) - len(warn)} ok, {len(warn)} with warnings, {len(bad)} broken.\n\n')
        for title, group in (('Broken', bad), ('Warnings', warn)):
            if group:
                f.write(f'## {title}\n\n| Dataset | Country | Problem |\n|---|---|---|\n')
                f.writelines(f"| {r['dataset']} | {r['country']} | {r['note']} |\n" for r in group)
                f.write('\n')
    print(open('audit-report.md').read())
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
