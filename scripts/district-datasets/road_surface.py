"""FRST road surface type (Africa, 2025; ESSD 18:267, 2026) per country: segments cut exactly to the geoBoundaries
outline with geodesic lengths recomputed (the source Rd_length is measured in Web Mercator and overstates length by
about 1/cos(latitude)), plus a district summary of paved / unpaved km, paved share and road density."""
import sys, os, json, ssl, time, shutil, subprocess, datetime, urllib.request, warnings, numpy as np, pandas as pd, geopandas as gpd
from pyproj import Geod
from multiprocessing import Pool
warnings.filterwarnings('ignore')
sys.path.insert(0, 'tools')
from countries import COUNTRIES
from build_gpkg import BASE_COLS, BOUND_ABOUT
GEOD = Geod(ellps='WGS84'); LIC = json.load(open('bnd/licences.json'))
CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
URLS = json.load(open('roads/raw/urls.json'))
FILE = {'MAR': 'Morocco', 'MWI': 'Malawi', 'EGY': 'Egypt', 'KEN': 'Kenya', 'CIV': 'IvoryCoast', 'BFA': 'BurkinaFaso', 'ETH': 'Ethiopia',
        'BWA': 'Botswana', 'CMR': 'Cameroon', 'AGO': 'Angola', 'COD': 'CongoDR', 'TCD': 'Chad', 'DZA': 'Algeria', 'BEN': 'Benin',
        'BDI': 'Burundi', 'CAF': 'CentralAfrian', 'COG': 'Congo', 'DJI': 'Djibouti', 'GNQ': 'Equatorial', 'ERI': 'Eritrea', 'GAB': 'Gabon',
        'GMB': 'Gambia', 'GHA': 'Ghana', 'GIN': 'Guinea', 'GNB': 'GuineaBissau', 'LSO': 'Lesotho', 'LBR': 'Liberia', 'LBY': 'Libya',
        'MDG': 'Madagascar', 'MLI': 'Mali', 'MRT': 'Mauritania', 'MOZ': 'Mozambique', 'NAM': 'Namibia', 'NER': 'Niger', 'NGA': 'Nigeria',
        'RWA': 'Rwanda', 'SEN': 'Senegal', 'SLE': 'SierraLeone', 'SOM': 'Somalia', 'ZAF': 'SouthAfrica', 'SSD': 'SouthSudan', 'SDN': 'Sudan',
        'SWZ': 'Swaziland', 'TZA': 'Tanzania', 'TGO': 'Togo', 'TUN': 'Tunisia', 'UGA': 'Uganda', 'ZMB': 'Zambia', 'ZWE': 'Zimbabwe'}
EXTRA = {'MAR': ['WestSahara']}   # geoBoundaries' Morocco outline includes Western Sahara
CIT = 'Zhou, Q. et al. (2026). The first road surface type dataset for 50 African countries and regions. Earth System Science Data 18, 267. https://essd.copernicus.org/articles/18/267/2026/ ; data: https://doi.org/10.6084/m9.figshare.29424107'
def fetch(name):
    d = f'roads/raw/{name}'
    if not os.path.isdir(d):
        rar = f'roads/raw/{name}.rar'
        if not os.path.exists(rar):
            for i in range(4):
                try:
                    with urllib.request.urlopen(URLS[name + '.rar'], timeout=900, context=CTX) as r, open(rar + '.part', 'wb') as f:
                        while (b := r.read(1 << 22)): f.write(b)
                    os.replace(rar + '.part', rar); break
                except Exception:
                    if i == 3: raise
                    time.sleep(10 * (i + 1))
        subprocess.run(['bsdtar', '-xf', name + '.rar'], cwd='roads/raw', check=True)
        os.remove(rar)
    shp = [os.path.join(dp, f) for dp, _, fs in os.walk(d) for f in fs if f.endswith('.shp')]
    return pd.concat([gpd.read_file(s) for s in shp]).to_crs(4326)
def glen(g):
    return GEOD.geometry_length(g) / 1000
def one(iso):
    out = f'out/Road_Surface/{iso}_Road_Surface_FRST.gpkg'
    if os.path.exists(out): return iso, 'done'
    names = [FILE[iso]] + EXTRA.get(iso, [])
    raw = gpd.GeoDataFrame(pd.concat([fetch(n) for n in names], ignore_index=True), crs=4326)
    src_km = float(sum(glen(g) for g in raw.geometry))
    import shapely
    d = gpd.read_file(f'bnd/{iso}.gpkg')
    d['geometry'] = d.geometry.make_valid()
    rg = shapely.force_2d(raw.geometry.values); dg = d.geometry.values
    shapely.prepare(dg)
    ri, di = d.sindex.query(rg, predicate='intersects')
    inside = shapely.within(rg[ri], dg[di])
    pieces = rg[ri].copy()
    cut = ~inside
    pieces[cut] = shapely.intersection(rg[ri][cut], dg[di][cut])
    seg = gpd.GeoDataFrame({'source_id': raw['ID'].values[ri].astype('int64'), 'surface': raw['Surface'].str.lower().str.strip().values[ri],
                            'shapeID': d.shapeID.values[di], 'district': d.shapeName.values[di]}, geometry=pieces, crs=4326)
    seg = seg[~seg.geometry.is_empty]
    # keep line parts only (border cuts can leave points)
    seg['geometry'] = [g if g.geom_type in ('LineString', 'MultiLineString') else shapely.union_all([x for x in shapely.get_parts(g) if x.geom_type == 'LineString']) for g in seg.geometry]
    seg = seg[~seg.geometry.is_empty & seg.geometry.geom_type.isin(['LineString', 'MultiLineString'])]
    seg['length_km'] = [round(glen(g), 4) for g in seg.geometry]
    seg = seg[seg.length_km > 0]
    roads = gpd.GeoDataFrame({'iso3': iso, 'country': COUNTRIES[iso], 'source_id': seg.source_id, 'surface': seg.surface, 'shapeID': seg.shapeID,
                              'district': seg.district, 'length_km': seg.length_km}, geometry=seg.geometry, crs=4326)
    piv = roads.pivot_table(index='shapeID', columns='surface', values='length_km', aggfunc='sum', fill_value=0)
    d['area_ha'] = [round(abs(GEOD.geometry_area_perimeter(g)[0]) / 1e4, 1) for g in d.geometry]
    d['paved_km'] = d.shapeID.map(piv.get('paved', pd.Series(dtype=float))).fillna(0).round(2)
    d['unpaved_km'] = d.shapeID.map(piv.get('unpaved', pd.Series(dtype=float))).fillna(0).round(2)
    d['road_km'] = (d.paved_km + d.unpaved_km).round(2)
    d['paved_pct'] = np.where(d.road_km > 0, (100 * d.paved_km / d.road_km.where(d.road_km > 0, 1)).round(2), np.nan)
    d['road_density_km_per_km2'] = (d.road_km / (d.area_ha / 100)).round(4)
    d['boundary_licence'] = LIC.get(iso, {}).get('license')
    if os.path.exists(out): os.remove(out)
    roads.to_file(out, layer='roads', driver='GPKG')
    dcols = BASE_COLS + [('paved_km', 'km', 'Length of paved road in the district (geodesic)'), ('unpaved_km', 'km', 'Length of unpaved road in the district (geodesic)'),
                         ('road_km', 'km', 'paved_km + unpaved_km'), ('paved_pct', '%', 'Share of road length that is paved (empty where the district has no mapped road)'),
                         ('road_density_km_per_km2', 'km/km2', 'Mapped road length per km2 of district area'), ('boundary_licence', '', 'Licence of the district boundary')]
    gpd.GeoDataFrame(d[[c for c, _, _ in dcols] + ['geometry']], crs=4326).to_file(out, layer='district_summary', driver='GPKG')
    import sqlite3
    con = sqlite3.connect(out)
    about = {'title': f'Road surface type (paved / unpaved), {COUNTRIES[iso]}', 'country': COUNTRIES[iso],
             'source': 'FRST: road surface type dataset for 50 African countries and regions (figshare 29424107, v1, 2025), built on OpenStreetMap roads',
             'citation': CIT, 'licence': 'CC BY 4.0 (FRST). Road geometry derives from OpenStreetMap (ODbL).',
             'boundaries': BOUND_ABOUT, 'boundary_licence': str(LIC.get(iso, {}).get('license')),
             'method': 'Segments cut exactly at geoBoundaries district borders (so the layer is also clipped to the country); length_km recomputed on the WGS84 ellipsoid (the source Rd_length is Web Mercator metres and overstates length). Surface class unchanged from source. District summary: segments split at district borders and summed.',
             'accuracy': 'Source-reported classification accuracy 77-96% depending on country (Zhou et al. 2026). Treat surface type as modelled.',
             'source_files': ', '.join(n + '.rar' for n in names), 'source_total_km': str(round(src_km, 1)), 'clipped_total_km': str(round(float(roads.length_km.sum()), 1)),
             'crs': 'EPSG:4326', 'processed': datetime.date.today().isoformat(), 'producer': 'Lenga Maps (lengamaps.com)'}
    con.execute('create table about (key text primary key, value text)'); con.executemany('insert into about values (?,?)', list(about.items()))
    rcols = [('roads.iso3', '', 'ISO 3166-1 alpha-3 country code'), ('roads.country', '', 'Country name'), ('roads.source_id', '', 'Segment ID in the FRST source file'),
             ('roads.surface', '', 'paved or unpaved, as classified by FRST'), ('roads.shapeID', '', 'geoBoundaries ID of the district the piece lies in'),
             ('roads.district', '', 'District name (geoBoundaries)'), ('roads.length_km', 'km', 'Length of the piece (geodesic); segments crossing a district border are split there')]
    con.execute('create table columns (name text primary key, unit text, description text)')
    con.executemany('insert into columns values (?,?,?)', rcols + [(f'district_summary.{c}', u, t) for c, u, t in dcols])
    for t in ('about', 'columns'):
        con.execute("insert into gpkg_contents (table_name, data_type, identifier, description, last_change) values (?, 'attributes', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))", (t, t, f'road surface {t}'))
    con.commit(); con.execute('vacuum'); con.close()
    for n in names: shutil.rmtree(f'roads/raw/{n}', ignore_errors=True)
    return iso, len(roads), round(src_km), round(float(roads.length_km.sum())), round(float(d.paved_km.sum() / max(d.road_km.sum(), 1e-9) * 100), 1), round(float(d.road_km.sum()))
if __name__ == '__main__':
    isos = sys.argv[1:] or sorted(FILE)
    with Pool(2) as pool:
        for r in pool.imap_unordered(one, isos): print(*r, flush=True)
