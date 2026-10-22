"""WorldPop Global2 R2025A constrained population, 2026 estimate, 100 m: per-country raster clipped to the
geoBoundaries outline plus a district GeoPackage of population totals. Each 100 m cell is assigned to the
district containing its centre; district totals are exact sums of those cells."""
import sys, os, json, time, ssl, math, datetime, urllib.request, numpy as np, pandas as pd, geopandas as gpd, rasterio
from rasterio.features import rasterize
from pyproj import Geod
from multiprocessing import Pool
sys.path.insert(0, 'tools')
from countries import COUNTRIES
from raster_clip import clip
from build_gpkg import write, BASE_COLS, BOUND_ABOUT
YEAR = 2026; GEOD = Geod(ellps='WGS84'); LIC = json.load(open('bnd/licences.json'))
CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
CIT = 'Bondarenko M., Priyatikanto R., Tejedor-Garavito N., Zhang W., McKeen T., Cunningham A., Woods T., Hilton J., Cihan D., Nosatiuk B., Brinkhoff T., Tatem A., Sorichetta A. 2025. Constrained estimates of 2015-2030 total number of people per grid square at a resolution of 3 arc (approximately 100m at the equator) R2025A version v1. Global Demographic Data Project - Funded by The Bill and Melinda Gates Foundation (INV-045237). WorldPop - School of Geography and Environmental Science, University of Southampton. DOI: 10.5258/SOTON/WP00839'
def get(url, dst):
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=900, context=CTX) as r, open(dst + '.part', 'wb') as f:
                while (b := r.read(1 << 22)): f.write(b)
            os.replace(dst + '.part', dst); return
        except Exception:
            if i == 3: raise
            time.sleep(5 * (i + 1))
def one(iso):
    part = f'wpop/parts/{iso}.json'
    if os.path.exists(part): return json.load(open(part))
    raw = f'wpop/raw/{iso}.tif'
    if not os.path.exists(raw):
        get(f'https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/{YEAR}/{iso}/v1/100m/constrained/{iso.lower()}_pop_{YEAR}_CN_100m_R2025A_v1.tif', raw)
    src_total = 0.0
    with rasterio.open(raw) as r:
        for _, win in r.block_windows(1):
            src_total += float(r.read(1, window=win, masked=True).sum() or 0)
    fn = f'{iso}_Population_{YEAR}_WorldPop_100m.tif'
    st = clip(iso, raw, f'out/Population_WorldPop/{fn}', dict(TITLE=f'Population {YEAR}, people per 100 m cell, {COUNTRIES[iso]}',
        SOURCE=f'WorldPop Global2 R2025A v1, constrained, {YEAR} estimate, 3 arc-second (~100 m)', CITATION=CIT,
        LICENCE='CC BY 4.0 (WorldPop). Distributed by Lenga Maps with attribution.', UNITS='people per cell',
        METHOD='Clipped to the geoBoundaries country outline; cells whose centre lies outside the country are NoData. Values unchanged from source. Constrained: only cells mapped as built-up hold people; all others are NoData in the source.'),
        f'population_{YEAR}', max_missing=1.0)
    # district totals on the clipped raster
    d = gpd.read_file(f'bnd/{iso}.gpkg')
    tot = np.zeros(len(d) + 1); raster_total = 0.0
    from rasterio.windows import Window
    with rasterio.open(f'out/Population_WorldPop/{fn}') as r:
        for r0 in range(0, r.height, 1024):
            h = min(1024, r.height - r0)
            p = r.read(1, window=Window(0, r0, r.width, h), masked=True).filled(0).astype('float64')
            ids = rasterize(((g, i + 1) for i, g in enumerate(d.geometry)), out_shape=p.shape, transform=r.transform * r.transform.translation(0, r0), fill=0, dtype='int32')
            tot += np.bincount(ids.ravel(), weights=p.ravel(), minlength=len(d) + 1); raster_total += p.sum()
    d['area_ha'] = [round(abs(GEOD.geometry_area_perimeter(g)[0]) / 1e4, 1) for g in d.geometry]
    d[f'pop_{YEAR}'] = np.round(tot[1:]).astype('int64')
    d['density_km2'] = (d[f'pop_{YEAR}'] / (d.area_ha / 100)).round(2)
    d['boundary_licence'] = LIC.get(iso, {}).get('license')
    d['share_pct'] = (100 * d[f'pop_{YEAR}'] / max(d[f'pop_{YEAR}'].sum(), 1)).round(3)
    cols = BASE_COLS + [(f'pop_{YEAR}', 'people', f'Estimated population {YEAR} (sum of WorldPop 100 m cells whose centre lies in the district)'),
                        ('density_km2', 'people/km2', 'Population per km2 of district area'), ('share_pct', '%', 'Share of the national total'), ('boundary_licence', '', 'Licence of the district boundary')]
    about = {'title': f'Population by district, {YEAR} (WorldPop R2025A)', 'country': COUNTRIES[iso], 'source': f'WorldPop Global2 R2025A v1 constrained {YEAR}, 100 m',
             'citation': CIT, 'licence': 'CC BY 4.0 (WorldPop). Distributed by Lenga Maps with attribution.', 'boundaries': BOUND_ABOUT, 'boundary_licence': str(LIC.get(iso, {}).get('license')), 'boundary_source': str(LIC.get(iso, {}).get('source')),
             'method': 'Each 100 m cell assigned to the district containing its centre; district value is the exact sum. Cells outside every district (border slivers) are not counted.',
             'national_total_source_file': str(round(src_total)), 'national_total_districts': str(int(d[f'pop_{YEAR}'].sum())),
             'note': 'Modelled estimate (alpha release R2025A, may be revised by WorldPop). Not a census count.',
             'crs': 'EPSG:4326', 'processed': datetime.date.today().isoformat(), 'producer': 'Lenga Maps (lengamaps.com)'}
    g = gpd.GeoDataFrame(d[[c for c, _, _ in cols] + ['geometry']], crs=4326)
    gp = f'{iso}_Population_Districts_{YEAR}_WorldPop.gpkg'
    write(g, f'out/Population_WorldPop/{gp}', 'population', about, cols)
    os.remove(raw)
    res = {'iso3': iso, 'country': COUNTRIES[iso], 'raster': fn, 'districts_gpkg': gp, 'source_total': round(src_total),
            'district_total': int(d[f'pop_{YEAR}'].sum()), 'raster_total': round(raster_total), **{f'raster_{k}': v for k, v in st.items()}}
    json.dump(res, open(part, 'w')); return res
if __name__ == '__main__':
    isos = sys.argv[1:] or sorted(COUNTRIES)
    os.makedirs('wpop/parts', exist_ok=True)
    with Pool(2) as pool:
        man = []
        for r in pool.imap_unordered(one, isos):
            man.append(r); print(r['iso3'], r['source_total'], r['raster_total'], r['district_total'], flush=True)
    man = [json.load(open(f'wpop/parts/{i}.json')) for i in sorted(COUNTRIES) if os.path.exists(f'wpop/parts/{i}.json')]
    json.dump(sorted(man, key=lambda r: r['iso3']), open('out/Population_WorldPop/manifest.json', 'w'), indent=1)
