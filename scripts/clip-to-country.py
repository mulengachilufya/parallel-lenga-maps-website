"""
clip-to-country.py

Cuts each file of a vector catalogue table to its country's geoBoundaries
ADM0 outline, keeping every attribute. Used for aquifers: the WHYMAP / IGRAC
aquifer systems are transboundary, so a country's file held whole systems
reaching far over the border (Lesotho 23% inside, South Africa 24%).

Per row: download, intersect every feature with the outline, drop slivers
under 0.01 km2, recompute area_km2 (equal area, EPSG:6933), write a
GeoPackage, draw a preview and report the share that was inside. --apply
uploads to the same key and updates feature_count / file_size_mb.

Usage: clip-to-country.py --table aquifer_layers [--only Zambia,Kenya] [--apply]
"""
from __future__ import annotations

import argparse, csv, importlib.util, json, os, shutil, sys, tempfile, urllib.request, zipfile

from osgeo import gdal, ogr, osr

gdal.UseExceptions(); ogr.UseExceptions()
_spec = importlib.util.spec_from_file_location('verify', os.path.join(os.path.dirname(__file__), 'verify-datasets.py'))
_v = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_v)

DIR = {'aquifer_layers': 'aquifer'}


def sb(path, method='GET', body=None):
    base, tok = _v.env('SUPABASE_URL').rstrip('/'), _v.env('SUPABASE_SERVICE_ROLE_KEY')
    req = urllib.request.Request(f'{base}/rest/v1/{path}', method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'apikey': tok, 'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        return json.loads(data) if data else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--table', required=True)
    ap.add_argument('--only', default='')
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    only = {_v.norm(s) for s in a.only.split(',') if s.strip()}
    _v.CT = _v.ea_ct()
    import boto3
    from botocore.config import Config
    bucket = _v.env('CLOUDFLARE_R2_BUCKET_NAME')
    s3 = boto3.client('s3', endpoint_url=f"https://{_v.env('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
                      aws_access_key_id=_v.env('CLOUDFLARE_R2_ACCESS_KEY_ID'), aws_secret_access_key=_v.env('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
                      region_name='auto', config=Config(retries={'max_attempts': 8}))
    adm0 = {}
    for r in _v.rows('admin_boundaries'):
        if str(r.get('admin_level')) == '0':
            adm0[_v.norm(r['country'])] = r
            if r.get('country_code'):
                adm0[str(r['country_code']).upper()] = r
    ds_name = DIR.get(a.table, a.table)
    cache, report = {}, []
    for row in sb(f'{a.table}?select=*&order=country'):
        country, key = row['country'], row['r2_key']
        if only and _v.norm(country) not in only:
            continue
        rec = {'country': country, 'key': key, 'old_features': row.get('feature_count')}
        work = tempfile.mkdtemp()
        try:
            outline = _v.outline_for(country, adm0, s3, bucket, cache, row.get('iso3') or row.get('country_code'))
            if outline is None:
                raise RuntimeError('no country outline')
            local = os.path.join(work, os.path.basename(key))
            s3.download_file(bucket, key, local)
            path = _v.inner(local, work)
            src = ogr.Open(path)
            lyr = src.GetLayer(0)
            srs = lyr.GetSpatialRef()
            w = osr.SpatialReference(); w.ImportFromEPSG(4326); w.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            to4326 = None
            if srs is not None:
                srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                if not srs.IsSame(w):
                    to4326 = osr.CoordinateTransformation(srs, w)
            out = os.path.join(work, 'clipped.gpkg')
            dst = ogr.GetDriverByName('GPKG').CreateDataSource(out)
            ol = dst.CreateLayer(lyr.GetName() or ds_name, w, ogr.wkbMultiPolygon)
            defn = lyr.GetLayerDefn()
            names = []
            for i in range(defn.GetFieldCount()):
                fd = defn.GetFieldDefn(i)
                if fd.GetName().lower() != 'area_km2':
                    ol.CreateField(fd); names.append(fd.GetName())
            ol.CreateField(ogr.FieldDefn('area_km2', ogr.OFTReal))
            tot = ins = 0.0
            n = 0
            for f in lyr:
                g = f.GetGeometryRef()
                if g is None:
                    continue
                g = g.Clone()
                if to4326:
                    g.Transform(to4326)
                if not g.IsValid():
                    g = g.MakeValid()
                tot += _v.km2(g)
                c = g.Intersection(outline)
                if c is None or c.IsEmpty():
                    continue
                c = ogr.ForceToMultiPolygon(c)
                a_km2 = _v.km2(c)
                if a_km2 < 0.01:
                    continue
                ins += a_km2
                o = ogr.Feature(ol.GetLayerDefn())
                for nm in names:
                    o.SetField(nm, f.GetField(nm))
                o.SetField('area_km2', round(a_km2, 3))
                o.SetGeometry(c); ol.CreateFeature(o); n += 1
            dst = None
            rec.update(new_features=n, inside_pct=round(100 * ins / tot, 1) if tot else '',
                       coverage_pct=round(100 * ins / _v.km2(outline), 1), size_mb=round(os.path.getsize(out) / 1e6, 3))
            png = os.path.join('previews', _v.re.sub(r'[^a-zA-Z0-9_-]', '_', country) + '.png')
            try:
                _v.vector_preview(out, outline, png)
            except Exception as e:  # noqa: BLE001
                print('  preview failed', e)
            rec['status'] = 'PASS' if n > 0 else 'CHECK: nothing inside the country'
            rec['applied'] = False
            if a.apply and n > 0:
                body = out
                if key.lower().endswith('.zip'):
                    body = os.path.join(work, 'out.zip')
                    with zipfile.ZipFile(body, 'w', zipfile.ZIP_DEFLATED) as z:
                        z.write(out, os.path.basename(path).rsplit('.', 1)[0] + '.gpkg')
                s3.upload_file(body, bucket, key)
                sb(f"{a.table}?id=eq.{row['id']}", 'PATCH', {'feature_count': n, 'file_size_mb': round(os.path.getsize(body) / 1e6, 4)})
                rec['applied'] = True
        except Exception as e:  # noqa: BLE001
            rec['status'] = f'FAIL: {str(e)[:160]}'
        finally:
            shutil.rmtree(work, ignore_errors=True)
        print(json.dumps(rec), flush=True)
        report.append(rec)
    keys = ['country', 'status', 'old_features', 'new_features', 'inside_pct', 'coverage_pct', 'size_mb', 'applied', 'key']
    with open('clip-report.csv', 'w', newline='') as fh:
        wtr = csv.DictWriter(fh, fieldnames=keys, extrasaction='ignore'); wtr.writeheader(); wtr.writerows(report)
    with open('clip-report.md', 'w') as fh:
        fh.write(f'# Clip to country: {a.table}\n\n| Country | Status | Old n | New n | % of old area inside | % of country covered | MB | Applied |\n|---|---|---|---|---|---|---|---|\n')
        for r in report:
            fh.write(f"| {r['country']} | {r['status']} | {r.get('old_features','')} | {r.get('new_features','')} | {r.get('inside_pct','')} | {r.get('coverage_pct','')} | {r.get('size_mb','')} | {r.get('applied','')} |\n")


if __name__ == '__main__':
    main()
