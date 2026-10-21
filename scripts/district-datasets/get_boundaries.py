"""Download geoBoundaries gbOpen ADM2 (fallback ADM1) + ADM1 for names; write bnd/<ISO>.gpkg"""
import json, sys, urllib.request, os
import geopandas as gpd, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
from countries import COUNTRIES
BASE = 'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/{iso}/{lvl}/geoBoundaries-{iso}-{lvl}'
def get(iso, lvl):
    try:
        meta = json.load(urllib.request.urlopen(BASE.format(iso=iso, lvl=lvl) + '-metaData.json', timeout=120))
        raw = urllib.request.urlopen(BASE.format(iso=iso, lvl=lvl) + '.geojson', timeout=300).read()
        tmp = f'bnd/_{iso}_{lvl}.geojson'; open(tmp, 'wb').write(raw)
        gdf = gpd.read_file(tmp); os.remove(tmp)
        return gdf, meta
    except Exception as e:
        return None, str(e)
log = {}
for iso in sorted(COUNTRIES):
    out = f'bnd/{iso}.gpkg'
    if os.path.exists(out): continue
    d2, m2 = get(iso, 'ADM2'); level = 'ADM2'
    d1, m1 = get(iso, 'ADM1')
    if d2 is None: d2, m2, level = d1, m1, 'ADM1'
    if d2 is None: log[iso] = 'FAILED ' + str(m2); print(iso, 'FAILED', m2); continue
    d2 = d2.to_crs(4326)
    d2['geometry'] = d2.geometry.make_valid()
    if level == 'ADM2' and d1 is not None:
        d1 = d1.to_crs(4326)[['shapeName', 'geometry']].rename(columns={'shapeName': 'adm1_name'})
        pts = d2.copy(); pts['geometry'] = d2.geometry.representative_point()
        j = gpd.sjoin(pts, d1, how='left', predicate='within').drop_duplicates('shapeID')
        d2['adm1_name'] = d2['shapeID'].map(j.set_index('shapeID')['adm1_name'])
    else:
        d2['adm1_name'] = d2['shapeName'] if level == 'ADM1' else None
    d2 = d2[['shapeID', 'shapeName', 'adm1_name', 'geometry']].copy()
    d2.insert(0, 'iso3', iso); d2.insert(1, 'country', COUNTRIES[iso]); d2['admin_level'] = level
    d2.to_file(out, layer='districts', driver='GPKG')
    log[iso] = {'level': level, 'n': len(d2), 'license': m2.get('boundaryLicense'), 'source': m2.get('boundarySource'), 'year': m2.get('boundaryYearRepresented')}
    print(iso, level, len(d2), m2.get('boundaryLicense'), flush=True)
json.dump(log, open('bnd/_log.json', 'a'), indent=1)
