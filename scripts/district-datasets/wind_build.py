"""Global Wind Atlas 4.0 (DTU / World Bank ESMAP) mean wind speed and power density at 100 m, per country."""
import sys, os, json, time, ssl, urllib.request; sys.path.insert(0, 'tools')
from multiprocessing import Pool
from countries import COUNTRIES
from raster_clip import clip
CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
V = {'wind-speed': ('WindSpeed100m', 'wind_speed_100m_m_s', 'Mean wind speed at 100 m above ground (m/s), 250 m', 'm/s'),
     'power-density': ('PowerDensity100m', 'power_density_100m_w_m2', 'Mean wind power density at 100 m above ground (W/m2), 250 m', 'W/m2')}
JOIN = {'MAR': ['ESH']}
def get(url, dst):
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=600, context=CTX) as r, open(dst + '.part', 'wb') as f: f.write(r.read())
            os.replace(dst + '.part', dst); return
        except Exception as e:
            if i == 3: raise
            time.sleep(5 * (i + 1))
def one(iso):
    res = {'iso3': iso, 'country': COUNTRIES[iso]}
    for layer, (tag, desc, title, unit) in V.items():
        raw = f'wind/raw/{iso}_{layer}.tif'
        if not os.path.exists(raw):
            get(f'https://globalwindatlas.info/api/gis/country/{iso}/{layer}/100', raw)
            for extra in JOIN.get(iso, []):   # GWA serves these as separate countries; geoBoundaries includes them
                ex = f'wind/raw/{extra}_{layer}.tif'; get(f'https://globalwindatlas.info/api/gis/country/{extra}/{layer}/100', ex)
                import rasterio; from rasterio.merge import merge
                srcs = [rasterio.open(raw), rasterio.open(ex)]; a, T = merge(srcs, nodata=float('nan'))
                prof = srcs[0].profile | dict(width=a.shape[2], height=a.shape[1], transform=T, nodata=float('nan'), compress='deflate', tiled=True)
                [x.close() for x in srcs]
                with rasterio.open(raw, 'w', **prof) as d: d.write(a)
                os.remove(ex)
        fn = f'{iso}_{tag}_GlobalWindAtlas.tif'
        if iso in JOIN: res['note'] = 'Mosaic of GWA country files ' + ', '.join([iso] + JOIN[iso]) + ' to match the geoBoundaries outline.'
        st = clip(iso, raw, f'out/Wind_Potential/{fn}', dict(TITLE=f'{title}, {COUNTRIES[iso]}',
            SOURCE='Global Wind Atlas 4.0 (DTU Wind and Energy Systems, World Bank ESMAP), released June 2025; country GeoTIFF from globalwindatlas.info',
            CITATION='Global Wind Atlas 4.0, a free, web-based application developed, owned and operated by the Technical University of Denmark (DTU). The Global Wind Atlas 4.0 is released in partnership with the World Bank Group, utilizing data provided by Vortex, using funding provided by the Energy Sector Management Assistance Program (ESMAP). https://globalwindatlas.info',
            LICENCE='CC BY 4.0 (Global Wind Atlas terms of use). Distributed by Lenga Maps with attribution.', UNITS=unit,
            METHOD='Clipped to the geoBoundaries country outline (land only; GWA offshore EEZ cells removed); cells whose centre lies outside the country are NoData (-9999). Values unchanged from source.'), desc)
        res[layer] = {'filename': fn, **st}
        os.remove(raw)
    return res
if __name__ == '__main__':
    with Pool(4) as p: man = [r for r in p.imap_unordered(one, sorted(COUNTRIES)) if print(r['iso3'], r['wind-speed'].get('mean'), r['power-density'].get('mean'), flush=True) or True]
    json.dump(sorted(man, key=lambda r: r['iso3']), open('out/Wind_Potential/manifest.json', 'w'), indent=1)
