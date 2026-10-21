"""Assemble final per-country GeoPackages (+ about/columns tables, manifest.json)."""
import sys, os, glob, json, sqlite3, datetime, numpy as np, pandas as pd, geopandas as gpd
from pyproj import Geod
sys.path.insert(0, 'tools'); from countries import COUNTRIES
TODAY = datetime.date.today().isoformat()
GEOD = Geod(ellps='WGS84')
BND_LOG = {}
for l in open('bnd/run.log'):
    pass
def districts():
    g = pd.concat([gpd.read_file(f) for f in sorted(glob.glob('bnd/*.gpkg'))], ignore_index=True)
    g = gpd.GeoDataFrame(g, geometry='geometry', crs=4326)
    g['uid'] = g['iso3'] + ':' + g['shapeID'].astype(str)
    g['area_ha'] = [round(abs(GEOD.geometry_area_perimeter(x)[0]) / 1e4, 1) for x in g.geometry]
    return g
def bnd_license(iso):
    import urllib.request
    return None
def write(gdf, path, layer, about, cols):
    if os.path.exists(path): os.remove(path)
    gdf.to_file(path, layer=layer, driver='GPKG')
    con = sqlite3.connect(path)
    con.execute('create table about (key text primary key, value text)')
    con.executemany('insert into about values (?,?)', list(about.items()))
    con.execute('create table columns (name text primary key, unit text, description text)')
    con.executemany('insert into columns values (?,?,?)', cols)
    for t in ('about', 'columns'):
        con.execute("insert into gpkg_contents (table_name, data_type, identifier, description, last_change) values (?, 'attributes', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))", (t, t, f'{layer} {t}'))
    con.execute('update gpkg_contents set description = ? where table_name = ?', (about['title'], layer))
    con.commit(); con.execute('vacuum'); con.close()
BASE_COLS = [('iso3', '', 'ISO 3166-1 alpha-3 country code'), ('country', '', 'Country name'),
  ('shapeID', '', 'geoBoundaries unique district ID'), ('shapeName', '', 'District name (geoBoundaries)'),
  ('adm1_name', '', 'Province / region the district lies in'), ('admin_level', '', 'ADM2, or ADM1 where geoBoundaries has no ADM2'),
  ('area_ha', 'ha', 'District area (geodesic, WGS84)')]
BOUND_ABOUT = 'District boundaries: geoBoundaries gbOpen (Runfola et al. 2020, PLoS ONE 15(4): e0231866); licence per country, see boundary_licence.'
def forest(D):
    parts = {}
    for f in glob.glob('forest/parts/*.json'):
        for k, v in json.load(open(f)).items():
            parts[k] = np.add(parts.get(k, np.zeros(27)), v)
    years = list(range(2001, 2026))
    rows = []
    for uid in D.uid:
        a = parts.get(uid, np.zeros(27)) / 1e4
        r = {'uid': uid, 'tc2000_ha': round(a[1:].sum(), 1)}
        for i, y in enumerate(years): r[f'loss_{y}_ha'] = round(a[2 + i], 1)
        r['loss_total_ha'] = round(a[2:].sum(), 1)
        r['loss_since_2021_ha'] = round(a[2 + 20:].sum(), 1)
        r['pct_loss_since_2000'] = round(100 * r['loss_total_ha'] / r['tc2000_ha'], 2) if r['tc2000_ha'] > 0 else None
        rows.append(r)
    return pd.DataFrame(rows), years
def build(which):
    D = districts()
    lic = json.load(open('bnd/licences.json'))
    manifest = []
    if which == 'forest':
        S, years = forest(D)
        cols = BASE_COLS + [('tc2000_ha', 'ha', 'Tree cover in 2000 at >=30% canopy (Hansen default)')] + \
          [(f'loss_{y}_ha', 'ha', f'Tree cover loss in {y}, within 2000 tree cover >=30%') for y in years] + \
          [('loss_total_ha', 'ha', 'Tree cover loss 2001-2025'), ('loss_since_2021_ha', 'ha', 'Tree cover loss 2021-2025, after the EUDR cut-off of 31 Dec 2020'),
           ('pct_loss_since_2000', '%', 'loss_total_ha / tc2000_ha x 100'), ('boundary_licence', '', 'Licence of the district boundary')]
        title, layer, folder, suffix = 'Forest Cover and Tree Cover Loss by District (Hansen GFC v1.13, 2001-2025)', 'forest_loss', 'Forest_Loss', 'Forest_Loss'
        about = {'title': title,
          'source': 'Hansen/UMD/Google/USGS/NASA Global Forest Change 2000-2025 v1.13 (30 m)',
          'citation': 'Hansen, M. C. et al. 2013. High-Resolution Global Maps of 21st-Century Forest Cover Change. Science 342: 850-53. Data: https://glad.earthengine.app/view/global-forest-change',
          'licence': 'CC BY 4.0 (Hansen GFC). Distributed by Lenga Maps with attribution.',
          'boundaries': BOUND_ABOUT,
          'method': 'Each 30 m pixel classed by tree cover 2000 (>=30%) and loss year; true pixel areas (by latitude) summed for pixels whose centre lies in the district.',
          'note': 'Tree cover loss is not the same as deforestation: it includes plantation harvest, fire and other stand-replacing disturbance. Data for 2001-2010 and 2011-2025 were produced with different methods; compare trends with care.',
          'crs': 'EPSG:4326', 'processed': TODAY, 'producer': 'Lenga Maps (lengamaps.com)'}
    else:
        S = soil_table(D)
        cols = BASE_COLS + SOIL_COLS + [('valid_pct', '%', 'Share of the district with iSDAsoil predictions (water/no-data excluded)'), ('boundary_licence', '', 'Licence of the district boundary')]
        title, layer, folder, suffix = 'Topsoil Fertility by District (iSDAsoil Africa 30 m, v1)', 'soil_fertility', 'Soil_Fertility', 'Soil_Fertility'
        about = {'title': title,
          'source': 'iSDAsoil: predicted soil properties for Africa at 30 m (Innovative Solutions for Decision Agriculture), v1, read at 240 m (8x overview)',
          'citation': 'Hengl, T. et al. 2021. African soil properties and nutrients mapped at 30 m spatial resolution using two-scale ensemble machine learning. Scientific Reports 11: 6130. https://doi.org/10.1038/s41598-021-85639-y',
          'licence': 'CC BY 4.0 (iSDAsoil). Distributed by Lenga Maps with attribution.',
          'boundaries': BOUND_ABOUT,
          'method': 'Values back-transformed to real units per iSDA metadata (pH x/10; organic C, N, P, K, eCEC expm1(x/10); bulk density x/100) BEFORE averaging; district mean and 10th/90th percentiles weighted by the share of each 240 m cell inside the district.',
          'note': 'Model predictions, not lab measurements; use for planning and screening, and confirm with soil tests before fertiliser or carbon-credit decisions. Not available for Cabo Verde, Mauritius and Seychelles.',
          'crs': 'EPSG:4326', 'processed': TODAY, 'producer': 'Lenga Maps (lengamaps.com)'}
    G = D.merge(S, on='uid', how='left')
    for iso in sorted(COUNTRIES):
        g = G[G.iso3 == iso].drop(columns=['uid']).copy()
        if g.empty: continue
        g['boundary_licence'] = lic.get(iso, {}).get('license')
        g = g[[c[0] for c in cols] + ['geometry']]
        path = f'out/{folder}/{iso}_{suffix}.gpkg'
        write(g, path, layer, dict(about, country=COUNTRIES[iso], boundary_licence=str(lic.get(iso, {}).get('license'))), cols)
        manifest.append({'iso3': iso, 'country': COUNTRIES[iso], 'filename': os.path.basename(path), 'districts': len(g), 'size_mb': round(os.path.getsize(path) / 1048576, 2)})
    json.dump(manifest, open(f'out/{folder}/manifest.json', 'w'), indent=1)
    print(folder, len(manifest), 'files', round(sum(m['size_mb'] for m in manifest), 1), 'MB')
SOIL = [('ph', 1, 'ph', 'pH (H2O)', '', True), ('carbon_organic', 1, 'soc_0_20', 'Organic carbon, 0-20 cm', 'g/kg', True),
        ('carbon_organic', 2, 'soc_20_50', 'Organic carbon, 20-50 cm', 'g/kg', False), ('nitrogen_total', 1, 'n_total', 'Total nitrogen, 0-20 cm', 'g/kg', False),
        ('phosphorous_extractable', 1, 'p_ext', 'Extractable phosphorus, 0-20 cm', 'ppm', False), ('potassium_extractable', 1, 'k_ext', 'Extractable potassium, 0-20 cm', 'ppm', False),
        ('cation_exchange_capacity', 1, 'ecec', 'Effective cation exchange capacity, 0-20 cm', 'cmol(+)/kg', False),
        ('clay_content', 1, 'clay', 'Clay, 0-20 cm', '%', False), ('sand_content', 1, 'sand', 'Sand, 0-20 cm', '%', False), ('silt_content', 1, 'silt', 'Silt, 0-20 cm', '%', False),
        ('bulk_density', 1, 'bulk_density', 'Bulk density, 0-20 cm', 'g/cm3', False)]
TEXTURE = {1:'Clay',2:'Silty Clay',3:'Sandy Clay',4:'Clay Loam',5:'Silty Clay Loam',6:'Sandy Clay Loam',7:'Loam',8:'Silt Loam',9:'Sandy Loam',10:'Silt',11:'Loamy Sand',12:'Sand'}
SOIL_COLS = []
for var, b, name, desc, unit, pct in SOIL:
    SOIL_COLS.append((f'{name}_mean', unit, f'{desc}: district mean'))
    if pct: SOIL_COLS += [(f'{name}_p10', unit, f'{desc}: 10th percentile'), (f'{name}_p90', unit, f'{desc}: 90th percentile')]
SOIL_COLS.append(('texture_class', '', 'USDA texture class, 0-20 cm: most common in the district'))
def soil_table(D):
    T = pd.DataFrame({'uid': D.uid})
    for var, b, name, desc, unit, pct in SOIL:
        p = pd.read_csv(f'soil/parts/{var}_b{b}.csv')
        r = p[['uid']].copy(); r[f'{name}_mean'] = p['mean'].round(3 if var in ('nitrogen_total', 'bulk_density') else 2)
        if pct: r[f'{name}_p10'] = p['p10'].round(2); r[f'{name}_p90'] = p['p90'].round(2)
        if var == 'ph': r['valid_pct'] = p['valid_pct']
        T = T.merge(r, on='uid', how='left')
    t = pd.read_csv('soil/parts/texture_class_b1.csv')
    T = T.merge(t[['uid']].assign(texture_class=t['mode'].map(TEXTURE)), on='uid', how='left')
    return T
if __name__ == '__main__':
    build(sys.argv[1])
