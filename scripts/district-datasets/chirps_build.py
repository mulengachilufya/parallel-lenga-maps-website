"""CHIRPS v3.0 annual rainfall 1981-2025 (CHC, UCSB): per-country 45-band GeoTIFF clipped to the geoBoundaries outline,
and district statistics (coverage-weighted means with exactextract): 1991-2020 normal, latest year, anomaly, driest and
wettest year, linear trend. Source sea cells are -9999 with no NoData flag set; values below 0 are treated as NoData."""
import sys, os, json, datetime, warnings, numpy as np, pandas as pd, geopandas as gpd, rasterio, sqlite3
from rasterio.windows import from_bounds
from rasterio.features import geometry_mask
from exactextract import exact_extract
from multiprocessing import Pool
warnings.filterwarnings('ignore')
sys.path.insert(0, 'tools')
from countries import COUNTRIES
from build_gpkg import write, BASE_COLS, BOUND_ABOUT
YEARS = list(range(1981, 2026)); LAST = YEARS[-1]
LIC = json.load(open('bnd/licences.json'))
CIT = 'Funk, C. et al. (2025). CHIRPS3: Climate Hazards Center InfraRed Precipitation with Stations, version 3. Scientific Data. Climate Hazards Center, UC Santa Barbara. https://www.chc.ucsb.edu/data/chirps3'
def one(iso):
    d = gpd.read_file(f'bnd/{iso}.gpkg'); geom = d.union_all()
    with rasterio.open('chirps/raw/chirps-v3.0.1981.tif') as s0:
        b = s0.bounds
    if not (geom.bounds[0] >= b.left and geom.bounds[2] <= b.right and geom.bounds[1] >= b.bottom and geom.bounds[3] <= b.top):
        return iso, 'outside the CHIRPS Africa domain, skipped'
    out_gpkg = f'out/Rainfall_CHIRPSv3/{iso}_Rainfall_Districts_CHIRPSv3.gpkg'
    if os.path.exists(out_gpkg): return iso, 'done'
    stack = []
    for y in YEARS:
        with rasterio.open(f'chirps/raw/chirps-v3.0.{y}.tif') as s:
            w = from_bounds(*geom.bounds, transform=s.transform).round_offsets(op='floor').round_lengths(op='ceil')
            a = s.read(1, window=w, boundless=True, fill_value=-9999).astype('float32'); T = s.window_transform(w)
        a[a < 0] = -9999; stack.append(a)
    st = np.stack(stack)
    m = geometry_mask([geom], st.shape[1:], T, invert=True, all_touched=True)   # keep every cell touching the country (5 km cells; small islands)
    st[:, ~m] = -9999
    tif = f'out/Rainfall_CHIRPSv3/{iso}_Rainfall_Annual_CHIRPSv3_1981-2025.tif'
    prof = dict(driver='GTiff', dtype='float32', count=len(YEARS), width=st.shape[2], height=st.shape[1], crs='EPSG:4326', transform=T,
                nodata=-9999, tiled=True, blockxsize=256, blockysize=256, compress='deflate', predictor=3)
    with rasterio.open(tif, 'w', **prof) as o:
        o.write(st)
        for i, y in enumerate(YEARS): o.set_band_description(i + 1, f'rain_{y}_mm')
        o.update_tags(TITLE=f'Annual rainfall 1981-2025 (CHIRPS v3.0), {COUNTRIES[iso]}', SOURCE='CHIRPS v3.0 annual totals, Africa, 0.05 deg (data.chc.ucsb.edu/products/CHIRPS/v3.0/annual/africa)',
                      CITATION=CIT, LICENCE='CHIRPS data are in the public domain (CHC, UCSB); credit CHC.', UNITS='mm/year',
                      METHOD='Cells touching the geoBoundaries outline kept (0.05 deg cells), others NoData (-9999). One band per year; values unchanged from source.',
                      COUNTRY=COUNTRIES[iso], ISO3=iso, PROCESSED=datetime.date.today().isoformat(), PRODUCER='Lenga Maps (lengamaps.com)')
    # district coverage-weighted means for every band
    res = exact_extract(tif, d, 'mean', output='pandas')
    V = res.values.astype(float)                 # districts x years
    V[V < 0] = np.nan
    normal = np.nanmean(V[:, YEARS.index(1991):YEARS.index(2020) + 1], axis=1)
    yrs = np.array(YEARS, float)
    slope = np.array([np.polyfit(yrs[~np.isnan(v)], v[~np.isnan(v)], 1)[0] * 10 if np.isfinite(v).sum() > 10 else np.nan for v in V])
    d['area_ha'] = gpd.GeoSeries(d.geometry).to_crs(d.estimate_utm_crs()).area.div(1e4).round(1) if False else None
    from pyproj import Geod; G = Geod(ellps='WGS84')
    d['area_ha'] = [round(abs(G.geometry_area_perimeter(g)[0]) / 1e4, 1) for g in d.geometry]
    d['rain_normal_1991_2020_mm'] = np.round(normal, 1)
    d[f'rain_{LAST}_mm'] = np.round(V[:, -1], 1)
    d[f'anomaly_{LAST}_pct'] = np.round(100 * (V[:, -1] - normal) / normal, 1)
    d['driest_year'] = [YEARS[int(np.nanargmin(v))] if np.isfinite(v).any() else None for v in V]
    d['wettest_year'] = [YEARS[int(np.nanargmax(v))] if np.isfinite(v).any() else None for v in V]
    d['trend_mm_per_decade_1981_2025'] = np.round(slope, 1)
    d['boundary_licence'] = LIC.get(iso, {}).get('license')
    cols = BASE_COLS + [('rain_normal_1991_2020_mm', 'mm/year', 'Mean annual rainfall 1991-2020 (WMO climate normal period), district coverage-weighted mean'),
        (f'rain_{LAST}_mm', 'mm', f'Total rainfall in {LAST}'), (f'anomaly_{LAST}_pct', '%', f'{LAST} rainfall relative to the 1991-2020 normal'),
        ('driest_year', 'year', 'Year with the lowest district rainfall, 1981-2025'), ('wettest_year', 'year', 'Year with the highest district rainfall, 1981-2025'),
        ('trend_mm_per_decade_1981_2025', 'mm/decade', 'Least-squares linear trend of annual rainfall 1981-2025 (descriptive, not a significance test)'),
        ('boundary_licence', '', 'Licence of the district boundary')]
    long = pd.DataFrame(V, columns=YEARS); long['shapeID'] = d.shapeID.values; long['shapeName'] = d.shapeName.values
    long = long.melt(id_vars=['shapeID', 'shapeName'], var_name='year', value_name='rain_mm').round({'rain_mm': 1})
    about = {'title': f'Rainfall by district 1981-2025 (CHIRPS v3.0), {COUNTRIES[iso]}', 'country': COUNTRIES[iso],
             'source': 'CHIRPS v3.0 annual totals (Climate Hazards Center, UC Santa Barbara), released 2025', 'citation': CIT,
             'licence': 'CHIRPS: public domain, credit CHC. Boundaries: see boundary_licence.', 'boundaries': BOUND_ABOUT,
             'boundary_licence': str(LIC.get(iso, {}).get('license')),
             'method': 'District values are coverage-weighted means of 0.05 deg cells (exactextract), so small districts get the share of each cell they cover. Sea cells (-9999) excluded.',
             'note': 'Satellite-plus-station estimate. Station density is low in parts of Africa; use with local gauge data for engineering design.',
             'crs': 'EPSG:4326', 'processed': datetime.date.today().isoformat(), 'producer': 'Lenga Maps (lengamaps.com)'}
    g = gpd.GeoDataFrame(d[[c for c, _, _ in cols] + ['geometry']], crs=4326)
    write(g, f'out/Rainfall_CHIRPSv3/{iso}_Rainfall_Districts_CHIRPSv3.gpkg', 'rainfall_districts', about, cols,
          extra=('rainfall_by_year', long, 'district rainfall per year'))
    con = sqlite3.connect(f'out/Rainfall_CHIRPSv3/{iso}_Rainfall_Districts_CHIRPSv3.gpkg')
    con.executemany('insert into columns values (?,?,?)', [('rainfall_by_year.year', 'year', 'Calendar year'), ('rainfall_by_year.rain_mm', 'mm', 'District coverage-weighted annual rainfall'),
                                                           ('rainfall_by_year.shapeID', '', 'geoBoundaries district ID'), ('rainfall_by_year.shapeName', '', 'District name')])
    con.commit(); con.close()
    nat = float(np.nanmean(normal))
    return iso, len(d), round(nat) if np.isfinite(nat) else None, int(np.isnan(normal).sum()), round(float(np.nanmean(d[f'anomaly_{LAST}_pct'])), 1)
if __name__ == '__main__':
    isos = sys.argv[1:] or sorted(COUNTRIES)
    with Pool(3) as p:
        for r in p.imap_unordered(one, isos): print(*r, flush=True)
