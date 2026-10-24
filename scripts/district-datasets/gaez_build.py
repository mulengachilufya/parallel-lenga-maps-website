"""FAO/IIASA GAEZ v5 crop suitability (continuous index, 30 arc-sec, period 2001-2020, AgERA5 climate) for 29 crops,
rain-fed, low and high input. Stage 'fetch' caches an Africa-wide uint8 copy per crop/input (index/100, 255 = no data;
source negative codes are non-land/no data). Stage 'build' writes per country two 29-band GeoTIFFs clipped to the
geoBoundaries outline and a district GeoPackage: mean suitability and share of area rated medium or better (index >= 40)."""
import sys, os, json, datetime, warnings, numpy as np, pandas as pd, geopandas as gpd, rasterio
from rasterio.windows import from_bounds
from rasterio.features import geometry_mask
from exactextract import exact_extract
from multiprocessing import Pool
warnings.filterwarnings('ignore')
sys.path.insert(0, 'tools')
from countries import COUNTRIES
from build_gpkg import write, BASE_COLS, BOUND_ABOUT
CROPS = {'MZE': 'Maize', 'CSV': 'Cassava', 'SRG': 'Sorghum', 'PML': 'Pearl millet', 'FML': 'Finger millet', 'RCD': 'Rice (dryland)',
         'RCW': 'Rice (wetland)', 'GRD': 'Groundnut', 'SOY': 'Soybean', 'PHB': 'Phaseolus bean', 'COW': 'Cowpea', 'CHK': 'Chickpea',
         'WHE': 'Wheat', 'SUC': 'Sugarcane', 'COT': 'Cotton', 'COF': 'Coffee', 'TEA': 'Tea', 'SPO': 'Sweet potato', 'WPO': 'White potato',
         'BAN': 'Banana', 'CSH': 'Cashew', 'SFL': 'Sunflower', 'TOB': 'Tobacco', 'TEF': 'Teff', 'YAM': 'Yam', 'COC': 'Cocoa',
         'OLP': 'Oil palm', 'MNG': 'Mango', 'CIT': 'Citrus'}
INPUT = {'LRLM': 'low input, rain-fed', 'HRLM': 'high input, rain-fed'}
URL = '/vsicurl/https://storage.googleapis.com/fao-gismgr-gaez-v5-data/DATA/GAEZ-V5/MAPSET/RES05-SXX30AS/GAEZ-V5.RES05-SXX30AS.HP0120.AGERA5.HIST.{}.{}.tif'
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY=5, GDAL_HTTP_RETRY_DELAY=3)
BBOX = (-26.0, -47.5, 64.0, 38.0)
LIC = json.load(open('bnd/licences.json'))
CIT = 'FAO & IIASA (2025). Global Agro-Ecological Zones version 5 (GAEZ v5). Rome: FAO. https://www.fao.org/gaez ; data: storage.googleapis.com/fao-gismgr-gaez-v5-data'
def fetch(job):
    crop, inp = job
    out = f'gaez/raw/{crop}_{inp}.tif'
    if os.path.exists(out): return job, 'cached'
    with rasterio.Env(**ENV), rasterio.open(URL.format(crop, inp)) as s:
        w = from_bounds(*BBOX, transform=s.transform).round_offsets().round_lengths()
        a = s.read(1, window=w); T = s.window_transform(w)
    o = np.where(a >= 0, np.clip(np.round(a / 100.0), 0, 100), 255).astype('uint8')
    with rasterio.open(out + '.part.tif', 'w', driver='GTiff', dtype='uint8', count=1, width=o.shape[1], height=o.shape[0], crs='EPSG:4326',
                       transform=T, nodata=255, tiled=True, compress='deflate') as d: d.write(o, 1)
    os.replace(out + '.part.tif', out)
    return job, int((o < 255).sum())
def build(iso):
    gp = f'out/Crop_Suitability_GAEZv5/{iso}_Crop_Suitability_Districts_GAEZv5.gpkg'
    if os.path.exists(gp): return iso, 'done'
    d = gpd.read_file(f'bnd/{iso}.gpkg'); geom = d.union_all()
    long = []
    for inp, label in INPUT.items():
        bands = []
        for crop in CROPS:
            with rasterio.open(f'gaez/raw/{crop}_{inp}.tif') as s:
                w = from_bounds(*geom.bounds, transform=s.transform).round_offsets(op='floor').round_lengths(op='ceil')
                a = s.read(1, window=w, boundless=True, fill_value=255); T = s.window_transform(w)
            bands.append(a)
        st = np.stack(bands)
        m = geometry_mask([geom], st.shape[1:], T, invert=True, all_touched=st.shape[1] * st.shape[2] < 400)
        st[:, ~m] = 255
        tif = f'out/Crop_Suitability_GAEZv5/{iso}_Crop_Suitability_GAEZv5_{"LowInput" if inp == "LRLM" else "HighInput"}.tif'
        with rasterio.open(tif, 'w', driver='GTiff', dtype='uint8', count=len(CROPS), width=st.shape[2], height=st.shape[1], crs='EPSG:4326',
                           transform=T, nodata=255, tiled=True, blockxsize=256, blockysize=256, compress='deflate', predictor=2) as o:
            o.write(st)
            for i, c in enumerate(CROPS): o.set_band_description(i + 1, f'{c}_{CROPS[c]}_suitability_0_100')
            o.update_tags(TITLE=f'Crop suitability ({label}), {COUNTRIES[iso]}', SOURCE='FAO/IIASA GAEZ v5, continuous suitability index RES05-SXX30AS, 2001-2020, AgERA5 climate',
                          CITATION=CIT, LICENCE='CC BY 4.0 IGO (FAO). Distributed by Lenga Maps with attribution.', UNITS='suitability index 0-100',
                          CLASSES='GAEZ classes: >=85 very high, 70-85 high, 55-70 good, 40-55 medium, 25-40 moderate, 10-25 marginal, 0-10 very marginal, 0 not suitable',
                          METHOD='Source index (0-10000) divided by 100; non-land / no-data codes -> 255. Cells whose centre lies outside the geoBoundaries outline -> 255.',
                          COUNTRY=COUNTRIES[iso], ISO3=iso, PROCESSED=datetime.date.today().isoformat(), PRODUCER='Lenga Maps (lengamaps.com)')
        # district stats: mean index and % of area with index >= 40
        mean = exact_extract(tif, d, 'mean', output='pandas')
        good = np.where(st == 255, 255, (st >= 40) * 100).astype('uint8')
        gt = tif.replace('.tif', '_ge40.tmp.tif')
        with rasterio.open(tif) as src: prof = src.profile
        with rasterio.open(gt, 'w', **prof) as o: o.write(good)
        pct = exact_extract(gt, d, 'mean', output='pandas'); os.remove(gt)
        for i, c in enumerate(CROPS):
            mc = mean.columns[i] if len(CROPS) > 1 else mean.columns[0]; pc = pct.columns[i] if len(CROPS) > 1 else pct.columns[0]
            long.append(pd.DataFrame({'shapeID': d.shapeID, 'shapeName': d.shapeName, 'crop_code': c, 'crop': CROPS[c], 'input_level': label,
                                      'mean_suitability': mean[mc].round(1).values, 'pct_area_medium_or_better': pct[pc].round(1).values}))
    L = pd.concat(long, ignore_index=True)
    low = L[L.input_level == INPUT['LRLM']]
    wide = low.pivot_table(index='shapeID', columns='crop_code', values='pct_area_medium_or_better')
    best = low.sort_values('pct_area_medium_or_better', ascending=False).groupby('shapeID').apply(
        lambda x: ', '.join(x[x.pct_area_medium_or_better >= 25].crop.head(5)) or 'none above 25% of area')
    from pyproj import Geod; G = Geod(ellps='WGS84')
    d['area_ha'] = [round(abs(G.geometry_area_perimeter(g)[0]) / 1e4, 1) for g in d.geometry]
    d['best_crops_low_input'] = d.shapeID.map(best)
    cols = BASE_COLS + [('best_crops_low_input', '', 'Up to 5 crops with the largest share of district area rated medium or better (index >= 40) under low-input rain-fed farming; only crops covering at least 25% of the district')]
    for c in CROPS:
        d[f'{c.lower()}_pct_suitable'] = d.shapeID.map(wide[c]) if c in wide else np.nan
        cols.append((f'{c.lower()}_pct_suitable', '%', f'{CROPS[c]}: share of district area rated medium or better (index >= 40), low input, rain-fed'))
    d['boundary_licence'] = LIC.get(iso, {}).get('license'); cols.append(('boundary_licence', '', 'Licence of the district boundary'))
    about = {'title': f'Crop suitability by district (GAEZ v5), {COUNTRIES[iso]}', 'country': COUNTRIES[iso],
             'source': 'FAO/IIASA GAEZ v5 continuous crop suitability index, 30 arc-sec (~1 km), climate 2001-2020 (AgERA5), released April 2025',
             'citation': CIT, 'licence': 'CC BY 4.0 IGO (FAO); boundaries: see boundary_licence', 'boundaries': BOUND_ABOUT,
             'boundary_licence': str(LIC.get(iso, {}).get('license')),
             'method': 'District values are coverage-weighted (exactextract) over ~1 km cells: mean index (0-100) and % of district area with index >= 40 (GAEZ medium suitability or better). The suitability_by_crop table holds both input levels for all 29 crops.',
             'note': 'Agro-climatic and soil suitability under the stated management, not current land use or yield. Low input: traditional management, no fertiliser. High input: improved varieties, fertiliser, mechanisation. Rain-fed only.',
             'crs': 'EPSG:4326', 'processed': datetime.date.today().isoformat(), 'producer': 'Lenga Maps (lengamaps.com)'}
    g = gpd.GeoDataFrame(d[[c for c, _, _ in cols] + ['geometry']], crs=4326)
    write(g, gp, 'crop_suitability_districts', about, cols, extra=('suitability_by_crop', L, 'district suitability per crop and input level'))
    import sqlite3
    con = sqlite3.connect(gp)
    con.executemany('insert into columns values (?,?,?)', [('suitability_by_crop.shapeID', '', 'geoBoundaries district ID'), ('suitability_by_crop.shapeName', '', 'District name'),
        ('suitability_by_crop.crop_code', '', 'GAEZ crop code'), ('suitability_by_crop.crop', '', 'Crop'), ('suitability_by_crop.input_level', '', 'Management: low or high input, rain-fed'),
        ('suitability_by_crop.mean_suitability', 'index 0-100', 'Coverage-weighted mean suitability index'),
        ('suitability_by_crop.pct_area_medium_or_better', '%', 'Share of district area with index >= 40')])
    con.commit(); con.close()
    z = low[low.crop_code == 'MZE'].pct_area_medium_or_better
    return iso, len(d), round(float(z.mean()), 1)
if __name__ == '__main__':
    if sys.argv[1] == 'fetch':
        with Pool(6) as p:
            for r in p.imap_unordered(fetch, [(c, i) for c in CROPS for i in INPUT]): print(*r, flush=True)
    else:
        isos = sys.argv[2:] or sorted(COUNTRIES)
        with Pool(3) as p:
            for r in p.imap_unordered(build, isos): print(*r, flush=True)
