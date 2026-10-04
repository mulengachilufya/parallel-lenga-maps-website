#!/usr/bin/env python3
"""
Rebuild the protected areas dataset for all 54 countries, properly.

Why: the first build used Overpass + osm2geojson, which silently dropped
OSM multipolygon relations. Almost every national park, game reserve and
forest reserve in Africa is a relation, so what survived were small closed
ways: Zambia had 17 fragments, DR Congo 5. This build lets GDAL's OSM
driver assemble relations into real polygons.

Steps
  1. Geofabrik africa-latest.osm.pbf, filtered with osmium to
     boundary=protected_area / boundary=national_park / leisure=nature_reserve.
  2. GDAL OSM driver -> multipolygons with the tags we keep.
  3. For each country: clip to the geoBoundaries ADM0 outline (the trusted
     layer), make geometries valid, compute areas in an equal-area CRS.
  4. Check: share of land protected, against the WDPA figure from Protected
     Planet when it can be fetched, and against the old file. Everything goes
     in rebuild-report.md / .csv.
  5. With --apply, upload each passing country to its existing R2 key and
     update protected_areas_layers. Without it, nothing is changed.

Source: OpenStreetMap contributors, ODbL. WDPA is only read to check our
numbers, never redistributed.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUDFLARE_R2_*.
Needs: gdal-bin python3-gdal osmium-tool python3-boto3.
Usage: rebuild-protected-areas.py [--only ISO3,ISO3] [--apply]
"""
import argparse, csv, json, os, re, shutil, subprocess, sys, tempfile, urllib.request, zipfile
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
ogr.UseExceptions()

PBF_URL = 'https://download.geofabrik.de/africa-latest.osm.pbf'
EQUAL_AREA = 6933  # WGS 84 / NSIDC EASE-Grid 2.0 Global (metres, equal area)

OSMCONF = """
[multipolygons]
osm_id=yes
osm_way_id=yes
attributes=name,name:en,boundary,leisure,protect_class,protection_title,designation,iucn_level,operator,ref:WDPA,protected_area
other_tags=no
[points]
attributes=name
other_tags=no
[lines]
attributes=name
other_tags=no
[multilinestrings]
attributes=name
other_tags=no
[other_relations]
attributes=name
other_tags=no
"""


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
                        region_name='auto', config=Config(retries={'max_attempts': 5}))


def run(cmd):
    print('+', ' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def wdpa_share(iso3):
    """Protected Planet's % of land protected, or None if it can't be read."""
    try:
        req = urllib.request.Request(f'https://www.protectedplanet.net/en/country/{iso3}', headers={'User-Agent': 'Mozilla/5.0 LengaMaps-QA'})
        html = urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')
        # The page embeds stats as JSON; terrestrial coverage is the first percentage after "Land".
        m = re.search(r'"title":"Land"[^}]*?"percentage":"?([0-9.]+)', html) or re.search(r'Terrestrial[^%]{0,200}?([0-9]+(?:\.[0-9]+)?)\s*%', html)
        return float(m.group(1)) if m else None
    except Exception as e:  # noqa: BLE001
        print(f'  WDPA lookup failed for {iso3}: {e}')
        return None


def load_adm0(s3, bucket, key, work):
    path = os.path.join(work, 'adm0.zip')
    s3.download_file(bucket, key, path)
    ds = ogr.Open(f'/vsizip/{path}')
    lyr = ds.GetLayer(0)
    geom = None
    for f in lyr:
        g = f.GetGeometryRef().Clone()
        geom = g if geom is None else geom.Union(g)
    return geom.MakeValid() if not geom.IsValid() else geom


def to_ea():
    src, dst = osr.SpatialReference(), osr.SpatialReference()
    src.ImportFromEPSG(4326); dst.ImportFromEPSG(EQUAL_AREA)
    for s in (src, dst):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return osr.CoordinateTransformation(src, dst)


def area_km2(g, ct):
    c = g.Clone(); c.Transform(ct)
    return c.GetArea() / 1e6


def classify(f):
    pc = (f.GetField('protect_class') or '').strip()
    title = (f.GetField('protection_title') or f.GetField('designation') or '').strip()
    if f.GetField('boundary') == 'national_park' or 'national park' in title.lower() or pc == '2':
        return 'National park'
    if f.GetField('leisure') == 'nature_reserve':
        return 'Nature reserve'
    return title or (f'IUCN/OSM class {pc}' if pc else 'Protected area')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    only = {s.strip().upper() for s in a.only.split(',') if s.strip()}

    bucket = env('CLOUDFLARE_R2_BUCKET_NAME')
    s3 = r2()
    work = tempfile.mkdtemp(prefix='pa-')
    pbf = os.path.join(work, 'africa.osm.pbf')
    pa_pbf = os.path.join(work, 'pa.osm.pbf')
    gpkg = os.path.join(work, 'pa_all.gpkg')
    conf = os.path.join(work, 'osmconf.ini')
    open(conf, 'w').write(OSMCONF)

    run(['curl', '-L', '--fail', '--retry', '5', '-o', pbf, PBF_URL])
    run(['osmium', 'tags-filter', '--overwrite', '-o', pa_pbf, pbf,
         'nwr/boundary=protected_area,national_park', 'nwr/leisure=nature_reserve'])
    os.remove(pbf)
    gdal.SetConfigOption('OSM_CONFIG_FILE', conf)
    gdal.SetConfigOption('OSM_USE_CUSTOM_INDEXING', 'NO')
    run(['ogr2ogr', '-f', 'GPKG', gpkg, pa_pbf, 'multipolygons', '-nln', 'pa', '-makevalid',
         '--config', 'OSM_CONFIG_FILE', conf,
         '-where', "boundary IN ('protected_area','national_park') OR leisure = 'nature_reserve'"])

    src = ogr.Open(gpkg)
    pa = src.GetLayer('pa')
    print('assembled polygons:', pa.GetFeatureCount(), flush=True)
    ct = to_ea()

    old = {r['iso3']: r for r in sb('protected_areas_layers?select=iso3,country,r2_key,feature_count,total_area_km2')}
    adm0 = {r['country_code']: r for r in sb('admin_boundaries?select=country,country_code,r2_key&admin_level=eq.0')}

    report = []
    for iso3 in sorted(old):
        if only and iso3 not in only:
            continue
        row = old[iso3]
        if iso3 not in adm0:
            report.append({'iso3': iso3, 'country': row['country'], 'status': 'NO ADM0'}); continue
        print(f'== {iso3} {row["country"]}', flush=True)
        cwork = tempfile.mkdtemp(dir=work)
        outline = load_adm0(s3, bucket, adm0[iso3]['r2_key'], cwork)
        land = area_km2(outline, ct)
        env_ = outline.GetEnvelope()
        pa.SetSpatialFilterRect(env_[0], env_[2], env_[1], env_[3])

        shp_dir = os.path.join(cwork, 'shp'); os.makedirs(shp_dir)
        shp = os.path.join(shp_dir, f'{iso3}_ProtectedAreas.shp')
        drv = ogr.GetDriverByName('ESRI Shapefile')
        out = drv.CreateDataSource(shp)
        srs = osr.SpatialReference(); srs.ImportFromEPSG(4326)
        ol = out.CreateLayer('protected_areas', srs, ogr.wkbMultiPolygon, ['ENCODING=UTF-8'])
        for name, t, w in [('osm_id', ogr.OFTString, 20), ('name', ogr.OFTString, 120), ('name_en', ogr.OFTString, 120),
                           ('category', ogr.OFTString, 60), ('prot_class', ogr.OFTString, 10), ('prot_title', ogr.OFTString, 80),
                           ('iucn', ogr.OFTString, 10), ('wdpa_id', ogr.OFTString, 20), ('operator', ogr.OFTString, 80),
                           ('iso3', ogr.OFTString, 3), ('country', ogr.OFTString, 60), ('area_km2', ogr.OFTReal, 0)]:
            fd = ogr.FieldDefn(name, t)
            if w: fd.SetWidth(w)
            if t == ogr.OFTReal: fd.SetWidth(14); fd.SetPrecision(3)
            ol.CreateField(fd)

        parts = []
        n = 0
        cats = {}
        pa.ResetReading()
        for f in pa:
            g = f.GetGeometryRef()
            if g is None or not g.Intersects(outline):
                continue
            g = g.Intersection(outline)
            if g is None or g.IsEmpty():
                continue
            g = ogr.ForceToMultiPolygon(g)
            if g.GetGeometryType() not in (ogr.wkbMultiPolygon, ogr.wkbMultiPolygon25D):
                continue
            a_km2 = area_km2(g, ct)
            if a_km2 < 0.001:  # slivers along the border
                continue
            o = ogr.Feature(ol.GetLayerDefn())
            oid = f.GetField('osm_id') or f'w{f.GetField("osm_way_id")}'
            cat = classify(f)
            vals = {'osm_id': str(oid), 'name': f.GetField('name'), 'name_en': f.GetField('name_en'), 'category': cat,
                    'prot_class': f.GetField('protect_class'), 'prot_title': f.GetField('protection_title') or f.GetField('designation'),
                    'iucn': f.GetField('iucn_level'), 'wdpa_id': f.GetField('ref_WDPA'), 'operator': f.GetField('operator'),
                    'iso3': iso3, 'country': row['country'], 'area_km2': round(a_km2, 3)}
            for k, v in vals.items():
                if v not in (None, ''):
                    o.SetField(k, v if not isinstance(v, str) else v[:120])
            o.SetGeometry(g)
            ol.CreateFeature(o)
            parts.append(g.Clone())
            n += 1
            cats[cat] = cats.get(cat, 0) + 1
        out = None

        union = None
        if parts:
            coll = ogr.Geometry(ogr.wkbMultiPolygon)
            for g in parts:
                for i in range(g.GetGeometryCount()):
                    coll.AddGeometry(g.GetGeometryRef(i))
            union = coll.UnionCascaded()
        covered = area_km2(union, ct) if union is not None else 0.0
        share = 100 * covered / land if land else 0
        ref = wdpa_share(iso3)
        diff = None if ref is None else share - ref
        # Pass: we found more than before and, where WDPA is known, the share
        # is within 15 points of it (OSM and WDPA never match exactly).
        status = 'PASS'
        if n == 0:
            status = 'FAIL: nothing found'
        elif n < (row['feature_count'] or 0):
            status = 'CHECK: fewer features than before'
        elif diff is not None and abs(diff) > 15:
            status = 'CHECK: far from WDPA'

        zpath = os.path.join(cwork, f'{iso3}_ProtectedAreas.zip')
        with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
            for fn in os.listdir(shp_dir):
                z.write(os.path.join(shp_dir, fn), fn)
        size_mb = os.path.getsize(zpath) / 1024 / 1024
        os.makedirs('rebuilt', exist_ok=True)
        shutil.copy(zpath, os.path.join('rebuilt', os.path.basename(zpath)))

        rec = {'iso3': iso3, 'country': row['country'], 'status': status,
               'old_features': row['feature_count'], 'new_features': n,
               'old_area_km2': row.get('total_area_km2'), 'new_area_km2': round(covered, 1),
               'land_km2': round(land), 'share_pct': round(share, 1), 'wdpa_pct': ref,
               'size_mb': round(size_mb, 2), 'categories': '; '.join(f'{k} {v}' for k, v in sorted(cats.items(), key=lambda x: -x[1])[:5])}
        report.append(rec)
        print(json.dumps(rec), flush=True)

        if a.apply and status == 'PASS':
            s3.upload_file(zpath, bucket, row['r2_key'], ExtraArgs={'ContentType': 'application/zip'})
            sb(f"protected_areas_layers?r2_key=eq.{urllib.parse.quote(row['r2_key'])}", 'PATCH', {
                'feature_count': n, 'total_area_km2': round(covered, 1), 'file_size_mb': round(size_mb, 2),
                'designation_summary': rec['categories'][:500], 'source': 'OpenStreetMap contributors · ODbL · www.openstreetmap.org/copyright',
                'source_version': 'Geofabrik ' + datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                'updated_at': datetime.now(timezone.utc).isoformat()})
            rec['applied'] = True
        shutil.rmtree(cwork, ignore_errors=True)

    keys = ['iso3', 'country', 'status', 'old_features', 'new_features', 'old_area_km2', 'new_area_km2', 'land_km2', 'share_pct', 'wdpa_pct', 'size_mb', 'categories', 'applied']
    with open('rebuild-report.csv', 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=keys, extrasaction='ignore'); w.writeheader(); w.writerows(report)
    with open('rebuild-report.md', 'w') as fh:
        fh.write(f"# Protected areas rebuild ({'applied' if a.apply else 'dry run'})\n\n")
        fh.write('| ISO3 | Country | Status | Old n | New n | New km² | % of land | WDPA % | MB |\n|---|---|---|---|---|---|---|---|---|\n')
        for r in report:
            fh.write(f"| {r['iso3']} | {r['country']} | {r['status']} | {r.get('old_features','')} | {r.get('new_features','')} | {r.get('new_area_km2','')} | {r.get('share_pct','')} | {r.get('wdpa_pct','') if r.get('wdpa_pct') is not None else ''} | {r.get('size_mb','')} |\n")
    print('done')


if __name__ == '__main__':
    import urllib.parse  # noqa: E402
    main()
