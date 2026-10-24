"""Built-up surface growth by district 1975-2025 from JRC GHSL GHS-BUILT-S R2023A (30 arc-sec, m2 of built-up surface per
cell). 1975-2020 are observed epochs; 2025 is the GHSL projection. Per country: 6-band GeoTIFF clipped to the
geoBoundaries outline, and a district GeoPackage with coverage-weighted sums (exactextract)."""
import sys, os, json, datetime, warnings, numpy as np, pandas as pd, geopandas as gpd, rasterio, sqlite3
from rasterio.windows import from_bounds
from rasterio.features import geometry_mask
from exactextract import exact_extract
from multiprocessing import Pool
warnings.filterwarnings('ignore')
sys.path.insert(0, 'tools')
from countries import COUNTRIES
from build_gpkg import write, BASE_COLS, BOUND_ABOUT
YEARS = [1975, 1990, 2000, 2010, 2020, 2025]
SRC = 'ghsl/GHS_BUILT_S_E{}_GLOBE_R2023A_4326_30ss_V1_0.tif'
LIC = json.load(open('bnd/licences.json'))
CIT = 'Pesaresi, M., Politis, P. (2023). GHS-BUILT-S R2023A - GHS built-up surface grid, derived from Sentinel-2 composite and Landsat, multitemporal (1975-2030). European Commission, Joint Research Centre. doi:10.2905/9F06F36F-4B11-47EC-ABB0-4F8B7B1D72EA'
def one(iso):
    d = gpd.read_file(f'bnd/{iso}.gpkg'); geom = d.union_all()
    bands = []
    for y in YEARS:
        with rasterio.open(SRC.format(y)) as s:
            w = from_bounds(*geom.bounds, transform=s.transform).round_offsets(op='floor').round_lengths(op='ceil')
            bands.append(s.read(1, window=w, boundless=True, fill_value=0).astype('uint32')); T = s.window_transform(w)
    st = np.stack(bands)
    m = geometry_mask([geom], st.shape[1:], T, invert=True, all_touched=st.shape[1] * st.shape[2] < 400)
    ND = 4294967295
    st[:, ~m] = ND
    tif = f'out/Built_Up_GHSL/{iso}_Built_Up_Surface_GHSL_1975-2025.tif'
    with rasterio.open(tif, 'w', driver='GTiff', dtype='uint32', count=len(YEARS), width=st.shape[2], height=st.shape[1], crs='EPSG:4326',
                       transform=T, nodata=ND, tiled=True, blockxsize=256, blockysize=256, compress='deflate', predictor=2) as o:
        o.write(st)
        for i, y in enumerate(YEARS): o.set_band_description(i + 1, f'built_m2_{y}' + ('_projected' if y > 2020 else ''))
        o.update_tags(TITLE=f'Built-up surface 1975-2025, {COUNTRIES[iso]}', SOURCE='JRC GHSL GHS-BUILT-S R2023A, 30 arc-sec (~1 km), epochs 1975-2020 observed, 2025 projected',
                      CITATION=CIT, LICENCE='CC BY 4.0 (European Commission JRC). Distributed by Lenga Maps with attribution.', UNITS='m2 of built-up surface per cell',
                      METHOD='Cells whose centre lies outside the geoBoundaries outline are NoData. Values unchanged from source.',
                      COUNTRY=COUNTRIES[iso], ISO3=iso, PROCESSED=datetime.date.today().isoformat(), PRODUCER='Lenga Maps (lengamaps.com)')
    res = exact_extract(tif, d, 'sum', output='pandas')
    from pyproj import Geod; G = Geod(ellps='WGS84')
    d['area_ha'] = [round(abs(G.geometry_area_perimeter(g)[0]) / 1e4, 1) for g in d.geometry]
    cols = list(BASE_COLS)
    for i, y in enumerate(YEARS):
        d[f'built_km2_{y}'] = (res.iloc[:, i].astype(float) / 1e6).round(4)
        cols.append((f'built_km2_{y}', 'km2', f'Built-up surface in {y}' + (' (GHSL projection)' if y > 2020 else ' (observed)')))
    d['growth_2000_2020_pct'] = np.where(d.built_km2_2000 > 0, (100 * (d.built_km2_2020 - d.built_km2_2000) / d.built_km2_2000.where(d.built_km2_2000 > 0, 1)).round(1), np.nan)
    d['built_share_2020_pct'] = (100 * d.built_km2_2020 / (d.area_ha / 100)).round(3)
    pop = f'out/Population_WorldPop/{iso}_Population_Districts_2026_WorldPop.gpkg'
    if os.path.exists(pop):
        p = gpd.read_file(pop, ignore_geometry=True)[['shapeID', 'pop_2026']]
        d = d.merge(p, on='shapeID', how='left')
        d['built_m2_per_person'] = np.where(d.pop_2026 > 0, (d.built_km2_2020 * 1e6 / d.pop_2026.where(d.pop_2026 > 0, 1)).round(1), np.nan)
        cols += [('pop_2026', 'people', 'WorldPop R2025A 2026 estimate'), ('built_m2_per_person', 'm2/person', 'Built-up surface 2020 divided by 2026 population (indicative)')]
    cols += [('growth_2000_2020_pct', '%', 'Change in built-up surface 2000-2020 (empty where none in 2000)'), ('built_share_2020_pct', '%', 'Built-up surface 2020 as a share of district area')]
    d['boundary_licence'] = LIC.get(iso, {}).get('license'); cols.append(('boundary_licence', '', 'Licence of the district boundary'))
    about = {'title': f'Built-up area growth by district 1975-2025, {COUNTRIES[iso]}', 'country': COUNTRIES[iso],
             'source': 'JRC Global Human Settlement Layer GHS-BUILT-S R2023A (Sentinel-2 and Landsat), 30 arc-sec', 'citation': CIT,
             'licence': 'CC BY 4.0 (EC JRC); boundaries: see boundary_licence', 'boundaries': BOUND_ABOUT, 'boundary_licence': str(LIC.get(iso, {}).get('license')),
             'method': 'District values are coverage-weighted sums of built-up m2 (exactextract). 1975-2020 observed; 2025 is the GHSL projection.',
             'note': 'Built-up surface counts roofed area (buildings), not plots or roads. Small settlements can be under-detected at 1 km aggregation.',
             'crs': 'EPSG:4326', 'processed': datetime.date.today().isoformat(), 'producer': 'Lenga Maps (lengamaps.com)'}
    g = gpd.GeoDataFrame(d[[c for c, _, _ in cols] + ['geometry']], crs=4326)
    write(g, f'out/Built_Up_GHSL/{iso}_Built_Up_Districts_GHSL.gpkg', 'built_up_districts', about, cols)
    return iso, len(d), round(float(d.built_km2_2000.sum()), 1), round(float(d.built_km2_2020.sum()), 1)
if __name__ == '__main__':
    isos = sys.argv[1:] or sorted(COUNTRIES)
    with Pool(3) as p:
        for r in p.imap_unordered(one, isos): print(*r, flush=True)
