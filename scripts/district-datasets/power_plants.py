"""Existing power plants per country from OpenStreetMap (via the Overture Maps base/infrastructure release 2026-10-21.0,
class 'plant'). One point per plant at the footprint centroid, assigned to the country whose geoBoundaries outline
contains it. Capacity is parsed from plant:output:electricity where it is a number with a unit (W/kW/MW/GW)."""
import sys, re, json, datetime, warnings, numpy as np, pandas as pd, geopandas as gpd, duckdb, shapely, sqlite3
warnings.filterwarnings('ignore')
sys.path.insert(0, 'tools')
from countries import COUNTRIES
from build_gpkg import BOUND_ABOUT
REL = '2026-10-21.0'
def mw(v):
    if not v or not isinstance(v, str): return None
    m = re.match(r'^\s*([0-9]+(?:[.,][0-9]+)?)\s*(gw|mw|kw|w|mwp|kwp|mwe)?\s*$', v.strip().lower())
    if not m: return None
    x = float(m.group(1).replace(',', '.')); u = (m.group(2) or 'mw').rstrip('pe') or 'mw'
    return round(x * {'gw': 1000, 'mw': 1, 'kw': 1e-3, 'w': 1e-6}.get(u, 1), 4)
c = duckdb.connect(); c.execute('INSTALL spatial; LOAD spatial;')
df = c.execute("select id, name, source_tags, osm_id, wkb, area_m2 from 'plants/africa_power.parquet' where class='plant'").df()
tags = df.source_tags.apply(lambda t: dict(t) if t is not None else {})
g = gpd.GeoDataFrame({
    'name': df['name'], 'energy_source': tags.apply(lambda t: t.get('plant:source')), 'method': tags.apply(lambda t: t.get('plant:method')),
    'output_tag': tags.apply(lambda t: t.get('plant:output:electricity')), 'operator': tags.apply(lambda t: t.get('operator')),
    'start_date': tags.apply(lambda t: t.get('start_date')), 'wikidata': tags.apply(lambda t: t.get('operator:wikidata') or t.get('wikidata')),
    'area_ha': (df.area_m2.fillna(0) / 1e4).round(2), 'osm_id': df.osm_id, 'overture_id': df['id']},
    geometry=shapely.from_wkb(df.wkb.apply(bytes)), crs=4326)
g['capacity_mw'] = g.output_tag.apply(mw)
allc = gpd.GeoDataFrame({'iso3': sorted(COUNTRIES)}, geometry=[gpd.read_file(f'bnd/{i}.gpkg').union_all() for i in sorted(COUNTRIES)], crs=4326)
j = gpd.sjoin(g, allc, predicate='within', how='inner')
COLS = [('iso3', '', 'ISO 3166-1 alpha-3 country code'), ('country', '', 'Country name'), ('name', '', 'Plant name (OpenStreetMap)'),
        ('energy_source', '', 'plant:source: solar, hydro, gas, oil, diesel, coal, wind, geothermal, biomass ... (semicolon = several)'),
        ('method', '', 'plant:method, e.g. photovoltaic, run-of-the-river, water-storage, combustion'),
        ('capacity_mw', 'MW', 'Electrical capacity parsed from plant:output:electricity; empty where OSM gives no number'),
        ('output_tag', '', 'plant:output:electricity exactly as tagged'), ('operator', '', 'Operator (OpenStreetMap)'),
        ('start_date', '', 'Start / commissioning date as tagged'), ('wikidata', '', 'Wikidata ID of the plant or operator, where tagged'),
        ('area_ha', 'ha', 'Footprint area of the mapped plant outline (0 where mapped as a point)'),
        ('osm_id', '', 'OpenStreetMap element (node/way/relation id)'), ('overture_id', '', 'Overture Maps GERS ID')]
man = []
for iso in sorted(COUNTRIES):
    s = j[j.iso3 == iso].copy()
    if s.empty: continue
    s['country'] = COUNTRIES[iso]
    s = gpd.GeoDataFrame(s[[k for k, _, _ in COLS] + ['geometry']], crs=4326).sort_values(['energy_source', 'name'], na_position='last')
    p = f'out/Power_Plants/{iso}_Power_Plants_OSM.gpkg'
    import os
    if os.path.exists(p): os.remove(p)
    s.to_file(p, layer='power_plants', driver='GPKG')
    summ = s.assign(energy_source=s.energy_source.fillna('unknown')).groupby('energy_source').agg(plants=('name', 'size'), with_capacity=('capacity_mw', 'count'), capacity_mw_known=('capacity_mw', 'sum')).reset_index()
    con = sqlite3.connect(p)
    summ.round(3).to_sql('summary_by_source', con, index=False)
    about = {'title': f'Existing power plants, {COUNTRIES[iso]}', 'country': COUNTRIES[iso],
             'source': f'OpenStreetMap contributors, via Overture Maps Foundation base/infrastructure release {REL} (power plants, class plant)',
             'citation': f'© OpenStreetMap contributors (openstreetmap.org/copyright); Overture Maps Foundation, release {REL}',
             'licence': 'ODbL 1.0 (OpenStreetMap). Share-alike applies to derived databases.', 'boundaries': BOUND_ABOUT,
             'method': 'Plants assigned to the country whose geoBoundaries outline contains the footprint centroid. capacity_mw parsed from plant:output:electricity (numbers with W/kW/MW/GW); free text left in output_tag.',
             'note': 'Community-mapped and continuously updated: coverage and attributes vary by country. capacity_mw_known in the summary is the sum of tagged capacities only. It is not official installed capacity: some plants have no capacity tag, and some tags describe plants under construction, planned extensions or outdated figures. Check important plants against the utility or regulator.',
             'crs': 'EPSG:4326', 'processed': datetime.date.today().isoformat(), 'producer': 'Lenga Maps (lengamaps.com)'}
    con.execute('create table about (key text primary key, value text)'); con.executemany('insert into about values (?,?)', list(about.items()))
    con.execute('create table columns (name text primary key, unit text, description text)')
    con.executemany('insert into columns values (?,?,?)', [(f'power_plants.{a}', b, c_) for a, b, c_ in COLS] + [
        ('summary_by_source.energy_source', '', 'plant:source value'), ('summary_by_source.plants', 'count', 'Number of mapped plants'),
        ('summary_by_source.with_capacity', 'count', 'Plants with a parseable capacity'), ('summary_by_source.capacity_mw_known', 'MW', 'Sum of tagged capacities; not official installed capacity (see about.note)')])
    for t in ('about', 'columns', 'summary_by_source'):
        con.execute("insert into gpkg_contents (table_name, data_type, identifier, description, last_change) values (?, 'attributes', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))", (t, t, f'power plants {t}'))
    con.commit(); con.execute('vacuum'); con.close()
    man.append({'iso3': iso, 'country': COUNTRIES[iso], 'filename': p.split('/')[-1], 'plants': len(s), 'with_capacity': int(s.capacity_mw.notna().sum()), 'capacity_mw_known': round(float(s.capacity_mw.sum()), 1)})
json.dump(man, open('out/Power_Plants/manifest.json', 'w'), indent=1)
print(len(man), 'countries', sum(m['plants'] for m in man), 'plants')
for m in man:
    if m['iso3'] in ('ZMB', 'ZAF', 'KEN', 'EGY', 'NGA', 'ETH'): print(m)
