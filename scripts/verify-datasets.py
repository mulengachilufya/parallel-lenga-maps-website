#!/usr/bin/env python3
"""
Check that every catalogue file is spatially right, not just openable.

audit-datasets.py only proves a file opens and has features. That passed a
protected areas layer holding 2% of Zambia's parks. This script compares
each file with the country it claims to cover, using the geoBoundaries ADM0
outline (the trusted layer):

  inside    share of the data (area, length or points) that falls inside the
            country. Low means the wrong country, a bad projection or a clip
            that leaked.
  coverage  how much of the country the data covers:
              polygons that should tile the country (watersheds, soils,
              admin, population units): area of the union inside / country;
              lines and points (rivers, roads, lakes): share of 0.25 degree
              grid cells inside the country that the data touches.
  values    rasters: CRS, valid data inside the country, value range checked
            against what the variable can physically be.

Each file also gets a preview PNG. Report, CSV and previews go to
verify-report.md / .csv and previews/<dataset>/<country>.png.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUDFLARE_R2_*.
Usage: verify-datasets.py [--only TEXT] [--limit N]
"""
import argparse, csv, json, math, os, re, shutil, sys, tempfile, urllib.request, zipfile

import boto3
from botocore.config import Config
from osgeo import gdal, ogr, osr

gdal.UseExceptions(); ogr.UseExceptions()

# table -> (dataset label, rule). Rules: 'tile' polygons should cover the
# country; 'network' lines should reach most of it; 'features' only need to
# sit inside it; 'raster' value checks by variable.
TABLES = {
    'admin_boundaries': 'admin-boundaries', 'hydrology_layers': 'hydrology', 'aquifer_layers': 'aquifer',
    'lulc_layers': 'lulc', 'rainfall_climate_layers': 'climate', 'population_settlements_layers': 'population',
    'road_layers': 'roads', 'soil_layers': 'soil', 'protected_areas_layers': 'protected-areas',
}
RULE = {
    'admin-boundaries': 'tile', 'soil': 'tile', 'population': 'tile', 'hydrology:watersheds': 'tile',
    'hydrology:rivers': 'network', 'roads': 'network',
    # Lakes on a border (Malawi, Victoria, Kivu, Tanganyika) are kept whole, so
    # most of their area can lie outside: check that each one touches the country.
    'hydrology:lakes': 'shared', 'hydrology:wetlands': 'features', 'aquifer': 'features', 'protected-areas': 'features',
}
# Plausible ranges for rasters (after nodata is removed).
RANGES = {
    # Most specific first: a drought file's key can also contain "rainfall".
    'spi': (-6, 6), 'drought': (-6, 6),
    'rainfall': (0, 12000), 'precip': (0, 12000), 'temperature': (-30, 60), 'temp': (-30, 60),
    'lulc': (0, 255), 'dem': (-500, 6000), 'elevation': (-500, 6000),
}
# Every spelling the tables use, normalised, to ISO3. Territories with no
# geoBoundaries outline (Bir Tawil) stay unmatched and are reported as such.
ISO3 = {
    'algeria': 'DZA', 'angola': 'AGO', 'benin': 'BEN', 'botswana': 'BWA', 'burkinafaso': 'BFA', 'burundi': 'BDI',
    'caboverde': 'CPV', 'capeverde': 'CPV', 'cameroon': 'CMR', 'centralafricanrepublic': 'CAF',
    'centralafricarepublic': 'CAF', 'centralafricanrep': 'CAF', 'car': 'CAF', 'chad': 'TCD', 'comoros': 'COM',
    'congo': 'COG', 'republicofthecongo': 'COG', 'congobrazzaville': 'COG', 'democraticrepublicofthecongo': 'COD',
    'democraticrepublicofcongo': 'COD', 'drcongo': 'COD', 'demrepcongo': 'COD', 'drc': 'COD',
    'cotedivoire': 'CIV', 'ctedivoire': 'CIV', 'ivorycoast': 'CIV', 'djibouti': 'DJI', 'egypt': 'EGY',
    'equatorialguinea': 'GNQ', 'eqguinea': 'GNQ', 'eritrea': 'ERI', 'eswatini': 'SWZ', 'swaziland': 'SWZ',
    'ethiopia': 'ETH', 'gabon': 'GAB', 'gambia': 'GMB', 'thegambia': 'GMB', 'ghana': 'GHA', 'guinea': 'GIN',
    'guineabissau': 'GNB', 'kenya': 'KEN', 'lesotho': 'LSO', 'liberia': 'LBR', 'libya': 'LBY',
    'madagascar': 'MDG', 'malawi': 'MWI', 'mali': 'MLI', 'mauritania': 'MRT', 'mauritius': 'MUS',
    'morocco': 'MAR', 'mozambique': 'MOZ', 'namibia': 'NAM', 'niger': 'NER', 'nigeria': 'NGA', 'rwanda': 'RWA',
    'saotomeandprincipe': 'STP', 'saotome': 'STP', 'senegal': 'SEN', 'seychelles': 'SYC', 'sierraleone': 'SLE',
    'somalia': 'SOM', 'southafrica': 'ZAF', 'southsudan': 'SSD', 'ssudan': 'SSD', 'sudan': 'SDN',
    'tanzania': 'TZA', 'unitedrepublicoftanzania': 'TZA', 'togo': 'TGO', 'tunisia': 'TUN', 'uganda': 'UGA',
    'zambia': 'ZMB', 'zimbabwe': 'ZWE', 'westernsahara': 'ESH', 'wsahara': 'ESH',
}
# Not in geoBoundaries as their own unit: compare with the country that holds them.
PART_OF = {'somaliland': 'SOM'}
WORLDCOVER = {10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100}
EA = 6933
CELL = 0.25


def env(n):
    v = os.environ.get(n)
    if not v:
        sys.exit(f'Missing {n}')
    return v


def rows(table):
    base, tok = env('SUPABASE_URL').rstrip('/'), env('SUPABASE_SERVICE_ROLE_KEY')
    req = urllib.request.Request(f'{base}/rest/v1/{table}?select=*', headers={'apikey': tok, 'Authorization': f'Bearer {tok}'})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def norm(s):
    return re.sub(r'[^a-z]', '', (s or '').lower().replace('&', 'and'))


def ea_ct():
    a, b = osr.SpatialReference(), osr.SpatialReference()
    a.ImportFromEPSG(4326); b.ImportFromEPSG(EA)
    for s in (a, b):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return osr.CoordinateTransformation(a, b)


CT = None


def km2(g):
    c = g.Clone(); c.Transform(CT); return c.GetArea() / 1e6


def km(g):
    c = g.Clone(); c.Transform(CT); return c.Length() / 1e3


def inner(path, work):
    if not zipfile.is_zipfile(path):
        return path
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if '__MACOSX' not in n]
        z.extractall(work, members=names)
    for ext in ('.gpkg', '.shp', '.geojson', '.json', '.tif', '.tiff'):
        hits = [n for n in names if n.lower().endswith(ext) and 'metadata' not in n.lower()]
        if hits:
            hits.sort(key=lambda n: os.path.getsize(os.path.join(work, n)), reverse=True)
            return os.path.join(work, hits[0])
    return None


def outline_for(country, adm0, s3, bucket, cache, iso=None):
    k = norm(country)
    iso = (iso or ISO3.get(k) or PART_OF.get(k) or '').upper()
    ck = iso or k
    if ck in cache:
        return cache[ck]
    row = adm0.get(iso) or adm0.get(k)
    g = None
    try:
        if row:
            work = tempfile.mkdtemp()
            p = os.path.join(work, 'a.zip'); s3.download_file(bucket, row['r2_key'], p)
            ds = ogr.Open(f'/vsizip/{p}')
        elif iso:
            # Not in the admin boundaries table: take it straight from geoBoundaries.
            ds = ogr.Open(f'/vsicurl/https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/{iso}/ADM0/geoBoundaries-{iso}-ADM0.geojson')
        else:
            ds = None
        if ds is None:
            cache[ck] = None
            return None
        for f in ds.GetLayer(0):
            gg = f.GetGeometryRef().Clone()
            g = gg if g is None else g.Union(gg)
        if g and not g.IsValid():
            g = g.MakeValid()
    except Exception as e:  # noqa: BLE001
        print('  outline failed', country, e)
    cache[ck] = g
    return g


def grid_cells(outline):
    mnx, mxx, mny, mxy = outline.GetEnvelope()
    cells = []
    x = math.floor(mnx / CELL) * CELL
    while x < mxx:
        y = math.floor(mny / CELL) * CELL
        while y < mxy:
            ring = ogr.Geometry(ogr.wkbLinearRing)
            for px, py in ((x, y), (x + CELL, y), (x + CELL, y + CELL), (x, y + CELL), (x, y)):
                ring.AddPoint_2D(px, py)
            c = ogr.Geometry(ogr.wkbPolygon); c.AddGeometry(ring)
            ctr = c.Centroid()
            if outline.Contains(ctr):
                cells.append((x, y, c))
            y += CELL
        x += CELL
    return cells


def check_vector(path, outline, rule):
    ds = ogr.Open(path)
    lyr = ds.GetLayer(0)
    srs = lyr.GetSpatialRef()
    to4326 = None
    if srs is not None:
        w = osr.SpatialReference(); w.ImportFromEPSG(4326); w.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        if not srs.IsSame(w):
            to4326 = osr.CoordinateTransformation(srs, w)
    geoms = []
    for f in lyr:
        g = f.GetGeometryRef()
        if g is None:
            continue
        g = g.Clone()
        if to4326:
            g.Transform(to4326)
        if not g.IsValid():
            g = g.MakeValid()
        geoms.append(g)
    n = len(geoms)
    if n == 0:
        return 'FAIL', 'no features', {'features': 0}
    gt = ogr.GT_Flatten(geoms[0].GetGeometryType())
    kind = 'polygon' if gt in (ogr.wkbPolygon, ogr.wkbMultiPolygon) else 'line' if gt in (ogr.wkbLineString, ogr.wkbMultiLineString) else 'point'
    facts = {'features': n, 'kind': kind}
    if outline is None:
        return 'CHECK', 'no country outline to compare with', facts

    if kind == 'polygon':
        coll = ogr.Geometry(ogr.wkbMultiPolygon)
        for g in geoms:
            g = ogr.ForceToMultiPolygon(g)
            for i in range(g.GetGeometryCount()):
                coll.AddGeometry(g.GetGeometryRef(i))
        u = coll.UnionCascaded()
        tot = km2(u) or 1e-9
        ins = km2(u.Intersection(outline))
        land = km2(outline)
        facts.update(inside=round(ins / tot, 3), coverage=round(ins / land, 3), area_km2=round(tot))
        if rule == 'shared':
            facts['inside'] = round(sum(1 for g in geoms if g.Intersects(outline)) / n, 3)
    else:
        cells = grid_cells(outline)
        if kind == 'line':
            tot = sum(km(g) for g in geoms) or 1e-9
            ins = sum(km(g.Intersection(outline)) for g in geoms if g.Intersects(outline))
            facts.update(length_km=round(tot))
        else:
            tot = n
            ins = sum(1 for g in geoms if outline.Contains(g))
        facts['inside'] = round(ins / tot, 3)
        if cells:
            env_ = [g.GetEnvelope() for g in geoms]
            hit = 0
            for x, y, c in cells:
                for (a, b, cc, d), g in zip(env_, geoms):
                    if a > x + CELL or b < x or cc > y + CELL or d < y:
                        continue
                    if g.Intersects(c):
                        hit += 1; break
            facts['coverage'] = round(hit / len(cells), 3)

    problems = []
    if facts.get('inside', 1) < 0.85 and rule not in ('features', 'shared'):
        problems.append(f"only {facts['inside']:.0%} inside the country")
    elif facts.get('inside', 1) < 0.6:
        problems.append(f"only {facts['inside']:.0%} inside the country")
    cov = facts.get('coverage')
    if rule == 'tile' and cov is not None and cov < 0.95:
        problems.append(f'covers only {cov:.0%} of the country')
    if rule == 'network' and cov is not None and cov < 0.5:
        problems.append(f'reaches only {cov:.0%} of the country')
    status = 'FAIL' if any('only' in p and ('covers' in p or 'inside' in p) and float(re.findall(r'(\d+)%', p)[0]) < 70 for p in problems) else ('CHECK' if problems else 'PASS')
    return status, '; '.join(problems), facts


def check_raster(path, outline, label):
    ds = gdal.Open(path)
    facts = {'size': f'{ds.RasterXSize}x{ds.RasterYSize}'}
    if not ds.GetProjection():
        return 'FAIL', 'no CRS', facts
    b = ds.GetRasterBand(1)
    nod = b.GetNoDataValue()
    problems = [] if nod is not None else ['no nodata value']
    # Cut to the country at <= 800 px, using overviews where the file has them.
    warp_to = '/vsimem/cut.tif'
    cut_ds = None
    if outline is not None:
        cut_ds = '/vsimem/outline.geojson'
        gdal.FileFromMemBuffer(cut_ds, json.dumps({'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {}, 'geometry': json.loads(outline.ExportToJson())}]}))
    opts = gdal.WarpOptions(dstSRS='EPSG:4326', width=800, height=0, resampleAlg='near', dstNodata=nod if nod is not None else -9999,
                            cutlineDSName=cut_ds, cropToCutline=outline is not None, multithread=True)
    cut = gdal.Warp(warp_to, ds, options=opts)
    cb = cut.GetRasterBand(1)
    arr = cb.ReadAsArray().astype('float64')
    nd = nod if nod is not None else -9999
    import numpy as np  # noqa: E402
    mask_ds = None
    if outline is not None:
        mem = ogr.GetDriverByName('Memory').CreateDataSource('m')
        s = osr.SpatialReference(); s.ImportFromEPSG(4326)
        l = mem.CreateLayer('o', s, ogr.wkbMultiPolygon); f = ogr.Feature(l.GetLayerDefn()); f.SetGeometry(outline); l.CreateFeature(f)
        mask_ds = gdal.GetDriverByName('MEM').Create('', cut.RasterXSize, cut.RasterYSize, 1, gdal.GDT_Byte)
        mask_ds.SetGeoTransform(cut.GetGeoTransform()); mask_ds.SetProjection(cut.GetProjection())
        gdal.RasterizeLayer(mask_ds, [1], l, burn_values=[1])
        inside = mask_ds.GetRasterBand(1).ReadAsArray() == 1
    else:
        inside = np.ones(arr.shape, bool)
    valid = inside & (arr != nd) & np.isfinite(arr)
    frac = float(valid.sum()) / max(1, int(inside.sum()))
    facts['valid_inside'] = round(frac, 3)
    if valid.any():
        v = arr[valid]
        facts.update(min=round(float(v.min()), 2), max=round(float(v.max()), 2), mean=round(float(v.mean()), 2))
        key = next((k for k in RANGES if k in label.lower()), None)
        if key:
            lo, hi = RANGES[key]
            if facts['min'] < lo or facts['max'] > hi:
                problems.append(f'values {facts["min"]}..{facts["max"]} outside {lo}..{hi}')
        if 'lulc' in label.lower():
            classes = set(int(x) for x in np.unique(v)[:50])
            odd = classes - WORLDCOVER
            if odd:
                problems.append(f'classes not in WorldCover: {sorted(odd)[:8]}')
            facts['classes'] = len(classes)
    if outline is None:
        problems.append('no country outline to compare with')
    elif frac < 0.9:
        problems.append(f'data covers only {frac:.0%} of the country')
    status = 'FAIL' if (outline is not None and frac < 0.7) or 'no CRS' in problems else ('CHECK' if problems else 'PASS')
    # Preview
    try:
        os.makedirs(os.path.dirname(PREVIEW[0]), exist_ok=True)
        gdal.Translate(PREVIEW[0], cut, format='PNG', outputType=gdal.GDT_Byte, scaleParams=[[facts.get('min', 0), facts.get('max', 1), 1, 255]], noData=0)
    except Exception:  # noqa: BLE001
        pass
    gdal.Unlink(warp_to)
    if cut_ds:
        gdal.Unlink(cut_ds)
    return status, '; '.join(problems), facts


def vector_preview(path, outline, png):
    if outline is None:
        return
    mnx, mxx, mny, mxy = outline.GetEnvelope()
    w = 700; h = min(1200, max(200, int(w * (mxy - mny) / max(mxx - mnx, 1e-9))))
    ds = gdal.GetDriverByName('MEM').Create('', w, h, 1, gdal.GDT_Byte)
    ds.SetGeoTransform([mnx, (mxx - mnx) / w, 0, mxy, 0, -(mxy - mny) / h])
    s = osr.SpatialReference(); s.ImportFromEPSG(4326); ds.SetProjection(s.ExportToWkt())
    mem = ogr.GetDriverByName('Memory').CreateDataSource('m')
    l = mem.CreateLayer('o', s, ogr.wkbMultiPolygon); f = ogr.Feature(l.GetLayerDefn()); f.SetGeometry(outline); l.CreateFeature(f)
    gdal.RasterizeLayer(ds, [1], l, burn_values=[1])
    src = ogr.Open(path)
    gdal.RasterizeLayer(ds, [1], src.GetLayer(0), burn_values=[2], options=['ALL_TOUCHED=TRUE'])
    ct = gdal.ColorTable()
    ct.SetColorEntry(0, (255, 255, 255, 255)); ct.SetColorEntry(1, (222, 226, 230, 255)); ct.SetColorEntry(2, (21, 95, 159, 255))
    ds.GetRasterBand(1).SetRasterColorTable(ct)
    os.makedirs(os.path.dirname(png), exist_ok=True)
    gdal.GetDriverByName('PNG').CreateCopy(png, ds)


PREVIEW = ['']


def main():
    global CT
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    CT = ea_ct()
    bucket = env('CLOUDFLARE_R2_BUCKET_NAME')
    s3 = boto3.client('s3', endpoint_url=f"https://{env('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
                      aws_access_key_id=env('CLOUDFLARE_R2_ACCESS_KEY_ID'), aws_secret_access_key=env('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
                      region_name='auto', config=Config(retries={'max_attempts': 8}))
    # GDAL reads big rasters straight from R2 (range requests, overviews when present).
    gdal.SetConfigOption('AWS_S3_ENDPOINT', f"{env('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com")
    gdal.SetConfigOption('AWS_ACCESS_KEY_ID', env('CLOUDFLARE_R2_ACCESS_KEY_ID'))
    gdal.SetConfigOption('AWS_SECRET_ACCESS_KEY', env('CLOUDFLARE_R2_SECRET_ACCESS_KEY'))
    gdal.SetConfigOption('AWS_REGION', 'auto'); gdal.SetConfigOption('AWS_VIRTUAL_HOSTING', 'FALSE')

    adm0 = {}
    for r in rows('admin_boundaries'):
        if str(r.get('admin_level')) == '0':
            adm0[norm(r['country'])] = r
            if r.get('country_code'):
                adm0[str(r['country_code']).upper()] = r
    files = []
    for t, ds in TABLES.items():
        for r in rows(t):
            k = (r.get('r2_key') or '').strip()
            sub = r.get('layer_type') or r.get('variable_name') or ''
            label = f'{ds}:{sub}' if ds in ('hydrology', 'climate') and sub else ds
            if t == 'admin_boundaries' and str(r.get('admin_level')) != '0':
                label = f'admin-boundaries:ADM{r.get("admin_level")}'
            if a.only.lower() in (k + label + (r.get('country') or '')).lower():
                files.append((label, r.get('country') or r.get('country_name') or '', k, r))
    print(f'{len(files)} files', flush=True)

    cache, results = {}, []
    for i, (label, country, key, r) in enumerate(files):
        if a.limit and i >= a.limit:
            break
        work = tempfile.mkdtemp()
        rule = RULE.get(label) or RULE.get(label.split(':')[0]) or ('tile' if label.startswith('admin-boundaries') else 'features')
        status, note, facts = 'CHECK', '', {}
        try:
            outline = outline_for(country, adm0, s3, bucket, cache, r.get('iso3') or r.get('country_code'))
            png = os.path.join('previews', re.sub(r'[^a-zA-Z0-9_-]', '_', label), re.sub(r'[^a-zA-Z0-9_-]', '_', country) + '.png')
            if key.lower().endswith(('.tif', '.tiff')):
                web = 'web/' + re.sub(r'\.(zip|tiff?)$', '', key, flags=re.I) + '.cog.tif'
                try:
                    s3.head_object(Bucket=bucket, Key=web); src = f'/vsis3/{bucket}/{web}'; facts['read'] = 'web COG'
                except Exception:  # noqa: BLE001
                    src = f'/vsis3/{bucket}/{key}'; facts['read'] = 'original'
                PREVIEW[0] = png
                status, note, f2 = check_raster(src, outline, label + ' ' + key)
                facts.update(f2)
            else:
                local = os.path.join(work, os.path.basename(key) or 'f')
                s3.download_file(bucket, key, local)
                path = inner(local, work)
                if not path:
                    raise RuntimeError('no GIS file inside')
                if path.lower().endswith(('.tif', '.tiff')):
                    PREVIEW[0] = png
                    status, note, facts = check_raster(path, outline, label + ' ' + key)
                else:
                    status, note, facts = check_vector(path, outline, rule)
                    try:
                        vector_preview(path, outline, png)
                    except Exception as e:  # noqa: BLE001
                        print('  preview failed', e)
        except Exception as e:  # noqa: BLE001
            status, note = 'FAIL', str(e)[:200]
        finally:
            shutil.rmtree(work, ignore_errors=True)
        rec = {'dataset': label, 'country': country, 'status': status, 'note': note, 'key': key, **facts}
        results.append(rec)
        print(json.dumps(rec), flush=True)

    cols = ['dataset', 'country', 'status', 'note', 'features', 'kind', 'inside', 'coverage', 'area_km2', 'length_km', 'valid_inside', 'min', 'max', 'mean', 'classes', 'size', 'read', 'key']
    with open('verify-report.csv', 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore'); w.writeheader(); w.writerows(results)
    by = {}
    for r in results:
        by.setdefault(r['dataset'], []).append(r)
    with open('verify-report.md', 'w') as fh:
        fh.write('# Dataset verification\n\n| Dataset | Files | PASS | CHECK | FAIL |\n|---|---|---|---|---|\n')
        for d, rs in sorted(by.items()):
            c = lambda s: sum(1 for x in rs if x['status'] == s)  # noqa: E731
            fh.write(f'| {d} | {len(rs)} | {c("PASS")} | {c("CHECK")} | {c("FAIL")} |\n')
        fh.write('\n## Problems\n\n| Dataset | Country | Status | Note | inside | coverage |\n|---|---|---|---|---|---|\n')
        for r in results:
            if r['status'] != 'PASS':
                fh.write(f"| {r['dataset']} | {r['country']} | {r['status']} | {r['note']} | {r.get('inside', '')} | {r.get('coverage', r.get('valid_inside', ''))} |\n")
    print('done')


if __name__ == '__main__':
    main()
