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
def write(gdf, path, layer, about, cols, extra=None):
    if os.path.exists(path): os.remove(path)
    gdf.to_file(path, layer=layer, driver='GPKG')
    con = sqlite3.connect(path)
    con.execute('create table about (key text primary key, value text)')
    con.executemany('insert into about values (?,?)', list(about.items()))
    con.execute('create table columns (name text primary key, unit text, description text)')
    con.executemany('insert into columns values (?,?,?)', cols)
    tables = ['about', 'columns']
    if extra is not None:  # attribute-only table (e.g. crops_long)
        name, df, desc = extra
        df.to_sql(name, con, index=False)
        tables.append(name)
    for t in tables:
        con.execute("insert into gpkg_contents (table_name, data_type, identifier, description, last_change) values (?, 'attributes', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))", (t, t, f'{layer} {t}'))
    con.execute('update gpkg_contents set description = ? where table_name = ?', (about['title'], layer))
    con.commit(); con.execute('vacuum'); con.close()
BASE_COLS = [('iso3', '', 'ISO 3166-1 alpha-3 country code'), ('country', '', 'Country name'),
  ('shapeID', '', 'geoBoundaries unique district ID'), ('shapeName', '', 'District name (geoBoundaries)'),
  ('adm1_name', '', 'Province / region the district lies in'), ('admin_level', '', 'ADM2, or ADM1 where geoBoundaries has no ADM2'),
  ('area_ha', 'ha', 'District area (geodesic, WGS84)')]
BOUND_ABOUT = 'District boundaries: geoBoundaries gbOpen (Runfola et al. 2020, PLoS ONE 15(4): e0231866); licence per country, see boundary_licence.'
def forest(D):
    parts, noloss = {}, set()
    for f in glob.glob('forest/parts/*.json'):
        j = json.load(open(f)); nl = j.pop('_no_loss_layer', False)
        for k, v in j.items():
            parts[k] = np.add(parts.get(k, np.zeros(27)), v)
            if nl: noloss.add(k)
    years = list(range(2001, 2026))
    rows = []
    for uid in D.uid:
        a = parts.get(uid, np.zeros(27)) / 1e4
        r = {'uid': uid, 'tc2000_ha': round(a[1:].sum(), 1)}
        for i, y in enumerate(years): r[f'loss_{y}_ha'] = round(a[2 + i], 1)
        r['loss_total_ha'] = round(a[2:].sum(), 1)
        r['loss_since_2021_ha'] = round(a[2 + 20:].sum(), 1)
        r['pct_loss_since_2000'] = round(100 * r['loss_total_ha'] / r['tc2000_ha'], 2) if r['tc2000_ha'] > 0 else None
        if uid in noloss:  # outside Hansen coverage (no loss layer, tree cover all 0): unknown, not zero
            for k in list(r):
                if k != 'uid': r[k] = None
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
        title, layer, folder, suffix = 'Forest Cover and Tree Cover Loss (Hansen GFC v1.13, 2001-2025)', 'forest_loss', 'Forest_Loss', 'Forest_Loss'
        about = {'title': title,
          'source': 'Hansen/UMD/Google/USGS/NASA Global Forest Change 2000-2025 v1.13 (30 m)',
          'citation': 'Hansen, M. C. et al. 2013. High-Resolution Global Maps of 21st-Century Forest Cover Change. Science 342: 850-53. Data: https://glad.earthengine.app/view/global-forest-change',
          'licence': 'CC BY 4.0 (Hansen GFC). Distributed by Lenga Maps with attribution.',
          'boundaries': BOUND_ABOUT,
          'method': 'Each 30 m pixel classed by tree cover 2000 (>=30%) and loss year; true pixel areas (by latitude) summed for pixels whose centre lies in the district.',
          'note': 'Tree cover loss is not the same as deforestation: it includes plantation harvest, fire and other stand-replacing disturbance. Data for 2001-2010 and 2011-2025 were produced with different methods; compare trends with care. Seychelles is outside Hansen GFC coverage (tile 00N_050E has no loss layer and no tree cover values), so its forest columns are empty (unknown), not zero.',
          'crs': 'EPSG:4326', 'processed': TODAY, 'producer': 'Lenga Maps (lengamaps.com)'}
    elif which == 'crops':
        S, LONG = crops_tables(D)
        cols = BASE_COLS + CROP_COLS + [('boundary_licence', '', 'Licence of the district boundary')]
        title, layer, folder, suffix = 'Crop Production (MapSPAM SPAM 2020 v2.2)', 'crops', 'Crop_Production', 'Crop_Production'
        about = {'title': title,
          'source': 'IFPRI MapSPAM, Global Spatially-Disaggregated Crop Production Statistics for 2020, version 2.2 (SPAM2020V2r2, April 2026), 5 arc-minute grid, all technologies (irrigated + rainfed)',
          'citation': 'International Food Policy Research Institute (IFPRI), 2025, "Global Spatially-Disaggregated Crop Production Statistics Data for 2020 Version 2.0.0", https://doi.org/10.7910/DVN/SWPENT, Harvard Dataverse (release V2r2).',
          'licence': 'CC BY 4.0 (MapSPAM). Distributed by Lenga Maps with attribution.',
          'boundaries': BOUND_ABOUT,
          'method': 'Each SPAM cell belongs to the country under its centre (majority for coastal cells), as in SPAM; within that country its value is split among districts by the share of the cell each covers (10x10 sub-cells). Country totals equal SPAM cell sums exactly. Yield = production / harvested area.',
          'note': 'Modelled estimates for circa 2020 (SPAM allocates national and subnational statistics to cells), not survey results for any one season. Physical area counts land once; harvested area counts every harvest, so it can exceed physical area where land is cropped twice a year. Values are SPAM\'s as published: some districts show irrigated-estate sugarcane yields above 120 t/ha.',
          'crops_long': 'Table crops_long holds all 46 SPAM crops per district (shapeID, crop, crop_name, phys_ha, harv_ha, prod_t, yield_kgha).',
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
          'method': 'Values back-transformed to real units per iSDA metadata (pH x/10; organic C, P, K, eCEC expm1(x/10); total N expm1(x/100) per the Earth Engine catalogue; bulk density x/100) BEFORE averaging; district mean and 10th/90th percentiles weighted by the share of each 240 m cell inside the district.',
          'note': 'Model predictions, not lab measurements; use for planning and screening, and confirm with soil tests before fertiliser or carbon-credit decisions. Not available for Cabo Verde, Mauritius and Seychelles.',
          'crs': 'EPSG:4326', 'processed': TODAY, 'producer': 'Lenga Maps (lengamaps.com)'}
    G = D.merge(S, on='uid', how='left')
    for iso in sorted(COUNTRIES):
        extra = None
        if which == 'crops':
            l = LONG[LONG.uid.str.startswith(iso + ':')].copy(); l['shapeID'] = l.uid.str[4:]
            extra = ('crops_long', l[['shapeID', 'crop', 'crop_name', 'phys_ha', 'harv_ha', 'prod_t', 'yield_kgha']], 'All 46 SPAM crops per district')
        g = G[G.iso3 == iso].drop(columns=['uid']).copy()
        if g.empty: continue
        g['boundary_licence'] = lic.get(iso, {}).get('license')
        g = g[[c[0] for c in cols] + ['geometry']]
        path = f'out/{folder}/{iso}_{suffix}.gpkg'
        write(g, path, layer, dict(about, country=COUNTRIES[iso], boundary_licence=str(lic.get(iso, {}).get('license'))), cols, extra)
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
SPAM_NAMES = {'WHEA':'Wheat','RICE':'Rice','MAIZ':'Maize','BARL':'Barley','MILL':'Small millet','PMIL':'Pearl millet','SORG':'Sorghum','OCER':'Other cereals','POTA':'Potato','SWPO':'Sweet potato','YAMS':'Yams','CASS':'Cassava','ORTS':'Other roots','BEAN':'Bean','CHIC':'Chickpea','COWP':'Cowpea','PIGE':'Pigeon pea','LENT':'Lentil','OPUL':'Other pulses','SOYB':'Soybean','GROU':'Groundnut','CNUT':'Coconut','OILP':'Oil palm','SUNF':'Sunflower','RAPE':'Rapeseed','SESA':'Sesame seed','OOIL':'Other oil crops','SUGC':'Sugarcane','SUGB':'Sugar beet','COTT':'Cotton','OFIB':'Other fibre crops','COFF':'Arabica coffee','RCOF':'Robusta coffee','COCO':'Cocoa','TEAS':'Tea','TOBA':'Tobacco','BANA':'Banana','PLNT':'Plantain','CITR':'Citrus','TROF':'Other tropical fruit','TEMF':'Temperate fruit','TOMA':'Tomato','ONIO':'Onion','VEGE':'Other vegetables','RUBB':'Rubber','REST':'Rest of crops'}
GROUPS = [('maize',['MAIZ'],'Maize'),('cassava',['CASS'],'Cassava'),('sorghum',['SORG'],'Sorghum'),('millet',['MILL','PMIL'],'Millet (small + pearl)'),('rice',['RICE'],'Rice'),('wheat',['WHEA'],'Wheat'),('beans',['BEAN'],'Beans'),('groundnut',['GROU'],'Groundnut'),('soybean',['SOYB'],'Soybean'),('cocoa',['COCO'],'Cocoa'),('coffee',['COFF','RCOF'],'Coffee (arabica + robusta)'),('cotton',['COTT'],'Cotton'),('tobacco',['TOBA'],'Tobacco'),('sugarcane',['SUGC'],'Sugarcane'),('banana',['BANA','PLNT'],'Banana and plantain')]
CROP_COLS = []
for k, _, n in GROUPS:
    CROP_COLS += [(f'{k}_phys_ha','ha',f'{n}: physical area'),(f'{k}_harv_ha','ha',f'{n}: harvested area'),(f'{k}_prod_t','t',f'{n}: production'),(f'{k}_yield_kgha','kg/ha',f'{n}: yield = production / harvested area (empty where not grown)')]
CROP_COLS += [('total_phys_ha','ha','All 46 crops: physical area'),('top_crop','','Crop with the largest physical area')]
def crops_tables(D):
    L = pd.read_csv('crops/district_crops.csv')
    L['crop_name'] = L.crop.map(SPAM_NAMES)
    L['yield_kgha'] = np.where(L.harv_ha > 0, L.prod_t * 1000 / L.harv_ha.where(L.harv_ha > 0), np.nan)
    for c in ('phys_ha', 'harv_ha', 'prod_t'): L[c] = L[c].round(1)
    L['yield_kgha'] = L['yield_kgha'].round(0)
    W = L.pivot(index='uid', columns='crop', values=['phys_ha', 'harv_ha', 'prod_t'])
    T = pd.DataFrame(index=W.index)
    for k, codes, _ in GROUPS:
        for v, suf in (('phys_ha','phys_ha'),('harv_ha','harv_ha'),('prod_t','prod_t')):
            T[f'{k}_{suf}'] = W[v][codes].sum(axis=1).round(1)
        T[f'{k}_yield_kgha'] = (T[f'{k}_prod_t'] * 1000 / T[f'{k}_harv_ha'].where(T[f'{k}_harv_ha'] > 0)).round(0)
    T['total_phys_ha'] = W['phys_ha'].sum(axis=1).round(1)
    top = W['phys_ha'].idxmax(axis=1).map(SPAM_NAMES)
    T['top_crop'] = top.where(T['total_phys_ha'] > 0)
    return T.reset_index(), L[L.phys_ha + L.harv_ha + L.prod_t > 0]
if __name__ == '__main__':
    build(sys.argv[1])
