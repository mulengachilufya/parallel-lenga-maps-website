"""District solar & wind screening: per-district statistics of Global Solar Atlas GHI / PVOUT and Global Wind Atlas
100 m wind speed / power density (cells assigned to the district containing their centre), WorldPop 2026 population,
and the share of district area within 10 km of a USGS-mapped transmission line (geodesic buffer in the country's
UTM zone). Inputs are the per-country outputs of solar_build, wind_build, worldpop_build and usgs_build."""
import sys, os, json, datetime, warnings, numpy as np, geopandas as gpd, rasterio
from rasterio.features import rasterize
from rasterio.windows import Window
from pyproj import Geod
from multiprocessing import Pool
warnings.filterwarnings('ignore')
sys.path.insert(0, 'tools')
from countries import COUNTRIES
from build_gpkg import write, BASE_COLS, BOUND_ABOUT
GEOD = Geod(ellps='WGS84'); LIC = json.load(open('bnd/licences.json'))
R = {'ghi': ('Solar_Potential/{}_GHI_GlobalSolarAtlas.tif', 'kWh/m2/day', 'Global horizontal irradiation'),
     'pvout': ('Solar_Potential/{}_PVOUT_GlobalSolarAtlas.tif', 'kWh/kWp/day', 'PV power potential'),
     'wind_ms': ('Wind_Potential/{}_WindSpeed100m_GlobalWindAtlas.tif', 'm/s', 'Mean wind speed at 100 m'),
     'wind_wm2': ('Wind_Potential/{}_PowerDensity100m_GlobalWindAtlas.tif', 'W/m2', 'Mean wind power density at 100 m')}
def stats(path, d):
    n = len(d); vals = [[] for _ in range(n + 1)]
    with rasterio.open(path) as r:
        step = max(1, int(4e6 // r.width))
        for r0 in range(0, r.height, step):
            h = min(step, r.height - r0)
            a = r.read(1, window=Window(0, r0, r.width, h), masked=True)
            ids = rasterize(((g, i + 1) for i, g in enumerate(d.geometry)), out_shape=a.shape,
                            transform=r.transform * r.transform.translation(0, r0), fill=0, dtype='int32')
            ok = ~np.ma.getmaskarray(a) & (ids > 0)
            if not ok.any(): continue
            iv, av = ids[ok], a.data[ok].astype('float32')
            order = np.argsort(iv, kind='stable'); iv, av = iv[order], av[order]
            cuts = np.flatnonzero(np.diff(iv)) + 1
            for grp_i, grp_v in zip(np.split(iv, cuts), np.split(av, cuts)):
                vals[grp_i[0]].append(grp_v)
    out = np.full((n, 3), np.nan)
    for i in range(1, n + 1):
        if vals[i]:
            v = np.concatenate(vals[i]); out[i - 1] = [v.mean(), np.percentile(v, 10), np.percentile(v, 90)]
    # Districts smaller than one cell hold no cell centre: use the cell under the district's interior point.
    small = np.flatnonzero(np.isnan(out[:, 0]))
    if len(small):
        with rasterio.open(path) as r:
            pts = [d.geometry.iloc[i].representative_point() for i in small]
            for i, v in zip(small, r.sample([(q.x, q.y) for q in pts], masked=True)):
                if not np.ma.getmaskarray(v)[0]: out[i] = [float(v[0])] * 3
    return out
def one(iso):
    p = f'out/Energy_Screening/{iso}_Solar_Wind_Screening.gpkg'
    d = gpd.read_file(f'bnd/{iso}.gpkg')
    d['area_ha'] = [round(abs(GEOD.geometry_area_perimeter(g)[0]) / 1e4, 1) for g in d.geometry]
    cols = list(BASE_COLS)
    for k, (pat, unit, desc) in R.items():
        s = stats('out/' + pat.format(iso), d)
        for j, suf in enumerate(('mean', 'p10', 'p90')):
            d[f'{k}_{suf}'] = np.round(s[:, j], 3)
            cols.append((f'{k}_{suf}', unit, f'{desc}: {"district mean" if suf == "mean" else ("10th" if suf == "p10" else "90th") + " percentile of cells"} ({"Global Solar Atlas" if k in ("ghi", "pvout") else "Global Wind Atlas 4.0"})'))
    d['pv_kwh_kwp_year'] = np.round(d['pvout_mean'] * 365, 0)
    cols.append(('pv_kwh_kwp_year', 'kWh/kWp/yr', 'Indicative yearly PV yield: pvout_mean x 365'))
    pop = gpd.read_file(f'out/Population_WorldPop/{iso}_Population_Districts_2026_WorldPop.gpkg', ignore_geometry=True)[['shapeID', 'pop_2026', 'density_km2']]
    d = d.merge(pop, on='shapeID', how='left')
    cols += [('pop_2026', 'people', 'WorldPop R2025A 2026 estimate (district total)'), ('density_km2', 'people/km2', 'Population per km2')]
    # share within 10 km of a transmission line
    utm = d.estimate_utm_crs(); share = np.zeros(len(d))
    mi = f'out/Mineral_Industries/{iso}_Mineral_Industries_USGS.gpkg'
    has_lines = False
    if os.path.exists(mi):
        import pyogrio
        if 'power_transmission' in [l[0] for l in pyogrio.list_layers(mi)]:
            ln = gpd.read_file(mi, layer='power_transmission').to_crs(utm)
            if len(ln):
                has_lines = True
                buf = ln.buffer(10000).make_valid().union_all()
                du = d.to_crs(utm).make_valid()
                share = np.round(100 * du.intersection(buf).area / du.area, 2)
    d['grid_10km_pct'] = share if has_lines else np.nan
    cols.append(('grid_10km_pct', '%', 'Share of district area within 10 km of a transmission line mapped by USGS (2018 reference); empty where USGS maps no lines in the country. Lines may be incomplete: a low value is not proof there is no grid.'))
    d['boundary_licence'] = LIC.get(iso, {}).get('license')
    cols.append(('boundary_licence', '', 'Licence of the district boundary'))
    about = {'title': f'Solar & wind screening by district, {COUNTRIES[iso]}', 'country': COUNTRIES[iso],
             'source': 'Global Solar Atlas v2 (Solargis, April 2026); Global Wind Atlas 4.0 (DTU, 2025); WorldPop Global2 R2025A 2026; USGS mineral industries & infrastructure of Africa (2018 reference)',
             'citation': 'Global Solar Atlas 2.0 (Solargis / World Bank ESMAP); Global Wind Atlas 4.0 (DTU / World Bank ESMAP); WorldPop (2025) doi:10.5258/SOTON/WP00839; Padilla et al. (2021) USGS doi:10.5066/P97EQWXP',
             'licence': 'CC BY 4.0 (solar, wind, population); public domain (USGS lines). Global Solar Atlas mandatory addition: https://globalsolaratlas.info/support/terms-of-use',
             'boundaries': BOUND_ABOUT, 'boundary_licence': str(LIC.get(iso, {}).get('license')),
             'method': 'Raster cells assigned to the district containing their centre; mean and 10th/90th percentiles over those cells. Districts smaller than one cell take the value of the cell under their interior point. Grid share: 10 km buffer of USGS transmission lines in the UTM zone of the country, intersected with each district.',
             'note': 'Screening data for comparing districts, not a site assessment. Long-term averages; exclusions (protected areas, slope, land use) are not applied.',
             'crs': 'EPSG:4326', 'processed': datetime.date.today().isoformat(), 'producer': 'Lenga Maps (lengamaps.com)'}
    g = gpd.GeoDataFrame(d[[c for c, _, _ in cols] + ['geometry']], crs=4326)
    write(g, p, 'solar_wind_screening', about, cols)
    return iso, len(g), round(float(np.nanmean(d['pvout_mean'])), 3), round(float(np.nanmean(d['wind_ms_mean'])), 2), int(d['ghi_mean'].isna().sum()), has_lines
if __name__ == '__main__':
    isos = sys.argv[1:] or sorted(COUNTRIES)
    with Pool(3) as pool:
        for r in pool.imap_unordered(one, isos): print(*r, flush=True)
