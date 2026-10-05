#!/usr/bin/env python3
"""
Rebuild the roads dataset for all 54 countries from OpenStreetMap.

Why: the live roads came from Natural Earth 1:10m, a small-scale
cartographic layer of major highways only (Zambia: 63 lines, 6,699 km,
against a public road network of roughly 67,000 km). Useless for corridor,
access or exposure work.

This build keeps the classified network: motorway, trunk, primary,
secondary and tertiary roads and their link roads, with name, ref,
surface, lanes and bridge flags, clipped to each country's geoBoundaries
ADM0 outline, as a GeoPackage in EPSG:4326 with length_km per segment.

Dry run by default (report + previews on the qa-previews branch). With
--apply each country is uploaded to its existing R2 key and road_layers is
updated.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUDFLARE_R2_*.
Needs: gdal-bin python3-gdal osmium-tool python3-boto3.
"""
import argparse, csv, json, os, shutil, subprocess, sys, tempfile, urllib.parse, urllib.request
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from osgeo import gdal, ogr, osr

gdal.UseExceptions(); ogr.UseExceptions()

PBF_URL = 'https://download.geofabrik.de/africa-latest.osm.pbf'
CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary',
           'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']
OSMCONF = """
[lines]
osm_id=yes
attributes=name,name:en,highway,ref,surface,lanes,bridge,tunnel,oneway
other_tags=no
[points]
attributes=name
other_tags=no
[multipolygons]
attributes=name
other_tags=no
[multilinestrings]
attributes=name
other_tags=no
[other_relations]
attributes=name
other_tags=no
"""
EA = 6933


def env(n):
    v = os.environ.get(n)
    if not v:
        sys.exit(f'Missing {n}')
    return v


def sb(path, method='GET', body=None):
    base, tok = env('SUPABASE_URL').rstrip('/'), env('SUPABASE_SERVICE_ROLE_KEY')
    req = urllib.request.Request(f'{base}/rest/v1/{path}', method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'apikey': tok, 'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = r.read(); return json.loads(d) if d else None


def run(cmd):
    print('+', ' '.join(cmd), flush=True); subprocess.run(cmd, check=True)


def outline(s3, bucket, row, iso3, work):
    if row:
        p = os.path.join(work, 'adm0.zip'); s3.download_file(bucket, row['r2_key'], p); ds = ogr.Open(f'/vsizip/{p}')
    else:
        p = os.path.join(work, 'adm0.geojson')
        urllib.request.urlretrieve(f'https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/{iso3}/ADM0/geoBoundaries-{iso3}-ADM0.geojson', p)
        ds = ogr.Open(p)
    g = None
    for f in ds.GetLayer(0):
        gg = f.GetGeometryRef().Clone(); g = gg if g is None else g.Union(gg)
    g = g if g.IsValid() else g.MakeValid()
    gj = os.path.join(work, 'clip.geojson')
    json.dump({'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {}, 'geometry': json.loads(g.ExportToJson())}]}, open(gj, 'w'))
    return g, gj


def preview(g, gpkg, png):
    mnx, mxx, mny, mxy = g.GetEnvelope()
    w = 900; h = min(1400, max(200, int(w * (mxy - mny) / max(mxx - mnx, 1e-9))))
    ds = gdal.GetDriverByName('MEM').Create('', w, h, 1, gdal.GDT_Byte)
    ds.SetGeoTransform([mnx, (mxx - mnx) / w, 0, mxy, 0, -(mxy - mny) / h])
    s = osr.SpatialReference(); s.ImportFromEPSG(4326); ds.SetProjection(s.ExportToWkt())
    mem = ogr.GetDriverByName('Memory').CreateDataSource('m')
    l = mem.CreateLayer('o', s, ogr.wkbMultiPolygon); f = ogr.Feature(l.GetLayerDefn()); f.SetGeometry(g); l.CreateFeature(f)
    gdal.RasterizeLayer(ds, [1], l, burn_values=[1])
    src = ogr.Open(gpkg)
    gdal.RasterizeLayer(ds, [1], src.GetLayer(0), burn_values=[2])
    ct = gdal.ColorTable()
    ct.SetColorEntry(0, (255, 255, 255, 255)); ct.SetColorEntry(1, (222, 226, 230, 255)); ct.SetColorEntry(2, (150, 70, 20, 255))
    ds.GetRasterBand(1).SetRasterColorTable(ct)
    gdal.GetDriverByName('PNG').CreateCopy(png, ds)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--only', default=''); ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    only = {s.strip().upper() for s in a.only.split(',') if s.strip()}
    bucket = env('CLOUDFLARE_R2_BUCKET_NAME')
    s3 = boto3.client('s3', endpoint_url=f"https://{env('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
                      aws_access_key_id=env('CLOUDFLARE_R2_ACCESS_KEY_ID'), aws_secret_access_key=env('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
                      region_name='auto', config=Config(retries={'max_attempts': 5}))
    work = tempfile.mkdtemp(prefix='roads-')
    pbf, rpbf, allg, conf = (os.path.join(work, n) for n in ('africa.osm.pbf', 'roads.osm.pbf', 'roads_all.gpkg', 'osmconf.ini'))
    open(conf, 'w').write(OSMCONF)
    run(['curl', '-L', '--fail', '--retry', '5', '-o', pbf, PBF_URL])
    run(['osmium', 'tags-filter', '--overwrite', '-o', rpbf, pbf, 'w/highway=' + ','.join(CLASSES)])
    os.remove(pbf)
    run(['ogr2ogr', '-f', 'GPKG', allg, rpbf, 'lines', '-nln', 'roads', '--config', 'OSM_CONFIG_FILE', conf,
         '-where', 'highway IN (' + ','.join(f"'{c}'" for c in CLASSES) + ')'])
    os.remove(rpbf)

    a2 = osr.SpatialReference(); a2.ImportFromEPSG(4326); b2 = osr.SpatialReference(); b2.ImportFromEPSG(EA)
    for s in (a2, b2): s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    ct = osr.CoordinateTransformation(a2, b2)

    old = {r['iso3']: r for r in sb('road_layers?select=iso3,country,r2_key,feature_count,total_km')}
    adm0 = {r['country_code']: r for r in sb('admin_boundaries?select=country_code,r2_key&admin_level=eq.0')}
    report = []
    os.makedirs('previews', exist_ok=True); os.makedirs('rebuilt', exist_ok=True)
    for iso3 in sorted(old):
        if only and iso3 not in only:
            continue
        row = old[iso3]; cw = tempfile.mkdtemp(dir=work)
        print(f'== {iso3} {row["country"]}', flush=True)
        try:
            g, gj = outline(s3, bucket, adm0.get(iso3), iso3, cw)
        except Exception as e:  # noqa: BLE001
            report.append({'iso3': iso3, 'country': row['country'], 'status': f'NO ADM0 ({e})'}); continue
        mnx, mxx, mny, mxy = g.GetEnvelope()
        out = os.path.join(cw, f'{iso3}_Roads.gpkg')
        run(['ogr2ogr', '-f', 'GPKG', out, allg, 'roads', '-nln', 'roads', '-spat', str(mnx), str(mny), str(mxx), str(mxy),
             '-clipsrc', gj, '-nlt', 'MULTILINESTRING', '-explodecollections',
             '-sql', "SELECT osm_id, name, name_en, highway AS class, ref, surface, lanes, bridge, tunnel, oneway FROM roads"])
        ds = ogr.Open(out, 1); lyr = ds.GetLayer(0)
        lyr.CreateField(ogr.FieldDefn('length_km', ogr.OFTReal)); lyr.CreateField(ogr.FieldDefn('iso3', ogr.OFTString))
        n, tot, by = 0, 0.0, {}
        ds.StartTransaction()
        for f in lyr:
            geom = f.GetGeometryRef()
            if geom is None:
                continue
            c = geom.Clone(); c.Transform(ct); L = c.Length() / 1000
            f.SetField('length_km', round(L, 3)); f.SetField('iso3', iso3); lyr.SetFeature(f)
            n += 1; tot += L; k = (f.GetField('class') or '').replace('_link', ''); by[k] = by.get(k, 0) + L
        ds.CommitTransaction(); ds = None
        size = os.path.getsize(out) / 1024 / 1024
        try:
            preview(g, out, os.path.join('previews', f'{iso3}.png'))
        except Exception as e:  # noqa: BLE001
            print('  preview failed', e)
        shutil.copy(out, os.path.join('rebuilt', os.path.basename(out)))
        oldkm = float(row.get('total_km') or 0)
        status = 'PASS' if n and tot >= oldkm else ('FAIL: nothing found' if not n else 'CHECK: less than before')
        rec = {'iso3': iso3, 'country': row['country'], 'status': status, 'old_features': row['feature_count'], 'new_features': n,
               'old_km': round(oldkm), 'new_km': round(tot), 'size_mb': round(size, 1),
               'by_class_km': '; '.join(f'{k} {round(v)}' for k, v in sorted(by.items(), key=lambda x: -x[1]))}
        report.append(rec); print(json.dumps(rec), flush=True)
        if a.apply and status == 'PASS':
            s3.upload_file(out, bucket, row['r2_key'], ExtraArgs={'ContentType': 'application/geopackage+sqlite3'})
            sb(f"road_layers?r2_key=eq.{urllib.parse.quote(row['r2_key'])}", 'PATCH', {
                'feature_count': n, 'total_km': round(tot, 1), 'file_size_mb': round(size, 2), 'file_format': 'GeoPackage',
                'source': 'OpenStreetMap contributors · ODbL · www.openstreetmap.org/copyright',
                'source_version': 'Geofabrik ' + datetime.now(timezone.utc).strftime('%Y-%m-%d') + ' · motorway to tertiary',
                'updated_at': datetime.now(timezone.utc).isoformat()})
            rec['applied'] = True
        shutil.rmtree(cw, ignore_errors=True)

    keys = ['iso3', 'country', 'status', 'old_features', 'new_features', 'old_km', 'new_km', 'size_mb', 'by_class_km', 'applied']
    with open('rebuild-report.csv', 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=keys, extrasaction='ignore'); w.writeheader(); w.writerows(report)
    with open('rebuild-report.md', 'w') as fh:
        fh.write(f"# Roads rebuild ({'applied' if a.apply else 'dry run'})\n\n| ISO3 | Country | Status | Old n | New n | Old km | New km | MB |\n|---|---|---|---|---|---|---|---|\n")
        for r in report:
            fh.write(f"| {r['iso3']} | {r['country']} | {r['status']} | {r.get('old_features','')} | {r.get('new_features','')} | {r.get('old_km','')} | {r.get('new_km','')} | {r.get('size_mb','')} |\n")


if __name__ == '__main__':
    main()
