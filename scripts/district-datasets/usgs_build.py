"""USGS Africa geology (geo7_2ag, OFR 97-470A) and mineral industries & infrastructure (2021, DOI 10.5066/P97EQWXP)
-> per-country GeoPackages. Geometry is cut exactly to the geoBoundaries country outline (polygon/line intersection,
points by point-in-polygon). Attributes kept as published; geology codes get their legend text from the source
FGDC metadata. Each file embeds 'about' and 'columns' attribute tables."""
import sys, re, glob, json, sqlite3, datetime, warnings, numpy as np, pandas as pd, geopandas as gpd
from pyproj import Geod
warnings.filterwarnings('ignore')
sys.path.insert(0, 'tools'); from countries import COUNTRIES
from build_gpkg import write
TODAY = datetime.date.today().isoformat(); GEOD = Geod(ellps='WGS84')
lic = json.load(open('bnd/licences.json'))
BOUND = 'Country outline: geoBoundaries gbOpen (Runfola et al. 2020), dissolved from the district boundaries.'
def country(iso):
    return gpd.read_file(f'bnd/{iso}.gpkg').union_all()
# ---- geology legend from source metadata
x = open('geo/raw/geology/geo7_2ag/geo7_2ag.xml', errors='ignore').read()
LEG = {m.group(1): m.group(2).strip() for m in re.finditer(r'<edomv>\s*"([^"]+)"\s*-\s*(.*?)</edomv>', x, re.S)}
ALIAS = {'Kl': 'KI', 'Jl': 'JI', 'Trl': 'TrI'}   # data uses lowercase L where the legend uses capital i (Lower ...)
LOWER = {k.lower(): v for k, v in LEG.items()}
# Two codes in the data are absent from the source legend; they are the standard USGS period symbols (Cm, O).
EXTRA = {'Cm': 'Cambrian', 'O': 'Ordovician'}
def unit(code):
    return LEG.get(code) or LEG.get(ALIAS.get(code, '')) or LOWER.get(code.lower()) or EXTRA.get(code)
def geology():
    G = gpd.read_file('geo/raw/geology/geo7_2ag/geo7_2ag.shp').to_crs(4326)
    G['geometry'] = G.geometry.make_valid()
    G = G[['GLG', 'geometry']].rename(columns={'GLG': 'glg_code'})
    G['unit'] = G.glg_code.map(unit)
    missing = sorted(set(G.glg_code[G.unit.isna()]))
    print('codes without legend text:', missing)
    cols = [('iso3', '', 'ISO 3166-1 alpha-3 country code'), ('country', '', 'Country name'),
            ('glg_code', '', 'USGS geology code (GLG) as published'), ('unit', '', 'Geologic age / unit, from the source metadata legend'),
            ('area_km2', 'km2', 'Polygon area inside the country (geodesic, WGS84)')]
    about = {'title': 'Surface Geology (USGS Geologic Map of Africa, OFR 97-470A)',
      'source': 'USGS, Surficial geology of Africa (geo7_2ag), from Open-File Report 97-470A. ScienceBase item 60d0ff26d34e86b938aab404',
      'citation': 'Persits, F.M., Ahlbrandt, T.S., Tuttle, M.L., Charpentier, R.R., Brownfield, M.E., and Takahashi, K.I., 1997, Maps showing geology, oil and gas fields and geological provinces of Africa: U.S. Geological Survey Open-File Report 97-470-A. https://doi.org/10.3133/ofr97470A',
      'licence': 'Public domain (U.S. Government work). Credit USGS.', 'boundaries': BOUND,
      'method': 'Polygons intersected with the country outline (exact cut); codes and legend text unchanged from source. Kl/Jl/Trl in the data are the legend codes KI/JI/TrI (Lower Cretaceous/Jurassic/Triassic). Cm and O are not listed in the source legend; they are the standard USGS symbols for Cambrian and Ordovician.',
      'note': 'Continental compilation at about 1:5,000,000: suitable for regional screening, not for site-level geology.',
      'crs': 'EPSG:4326', 'processed': TODAY, 'producer': 'Lenga Maps (lengamaps.com)'}
    man = []
    sidx = G.sindex
    for iso in sorted(COUNTRIES):
        c = country(iso)
        sub = G.iloc[sidx.query(c, predicate='intersects')].copy()
        sub['geometry'] = sub.geometry.intersection(c)
        sub = sub[~sub.geometry.is_empty & sub.geometry.geom_type.isin(['Polygon', 'MultiPolygon', 'GeometryCollection'])]
        sub['geometry'] = sub.geometry.apply(lambda g: g if g.geom_type != 'GeometryCollection' else gpd.GeoSeries([p for p in g.geoms if p.geom_type in ('Polygon','MultiPolygon')]).union_all())
        sub = sub[~sub.geometry.is_empty]
        sub['area_km2'] = [round(abs(GEOD.geometry_area_perimeter(g)[0]) / 1e6, 3) for g in sub.geometry]
        sub = sub[sub.area_km2 > 0]
        sub.insert(0, 'iso3', iso); sub.insert(1, 'country', COUNTRIES[iso])
        sub = gpd.GeoDataFrame(sub[[k for k, _, _ in cols] + ['geometry']], crs=4326)
        p = f'out/Geology/{iso}_Geology_USGS.gpkg'
        write(sub, p, 'geology', dict(about, country=COUNTRIES[iso]), cols)
        man.append({'iso3': iso, 'country': COUNTRIES[iso], 'filename': p.split('/')[-1], 'features': len(sub), 'area_km2': round(sub.area_km2.sum())})
    json.dump(man, open('out/Geology/manifest.json', 'w'), indent=1); print('geology', len(man))
# ---- mineral industries
GDB = glob.glob('geo/raw/minerals/**/*.gdb', recursive=True)[0]
LAYERS = [('AFR_Mineral_Facilities', 'mineral_facilities', 'Mineral production and processing facilities'),
          ('AFR_Mineral_Deposits', 'mineral_deposits', 'Mineral deposits and occurrences'),
          ('AFR_Mineral_Exploration', 'mineral_exploration', 'Exploration and development sites'),
          ('AFR_Infra_Power_Stations', 'power_stations', 'Power generation stations'),
          ('AFR_Infra_Power_Transmission', 'power_transmission', 'Electric power transmission lines'),
          ('AFR_Infra_OG_Pipelines', 'oil_gas_pipelines', 'Oil and gas pipelines'),
          ('AFR_Infra_OG_LNG_Terminals', 'lng_terminals', 'LNG terminals'),
          ('AFR_Infra_Transport_Ports', 'ports', 'Ports'),
          ('AFR_Infra_Transport_Rail', 'railways', 'Railways')]
mx = open(glob.glob('geo/raw/minerals_meta.xml')[0], errors='ignore').read()
DEFS = {}
for ent in re.finditer(r'<detailed>(.*?)</detailed>', mx, re.S):
    b = ent.group(1); lab = re.search(r'<enttypl>(.*?)</enttypl>', b, re.S)
    lay = lab.group(1).replace('Feature Class', '').strip() if lab else ''
    for m in re.finditer(r'<attrlabl>(.*?)</attrlabl>\s*<attrdef>(.*?)</attrdef>', b, re.S):
        nm, _, alias = m.group(1).partition('[Alias:')
        d = re.sub(r'\s+', ' ', m.group(2)).strip()
        alias = alias.rstrip('] ').strip()
        DEFS[(lay, nm.strip())] = f'{alias}: {d}' if alias else d
NAME = {v: k for k, v in COUNTRIES.items()}
NAME.update({'Congo (Brazzaville)': 'COG', 'Congo (Kinshasa)': 'COD', "Côte d'Ivoire": 'CIV', "Côte d'\x92Ivoire": 'CIV', 'Côte d’Ivoire': 'CIV',
             'Gambia, The': 'GMB', 'São Tomé and Príncipe': 'STP', 'Western Sahara': 'MAR'})   # geoBoundaries MAR outline includes Western Sahara
EXTRA_DEF = {'length_km': 'Length inside the country (geodesic)', 'location': 'Whether the point lies inside the country outline, or offshore / on the coastline and assigned by the source Country field',
             'dist_to_land_km': 'Distance to the nearest country outline for offshore or coastline points (0 when inside)'}
def minerals():
    data = {}
    for src, name, _ in LAYERS:
        g = gpd.read_file(GDB, layer=src).to_crs(4326)
        g['geometry'] = g.geometry.force_2d() if hasattr(g.geometry, 'force_2d') else g.geometry
        g = g.drop(columns=[c for c in g.columns if c.lower() in ('shape_length', 'shape_area')])
        if g.geom_type.iloc[0].endswith('Point'):
            allc = gpd.GeoDataFrame({'iso': sorted(COUNTRIES)}, geometry=[country(i) for i in sorted(COUNTRIES)], crs=4326)
            j = gpd.sjoin(g[['geometry']], allc, predicate='within', how='left')
            j = j[~j.index.duplicated()]
            g['_iso'] = j.iso
            off = g._iso.isna()
            g.loc[off, '_iso'] = g.loc[off, 'Country'].map(NAME)
            g['location'] = np.where(off, 'offshore or on the coastline; country from the source Country field', 'inside the country outline')
            land = allc.to_crs(3857).union_all()
            g['dist_to_land_km'] = 0.0
            g.loc[off, 'dist_to_land_km'] = (g.loc[off].to_crs(3857).distance(land) / 1000).round(2)
            print(name, 'outside every outline:', int(off.sum()), 'unassigned:', int(g._iso.isna().sum()), sorted(set(g.loc[g._iso.isna(), 'Country'])))
        data[name] = (src, g, g.sindex)
    about = {'title': 'Mineral Industries and Infrastructure (USGS, 2021)',
      'source': 'USGS, Compilation of Geospatial Data (GIS) for the Mineral Industries and Related Infrastructure of Africa (2021 data release)',
      'citation': 'U.S. Geological Survey, 2021, Compilation of Geospatial Data (GIS) for the Mineral Industries and Related Infrastructure of Africa: U.S. Geological Survey data release, https://doi.org/10.5066/P97EQWXP',
      'licence': 'Public domain (U.S. Government work). Credit USGS.', 'boundaries': BOUND,
      'method': 'Points assigned to the country whose outline contains them; points offshore or on the coastline (offshore oil and gas fields, ports, terminals) are assigned by the source Country field and flagged in the location and dist_to_land_km columns. Lines (pipelines, power lines, railways) cut exactly at the land border, so offshore pipeline sections are not included. Attributes unchanged from source.',
      'layers': '; '.join(f'{n}: {d}' for _, n, d in LAYERS),
      'crs': 'EPSG:4326', 'processed': TODAY, 'producer': 'Lenga Maps (lengamaps.com)'}
    man = []
    for iso in sorted(COUNTRIES):
        c = country(iso); p = f'out/Mineral_Industries/{iso}_Mineral_Industries_USGS.gpkg'
        import os
        if os.path.exists(p): os.remove(p)
        counts, colrows = {}, []
        for _, name, desc in LAYERS:
            src, g, sidx = data[name]
            if '_iso' in g:
                sub = g[g._iso == iso].drop(columns='_iso').copy()
            else:
                sub = g.iloc[sidx.query(c, predicate='intersects')].copy()
            if sub.empty: continue
            if not sub.geom_type.iloc[0].endswith('Point'):
                sub['geometry'] = sub.geometry.intersection(c); sub = sub[~sub.geometry.is_empty]
                sub['length_km'] = [round(GEOD.geometry_length(x) / 1000, 3) for x in sub.geometry]
            if sub.empty: continue
            sub.to_file(p, layer=name, driver='GPKG')
            counts[name] = len(sub)
            for col in sub.columns:
                if col == 'geometry': continue
                colrows.append((f'{name}.{col}', 'km' if col.endswith('_km') else '', DEFS.get((src, col)) or EXTRA_DEF.get(col, '')))
        if not counts: continue
        con = sqlite3.connect(p)
        con.execute('create table about (key text primary key, value text)')
        con.executemany('insert into about values (?,?)', list(dict(about, country=COUNTRIES[iso], feature_counts=json.dumps(counts)).items()))
        con.execute('create table columns (name text primary key, unit text, description text)')
        con.executemany('insert or replace into columns values (?,?,?)', colrows)
        for t in ('about', 'columns'):
            con.execute("insert into gpkg_contents (table_name, data_type, identifier, description, last_change) values (?, 'attributes', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))", (t, t, f'mineral industries {t}'))
        con.commit(); con.execute('vacuum'); con.close()
        man.append({'iso3': iso, 'country': COUNTRIES[iso], 'filename': p.split('/')[-1], **counts})
    json.dump(man, open('out/Mineral_Industries/manifest.json', 'w'), indent=1); print('minerals', len(man))
if __name__ == '__main__':
    {'geology': geology, 'minerals': minerals}[sys.argv[1]]()
