#!/usr/bin/env python3
"""
Build the fast map ("web") version of every catalogue raster.

For each raster file in the catalogue (land cover, rainfall, temperature,
drought, soil, DEM, population rasters) this writes a Cloud Optimized
GeoTIFF to R2 at  web/<original key without .zip/.tif>.cog.tif  (the key the
app looks for, see src/lib/workspace/web-layers.ts). The original files are
never touched: downloads keep serving exactly what they served before.

A COG stores the raster in 512 px tiles plus zoomed out overviews, so the
workspace map reads only the part it is showing, over HTTP Range requests.

Safe to re-run: files whose web version already exists are skipped unless
--force is given. Also makes sure the bucket's CORS rules let the browser
make Range requests from lengamaps.com (adds a rule, never removes one).

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUDFLARE_R2_ACCOUNT_ID,
     CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY,
     CLOUDFLARE_R2_BUCKET_NAME
Needs GDAL command line tools (gdalinfo, gdal_translate, gdalwarp).

Usage: build-web-layers.py [--force] [--only SUBSTRING] [--limit N] [--dry-run]
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request, zipfile

import boto3
from botocore.config import Config

RASTER_TABLES = ['lulc_layers', 'rainfall_climate_layers', 'soil_layers', 'dem_layers', 'population_settlements_layers']
ORIGINS = ['https://www.lengamaps.com', 'https://lengamaps.com']


def web_key(key: str) -> str:
    return 'web/' + re.sub(r'\.(zip|tiff?)$', '', key, flags=re.I) + '.cog.tif'


def env(name):
    v = os.environ.get(name)
    if not v:
        sys.exit(f'Missing environment variable {name}')
    return v


def catalogue_keys():
    base = env('SUPABASE_URL').rstrip('/')
    tok = env('SUPABASE_SERVICE_ROLE_KEY')
    keys = []
    for t in RASTER_TABLES:
        req = urllib.request.Request(f'{base}/rest/v1/{t}?select=r2_key',
                                     headers={'apikey': tok, 'Authorization': f'Bearer {tok}'})
        try:
            rows = json.loads(urllib.request.urlopen(req, timeout=60).read())
        except Exception as e:  # a missing table must not stop the rest
            print(f'  skip table {t}: {e}')
            continue
        for r in rows:
            k = (r.get('r2_key') or '').strip()
            if k and re.search(r'\.(tiff?|zip)$', k, re.I):
                keys.append(k)
        print(f'  {t}: {len(rows)} rows')
    return sorted(set(keys))


def s3():
    return boto3.client('s3', endpoint_url=f"https://{env('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
                        aws_access_key_id=env('CLOUDFLARE_R2_ACCESS_KEY_ID'),
                        aws_secret_access_key=env('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
                        region_name='auto', config=Config(retries={'max_attempts': 8, 'mode': 'standard'}))


def exists(c, bucket, key):
    try:
        c.head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


def ensure_cors(c, bucket):
    rule = {'AllowedOrigins': ORIGINS, 'AllowedMethods': ['GET', 'HEAD'], 'AllowedHeaders': ['*'],
            'ExposeHeaders': ['Content-Range', 'Content-Length', 'Accept-Ranges', 'ETag'], 'MaxAgeSeconds': 3600}
    try:
        rules = c.get_bucket_cors(Bucket=bucket).get('CORSRules', [])
    except Exception:
        rules = []
    for r in rules:
        if set(ORIGINS) <= set(r.get('AllowedOrigins', [])) and 'GET' in r.get('AllowedMethods', []) \
                and 'Content-Range' in r.get('ExposeHeaders', []):
            print('CORS: Range reads already allowed')
            return
    try:
        c.put_bucket_cors(Bucket=bucket, CORSConfiguration={'CORSRules': rules + [rule]})
        print('CORS: added a rule allowing Range reads from lengamaps.com')
    except Exception as e:  # the R2 token may not manage bucket settings
        print(f'CORS: could not update ({e}); the map falls back to the same-origin proxy, so building continues')


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:2])} failed: {p.stderr.strip()[-600:]}")
    return p.stdout


def find_tif(path, work):
    if not zipfile.is_zipfile(path):
        return path
    with zipfile.ZipFile(path) as z:
        tifs = [i for i in z.infolist() if re.search(r'\.tiff?$', i.filename, re.I) and '__MACOSX' not in i.filename]
        if not tifs:
            return None
        best = max(tifs, key=lambda i: i.file_size)
        z.extract(best, work)
        return os.path.join(work, best.filename)


def to_cog(src, dst):
    info = json.loads(run(['gdalinfo', '-json', src]))
    band = info['bands'][0]
    dtype = band.get('type', 'Byte')
    classes = 'colorTable' in band or dtype in ('Byte', 'UInt8') and len(info['bands']) == 1
    floaty = dtype.startswith('Float')
    resampling = 'NEAREST' if classes else ('AVERAGE' if floaty or len(info['bands']) >= 3 else 'BILINEAR')
    epsg = None
    wkt = (info.get('coordinateSystem') or {}).get('wkt', '')
    m = re.findall(r'ID\["EPSG",(\d+)\]', wkt)
    if m:
        epsg = m[-1]
    co = ['-co', 'COMPRESS=DEFLATE', '-co', f"PREDICTOR={'3' if floaty else '2'}", '-co', 'BLOCKSIZE=512',
          '-co', 'BIGTIFF=IF_SAFER', '-co', 'NUM_THREADS=ALL_CPUS', '-co', f'RESAMPLING={resampling}',
          '-co', 'OVERVIEWS=IGNORE_EXISTING']
    if epsg in (None, '4326'):
        run(['gdal_translate', '-of', 'COG', *co, src, dst])
    else:
        # The web map expects longitude / latitude.
        run(['gdalwarp', '-t_srs', 'EPSG:4326', '-r', resampling.lower() if resampling != 'AVERAGE' else 'average',
             '-of', 'COG', *co, '-multi', '-wo', 'NUM_THREADS=ALL_CPUS', src, dst])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    bucket = env('CLOUDFLARE_R2_BUCKET_NAME')
    c = s3()
    if not a.dry_run:
        ensure_cors(c, bucket)
    keys = [k for k in catalogue_keys() if a.only.lower() in k.lower()]
    print(f'{len(keys)} raster files in the catalogue')

    done = skipped = failed = 0
    failures = []
    for k in keys:
        if a.limit and done >= a.limit:
            break
        wk = web_key(k)
        if not a.force and exists(c, bucket, wk):
            skipped += 1
            continue
        if a.dry_run:
            print('would build', wk)
            done += 1
            continue
        work = tempfile.mkdtemp(prefix='weblayer-')
        t0 = time.time()
        try:
            src = os.path.join(work, os.path.basename(k))
            c.download_file(bucket, k, src)
            tif = find_tif(src, work)
            if not tif:
                print(f'  - {k}: no raster inside, skipped')
                skipped += 1
                continue
            out = os.path.join(work, 'out.cog.tif')
            to_cog(tif, out)
            c.upload_file(out, bucket, wk, ExtraArgs={'ContentType': 'image/tiff', 'CacheControl': 'private, max-age=86400'})
            mb_in, mb_out = os.path.getsize(src) / 1e6, os.path.getsize(out) / 1e6
            print(f'  + {wk}  {mb_in:.0f} MB → {mb_out:.0f} MB  ({time.time() - t0:.0f}s)')
            done += 1
        except Exception as e:
            failed += 1
            failures.append((k, str(e)))
            print(f'  ! {k}: {e}')
        finally:
            shutil.rmtree(work, ignore_errors=True)

    print(f'\nBuilt {done}, skipped {skipped}, failed {failed}')
    for k, e in failures:
        print(f'  FAILED {k}: {e}')
    # Some failures (a corrupt source file) should not hide the rest, but the
    # run must still show red so someone looks.
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
