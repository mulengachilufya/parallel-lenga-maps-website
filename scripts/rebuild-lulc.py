"""
rebuild-lulc.py

Rebuilds land use / land cover per country straight from ESA WorldCover 2021
v200 (10 m, 11 classes), so every file covers the whole country.

The first build mosaicked tiles by hand and many countries came out partial
(Gabon 16% of the country, Mauritania 9%), and 20 countries had no file.

Per country:
  1. Outline: geoBoundaries ADM0 from the admin boundaries table, or straight
     from geoBoundaries when the table has none.
  2. Every 3 x 3 degree WorldCover tile touching the outline, downloaded
     from the public ESA bucket, 8 at a time.
  3. Cut to the outline into a Cloud Optimized GeoTIFF (DEFLATE,
     nearest neighbour overviews). WorldCover's own colour table is kept, so
     QGIS and ArcGIS open it in the official colours with no sidecar.
     No warping (the grid is WorldCover's own): the box is copied and
     everything outside the outline is blanked with gdal_rasterize -i.
  4. Check: share of the country with a valid class (must be >= 98%), and
     that every class is a WorldCover class. Preview PNG and report.
  5. --apply: upload to the existing key (or lulc/<Name>/<Name>_LULC.tif for
     a new country), copy it to the web/ key the workspace streams from, and
     update or add the lulc_layers row. Only countries that pass.

Each replaced file is first copied to archive/ (see r2_archive.py).

Usage: rebuild-lulc.py [--only ISO3,ISO3] [--apply]
"""
from __future__ import annotations

import argparse, csv, importlib.util, json, math, os, re, shutil, subprocess, sys, tempfile, urllib.request

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from osgeo import gdal, ogr, osr

from r2_archive import archive

gdal.UseExceptions()
_spec = importlib.util.spec_from_file_location('verify', os.path.join(os.path.dirname(__file__), 'verify-datasets.py'))
_verify = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_verify)
ISO3, norm = _verify.ISO3, _verify.norm

TILE = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif'
CLASSES = {10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100}
COUNTRIES = ('DZA AGO BEN BWA BFA BDI CPV CMR CAF TCD COM COD COG CIV DJI EGY GNQ ERI SWZ ETH GAB GMB GHA GIN GNB KEN LSO '
             'LBR LBY MDG MWI MLI MRT MUS MAR MOZ NAM NER NGA RWA STP SEN SYC SLE SOM ZAF SSD SDN TZA TGO TUN UGA ZMB ZWE').split()


def env(n):
    v = os.environ.get(n)
    if not v:
        sys.exit(f'Missing {n}')
    return v


def sb(path, method='GET', body=None):
    base, tok = env('SUPABASE_URL').rstrip('/'), env('SUPABASE_SERVICE_ROLE_KEY')
    req = urllib.request.Request(f'{base}/rest/v1/{path}', method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'apikey': tok, 'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        return json.loads(data) if data else None


def r2():
    return boto3.client('s3', endpoint_url=f"https://{env('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
                        aws_access_key_id=env('CLOUDFLARE_R2_ACCESS_KEY_ID'), aws_secret_access_key=env('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
                        region_name='auto', config=Config(retries={'max_attempts': 8}))


def run(cmd):
    print('+', ' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def outline(iso3, adm0, s3, bucket, work):
    row = adm0.get(iso3)
    if row:
        p = os.path.join(work, 'adm0.zip'); s3.download_file(bucket, row['r2_key'], p)
        ds = ogr.Open(f'/vsizip/{p}')
    else:
        p = os.path.join(work, 'adm0.geojson')
        urllib.request.urlretrieve(f'https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/{iso3}/ADM0/geoBoundaries-{iso3}-ADM0.geojson', p)
        ds = ogr.Open(p)
    g = None
    for f in ds.GetLayer(0):
        gg = f.GetGeometryRef().Clone()
        g = gg if g is None else g.Union(gg)
    return g if g.IsValid() else g.MakeValid()


def tiles_for(geom):
    mnx, mxx, mny, mxy = geom.GetEnvelope()
    out = []
    for lat in range(int(math.floor(mny / 3) * 3), int(math.ceil(mxy / 3) * 3), 3):
        for lon in range(int(math.floor(mnx / 3) * 3), int(math.ceil(mxx / 3) * 3), 3):
            ring = ogr.Geometry(ogr.wkbLinearRing)
            for x, y in ((lon, lat), (lon + 3, lat), (lon + 3, lat + 3), (lon, lat + 3), (lon, lat)):
                ring.AddPoint_2D(x, y)
            box = ogr.Geometry(ogr.wkbPolygon); box.AddGeometry(ring)
            if not box.Intersects(geom):
                continue
            name = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}{'E' if lon >= 0 else 'W'}{abs(lon):03d}"
            url = TILE.format(name)
            try:  # tiles exist only where there is land
                req = urllib.request.Request(url, method='HEAD')
                urllib.request.urlopen(req, timeout=30)
                out.append('/vsicurl/' + url)
            except Exception:  # noqa: BLE001
                pass
    return out


def check(path, geom, png):
    import numpy as np
    ds = gdal.Open(path)
    b = ds.GetRasterBand(1)
    ov = b
    for i in range(b.GetOverviewCount()):  # the smallest overview at least 1000 px wide
        o = b.GetOverview(i)
        if o.XSize >= 1000:
            ov = o
    arr = ov.ReadAsArray()
    gt = ds.GetGeoTransform()
    sx, sy = gt[1] * ds.RasterXSize / ov.XSize, gt[5] * ds.RasterYSize / ov.YSize
    mem = ogr.GetDriverByName('Memory').CreateDataSource('m')
    s = osr.SpatialReference(); s.ImportFromEPSG(4326)
    lyr = mem.CreateLayer('o', s, ogr.wkbMultiPolygon); f = ogr.Feature(lyr.GetLayerDefn()); f.SetGeometry(geom); lyr.CreateFeature(f)
    m = gdal.GetDriverByName('MEM').Create('', ov.XSize, ov.YSize, 1, gdal.GDT_Byte)
    m.SetGeoTransform((gt[0], sx, 0, gt[3], 0, sy)); m.SetProjection(ds.GetProjection())
    gdal.RasterizeLayer(m, [1], lyr, burn_values=[1])
    inside = m.GetRasterBand(1).ReadAsArray() == 1
    valid = inside & (arr != 0)
    share = float(valid.sum()) / max(1, int(inside.sum()))
    classes = {int(c) for c in np.unique(arr[valid])}
    os.makedirs(os.path.dirname(png), exist_ok=True)
    gdal.Translate(png, ds, format='PNG', width=900, height=0, resampleAlg='nearest')
    return share, classes, b.GetColorTable() is not None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    only = [s.strip().upper() for s in a.only.split(',') if s.strip()]
    todo = only or COUNTRIES
    gdal.SetConfigOption('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
    gdal.SetConfigOption('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.tif')
    gdal.SetConfigOption('GDAL_HTTP_MAX_RETRY', '6'); gdal.SetConfigOption('GDAL_HTTP_RETRY_DELAY', '5')
    bucket, s3 = env('CLOUDFLARE_R2_BUCKET_NAME'), r2()

    adm0 = {}
    for r in sb('admin_boundaries?select=country,country_code,admin_level,r2_key'):
        if str(r.get('admin_level')) == '0' and r.get('country_code'):
            adm0[str(r['country_code']).upper()] = r
    existing = {}
    for r in sb('lulc_layers?select=*'):
        iso = ISO3.get(norm(r['country']))
        if iso:
            existing[iso] = r

    report = []
    for iso3 in todo:
        work = tempfile.mkdtemp(dir=os.environ.get('WORK_DIR') or None)
        rec = {'iso3': iso3}
        try:
            geom = outline(iso3, adm0, s3, bucket, work)
            row = existing.get(iso3)
            name = (row or {}).get('country') or (adm0.get(iso3) or {}).get('country') or iso3
            rec['country'] = name
            tiles = tiles_for(geom)
            rec['tiles'] = len(tiles)
            if not tiles:
                raise RuntimeError('no WorldCover tiles')
            # Fetch the tiles first, 8 at a time: warping straight over HTTP
            # makes thousands of small range requests and is many times slower.
            tdir = os.path.join(work, 'tiles'); os.makedirs(tdir)
            urls = os.path.join(work, 'urls.txt')
            with open(urls, 'w') as fh:
                fh.write('\n'.join(t.replace('/vsicurl/', '') for t in tiles) + '\n')
            run(['bash', '-c', f'xargs -P 8 -n 1 curl -sSf --retry 5 --retry-delay 5 -O --output-dir {tdir} < {urls}'])
            local = sorted(os.path.join(tdir, f) for f in os.listdir(tdir))
            if len(local) != len(tiles):
                raise RuntimeError(f'fetched {len(local)} of {len(tiles)} tiles')
            vrt = os.path.join(work, 'wc.vrt')
            run(['gdalbuildvrt', '-q', vrt, *local])
            cut = os.path.join(work, 'outline.geojson')
            with open(cut, 'w') as fh:
                json.dump({'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {}, 'geometry': json.loads(geom.ExportToJson())}]}, fh)
            # Same grid as WorldCover, so no warping: copy the country's box,
            # blank everything outside the outline in place, then write the
            # COG. A gdalwarp cutline took 49 min for Malawi at 10 m.
            mnx, mxx, mny, mxy = geom.GetEnvelope()
            crop = os.path.join(work, 'crop.tif')
            run(['gdal_translate', '-q', '-projwin', str(mnx), str(mxy), str(mxx), str(mny), '-a_nodata', '0',
                 '-co', 'TILED=YES', '-co', 'BLOCKXSIZE=512', '-co', 'BLOCKYSIZE=512', '-co', 'COMPRESS=DEFLATE',
                 '-co', 'BIGTIFF=YES', '-co', 'NUM_THREADS=ALL_CPUS', '--config', 'GDAL_CACHEMAX', '2048', vrt, crop])
            shutil.rmtree(tdir, ignore_errors=True)
            run(['gdal_rasterize', '-q', '-i', '-burn', '0', '--config', 'GDAL_CACHEMAX', '2048', cut, crop])
            out = os.path.join(work, 'lulc.tif')
            run(['gdal_translate', '-q', '-of', 'COG', '-co', 'COMPRESS=DEFLATE', '-co', 'PREDICTOR=2', '-co', 'BIGTIFF=YES',
                 '-co', 'BLOCKSIZE=512', '-co', 'OVERVIEW_RESAMPLING=NEAREST', '-co', 'NUM_THREADS=ALL_CPUS',
                 '--config', 'GDAL_CACHEMAX', '2048', crop, out])
            os.remove(crop)
            size_mb = os.path.getsize(out) / 1e6
            share, classes, palette = check(out, geom, os.path.join('previews', f'{iso3}.png'))
            odd = sorted(classes - CLASSES)
            rec.update(size_mb=round(size_mb, 1), valid_pct=round(share * 100, 1), classes=len(classes), palette=palette)
            rec['status'] = 'PASS' if share >= 0.98 and not odd else f'CHECK: {share:.1%} valid' + (f', odd classes {odd}' if odd else '')
            rec['applied'] = False
            if a.apply and rec['status'] == 'PASS':
                folder = re.sub(r'[^A-Za-z0-9-]+', '_', name).strip('_')
                key = (row or {}).get('r2_key') or f'lulc/{folder}/{folder}_LULC.tif'
                if not key.lower().endswith('.tif'):
                    key = f'lulc/{folder}/{folder}_LULC.tif'
                cfg = TransferConfig(multipart_chunksize=64 * 1024 * 1024, max_concurrency=8)
                web = 'web/' + re.sub(r'\.(zip|tiff?)$', '', key, flags=re.I) + '.cog.tif'
                archive(s3, bucket, key, 'lulc', row)
                archive(s3, bucket, web, 'lulc')
                s3.upload_file(out, bucket, key, ExtraArgs={'ContentType': 'image/tiff'}, Config=cfg)
                s3.upload_file(out, bucket, web, ExtraArgs={'ContentType': 'image/tiff'}, Config=cfg)
                body = {'r2_key': key, 'file_size_mb': round(size_mb, 4), 'file_format': 'GeoTIFF (COG)',
                        'source': 'ESA WorldCover 2021 v200', 'resolution': '10m', 'epsg': 4326}
                if row:
                    sb(f"lulc_layers?id=eq.{row['id']}", 'PATCH', body)
                else:
                    sb('lulc_layers', 'POST', {**body, 'country': name, 'layer_type': 'lulc'})
                rec['applied'] = True
                rec['key'] = key
        except Exception as e:  # noqa: BLE001
            rec['status'] = f'FAIL: {str(e)[:160]}'
        finally:
            shutil.rmtree(work, ignore_errors=True)
        print(json.dumps(rec), flush=True)
        report.append(rec)

    keys = ['iso3', 'country', 'status', 'tiles', 'size_mb', 'valid_pct', 'classes', 'palette', 'applied', 'key']
    tag = os.environ.get('GROUP', '')
    with open(f'lulc-report{tag}.csv', 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=keys, extrasaction='ignore'); w.writeheader(); w.writerows(report)
    if any(r['status'].startswith('FAIL') for r in report):
        print('Some countries failed; see the report.')


if __name__ == '__main__':
    main()
