"""October 2026 catalogue fix, run by .github/workflows/fix-oct2026.yml.

1. Crop suitability: FAO's GAEZ v5 low-input rain-fed maize layer has no value
   on about half of the land, which made district shares meaningless (Kidal,
   Mali: 97% suitable). Null it in every district GeoPackage, recompute
   best_crops_low_input, fix the licence text; blank that band in the
   LowInput GeoTIFFs and rewrite all GeoTIFFs as COGs with overviews.
2. Withhold seven files that hold no data (islands a source does not cover):
   the rows are backed up to R2 as JSON, then removed from catalog_files.
3. Rebuild the 54 country profiles and the 15 crop suitability reports from
   the corrected files, then upload everything over the same keys and update
   catalog_files.file_size_mb.

Run from scripts/district-datasets. Idempotent: a second run changes nothing new.
"""
import datetime, json, os, shutil, sqlite3, subprocess, sys, urllib.request
import boto3, numpy as np, rasterio
from rasterio.shutil import copy as rcopy

DRY = '--dry-run' in sys.argv
URL = os.environ['SUPABASE_URL'].rstrip('/'); SRK = os.environ['SUPABASE_SERVICE_ROLE_KEY']
BUCKET = os.environ['CLOUDFLARE_R2_BUCKET_NAME']
s3 = boto3.client('s3', endpoint_url=f"https://{os.environ['CLOUDFLARE_R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                  aws_access_key_id=os.environ['CLOUDFLARE_R2_ACCESS_KEY_ID'],
                  aws_secret_access_key=os.environ['CLOUDFLARE_R2_SECRET_ACCESS_KEY'], region_name='auto')
H = {'apikey': SRK, 'Authorization': f'Bearer {SRK}', 'Content-Type': 'application/json'}
LOW = 'low input, rain-fed'
WHY = ('Withheld: the FAO GAEZ v5 low-input rain-fed maize layer has no value for roughly half of the land and is not usable; '
       'see the high-input maize values in suitability_by_crop.')
LIC = 'CC BY 4.0 (FAO & IIASA GAEZ v5); boundaries: see boundary_licence'
TODAY = datetime.date.today().isoformat()
WITHHOLD = {('soil-nutrients', 'CPV'): 'iSDAsoil has no coverage: every value is null',
            ('soil-nutrients', 'MUS'): 'iSDAsoil has no coverage: every value is null',
            ('soil-nutrients', 'SYC'): 'iSDAsoil has no coverage: every value is null',
            ('crop-production', 'CPV'): 'SPAM 2020 does not cover this country: every value is zero',
            ('crop-production', 'COM'): 'SPAM 2020 does not cover this country: every value is zero',
            ('crop-production', 'SYC'): 'SPAM 2020 does not cover this country: every value is zero',
            ('tree-cover-loss', 'SYC'): 'Hansen loss layer has no data here: every value is null'}
# file-name suffix -> folder the report scripts read from
DIRS = {'_Population_Districts_2026_WorldPop.gpkg': 'Population_WorldPop', '_Rainfall_Districts_CHIRPSv3.gpkg': 'Rainfall_CHIRPSv3',
        '_Solar_Wind_Screening.gpkg': 'Energy_Screening', '_Forest_Loss.gpkg': 'Forest_Loss', '_Soil_Fertility.gpkg': 'Soil_Fertility',
        '_Road_Surface_FRST.gpkg': 'Road_Surface', '_Built_Up_Districts_GHSL.gpkg': 'Built_Up_GHSL', '_Crop_Production.gpkg': 'Crop_Production',
        '_Power_Plants_OSM.gpkg': 'Power_Plants', '_Crop_Suitability_Districts_GAEZv5.gpkg': 'Crop_Suitability_GAEZv5',
        '_Crop_Suitability_GAEZv5_LowInput.tif': 'Crop_Suitability_GAEZv5', '_Crop_Suitability_GAEZv5_HighInput.tif': 'Crop_Suitability_GAEZv5'}


def rest(method, path, body=None):
    r = urllib.request.Request(f'{URL}/rest/v1/{path}', json.dumps(body).encode() if body is not None else None, H, method=method)
    with urllib.request.urlopen(r, timeout=120) as f:
        t = f.read(); return json.loads(t) if t else None


def catalog():
    rows, off = [], 0
    while True:
        page = rest('GET', f'catalog_files?select=*&order=id&limit=1000&offset={off}')
        rows += page; off += 1000
        if len(page) < 1000: return rows


def dest(name):
    for suf, d in DIRS.items():
        if name.endswith(suf): return f'out/{d}/{name}'


def fix_gpkg(p):
    db = sqlite3.connect(p)
    # The R-tree update triggers call GDAL's ST_* functions, which plain sqlite
    # lacks; geometry is not touched, so lift them for the update and restore.
    trig = db.execute("select name, sql from sqlite_master where type='trigger' and name like 'rtree_%_update%'").fetchall()
    for n, _ in trig: db.execute(f'drop trigger "{n}"')
    db.execute("update suitability_by_crop set mean_suitability=null, pct_area_medium_or_better=null where crop_code='MZE' and input_level=?", (LOW,))
    db.execute('update crop_suitability_districts set mze_pct_suitable=null')
    by = {}
    for sid, crop, v in db.execute('select shapeID, crop, pct_area_medium_or_better from suitability_by_crop where input_level=? and pct_area_medium_or_better is not null', (LOW,)):
        by.setdefault(sid, []).append((v, crop))
    for sid, v in by.items():
        v.sort(key=lambda x: -x[0])
        best = ', '.join([c for x, c in v if x >= 25][:5]) or 'none above 25% of area'
        db.execute('update crop_suitability_districts set best_crops_low_input=? where shapeID=?', (best, sid))
    db.execute("update columns set description=? where name='mze_pct_suitable'", ('Maize, low input, rain-fed. ' + WHY,))
    db.execute("update columns set description=description || ' Maize is not ranked (low-input maize withheld).' "
               "where name='best_crops_low_input' and description not like '%Maize is not ranked%'")
    db.execute("update about set value=? where key='licence'", (LIC,))
    db.execute("update about set value=? where key='processed'", (TODAY,))
    db.execute("delete from about where key='maize_low_input'"); db.execute("insert into about(key, value) values('maize_low_input', ?)", (WHY,))
    for _, q in trig: db.execute(q)
    db.commit(); db.execute('vacuum'); db.close()


def fix_tif(p):
    tmp = p + '.edit.tif'; shutil.copy(p, tmp)
    with rasterio.open(tmp, 'r+') as d:
        if 'LowInput' in p:
            i = [k for k, s in enumerate(d.descriptions) if s and s.startswith('MZE')][0] + 1
            d.write(np.full((d.height, d.width), 255, 'uint8'), i)
            d.set_band_description(i, 'MZE_Maize_withheld_source_layer_incomplete')
            d.update_tags(MAIZE_LOW_INPUT=WHY)
        d.update_tags(LICENCE='CC BY 4.0 (FAO & IIASA GAEZ v5)', PROCESSED=TODAY)
    rcopy(tmp, p, driver='COG', compress='DEFLATE', predictor=2, overview_resampling='nearest', blocksize=256)
    os.remove(tmp)


def main():
    rows = catalog()
    by_key = {r['r2_key']: r for r in rows}
    print(len(rows), 'catalogue rows', flush=True)

    # 2. withhold the empty files (backup first)
    gone = [r for r in rows if (r['slug'], r['iso3']) in WITHHOLD and not r['r2_key'].lower().endswith('.pdf')]
    if gone:
        backup = [{**r, 'withheld_reason': WITHHOLD[(r['slug'], r['iso3'])], 'withheld_at': TODAY} for r in gone]
        key = f'backups/catalog_files_withheld_{TODAY}.json'
        print('withholding', [(r['slug'], r['iso3']) for r in gone], '->', key, flush=True)
        if not DRY:
            s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(backup, indent=1).encode(), ContentType='application/json')
            for r in gone: rest('DELETE', f"catalog_files?id=eq.{r['id']}")
    skip = {r['r2_key'] for r in gone} | {r['r2_key'] for r in rows if (r['slug'], r['iso3']) in WITHHOLD}

    # download what the fix and the reports need
    big_roads = []
    for r in rows:
        name = r['r2_key'].rsplit('/', 1)[1]; d = dest(name)
        if not d or r['r2_key'] in skip or len(name.split('_')[0]) != 3: continue
        os.makedirs(os.path.dirname(d), exist_ok=True)
        if os.path.exists(d): continue
        if name.endswith('_Road_Surface_FRST.gpkg') and float(r['file_size_mb'] or 0) > 300:
            big_roads.append((r, d)); continue
        s3.download_file(BUCKET, r['r2_key'], d)
    for r, d in big_roads:  # only the district summary is needed from the big road files
        u = s3.generate_presigned_url('get_object', Params={'Bucket': BUCKET, 'Key': r['r2_key']}, ExpiresIn=7200)
        subprocess.run(['ogr2ogr', '-f', 'GPKG', d, '/vsicurl/' + u, 'district_summary'], check=True,
                       env={**os.environ, 'GDAL_DISABLE_READDIR_ON_OPEN': 'EMPTY_DIR'})
    os.makedirs('bnd', exist_ok=True)
    import geopandas as gpd
    for f in os.listdir('out/Population_WorldPop'):
        o = f'bnd/{f[:3]}.gpkg'
        if not os.path.exists(o):
            gpd.read_file(f'out/Population_WorldPop/{f}', layer='population')[['shapeID', 'shapeName', 'adm1_name', 'geometry']].to_file(o, layer='districts', driver='GPKG')
    print('downloaded', flush=True)

    # 1. crop suitability files
    cs = 'out/Crop_Suitability_GAEZv5'
    uploads = []
    for f in sorted(os.listdir(cs)):
        p = f'{cs}/{f}'
        if f.endswith('.gpkg'): fix_gpkg(p)
        elif f.endswith('.tif'): fix_tif(p)
        else: continue
        uploads.append((p, f"datasets/{f[:3].lower()}/crop_suitability/{f}"))
    print('crop suitability fixed:', len(uploads), flush=True)

    # 3. reports
    os.makedirs('out/Country_Profiles', exist_ok=True); os.makedirs('out/Dataset_Reports', exist_ok=True)
    subprocess.run([sys.executable, '-W', 'ignore', 'country_profile.py'], check=True)
    iso15 = sorted({r['iso3'] for r in rows if r['slug'] == 'crop-suitability' and r['r2_key'].endswith('_report.pdf')})
    subprocess.run([sys.executable, '-W', 'ignore', 'dataset_reports.py', 'crop-suitability', *iso15], check=True)
    for f in sorted(os.listdir('out/Country_Profiles')):
        uploads.append((f'out/Country_Profiles/{f}', f'datasets/{f[:3].lower()}/reports/{f}'))
    for f in sorted(os.listdir('out/Dataset_Reports')):
        uploads.append((f'out/Dataset_Reports/{f}', f'datasets/{f[:3].lower()}/dataset_reports/{f}'))

    # upload over the same keys (only keys already in the catalogue)
    n = 0
    for p, key in uploads:
        if key not in by_key: print('not in catalogue, skipped:', key); continue
        size = os.path.getsize(p); mb = round(size / 1048576, 2)
        ctype = 'application/pdf' if key.endswith('.pdf') else 'image/tiff' if key.endswith('.tif') else 'application/geopackage+sqlite3'
        if not DRY:
            s3.upload_file(p, BUCKET, key, ExtraArgs={'ContentType': ctype})
            assert s3.head_object(Bucket=BUCKET, Key=key)['ContentLength'] == size, key
            rest('PATCH', f"catalog_files?r2_key=eq.{urllib.parse.quote(key, safe='')}", {'file_size_mb': mb})
        n += 1
    print(f'{"would upload" if DRY else "uploaded"} {n} files', flush=True)
    with open(os.environ.get('GITHUB_STEP_SUMMARY', os.devnull), 'a') as s:
        s.write(f'## October 2026 fix\n\n- Withheld {len(gone)} empty files\n- {"Would upload" if DRY else "Uploaded"} {n} corrected files\n')


if __name__ == '__main__':
    import urllib.parse
    main()
