"""Global Solar Atlas v2 (Solargis, 2026 release) GHI and PVOUT long-term averages, clipped per country."""
import sys, json; sys.path.insert(0, 'tools')
from multiprocessing import Pool
from countries import COUNTRIES
from raster_clip import clip
LIC = 'CC BY 4.0 with the Global Solar Atlas mandatory addition (WIPO mediation / UNCITRAL arbitration clause): https://globalsolaratlas.info/support/terms-of-use'
CIT = 'Global Solar Atlas 2.0, a free, web-based application developed and operated by Solargis s.r.o. on behalf of the World Bank Group, utilizing Solargis data, with funding provided by ESMAP. https://globalsolaratlas.info'
V = {'GHI': ('solar/raw/GHI.tif', 'ghi_kwh_m2_day', 'Global horizontal irradiation, long-term average of daily totals (kWh/m2 per day), 250 m'),
     'PVOUT': ('solar/raw/PVOUT.tif', 'pvout_kwh_kwp_day', 'Photovoltaic power potential, long-term average of daily totals (kWh/kWp per day), 1 km')}
def one(iso):
    res = {'iso3': iso, 'country': COUNTRIES[iso]}
    for k, (src, desc, title) in V.items():
        fn = f'{iso}_{k}_GlobalSolarAtlas.tif'
        st = clip(iso, src, f'out/Solar_Potential/{fn}', dict(TITLE=f'{title}, {COUNTRIES[iso]}',
            SOURCE='Global Solar Atlas v2, Solargis model, data release April 2026 (long-term average to 2025; start year 1994-2019 depending on region)',
            CITATION=CIT, LICENCE=LIC, UNITS=desc.split('_', 1)[1],
            METHOD='Clipped to the geoBoundaries country outline; cells whose centre lies outside the country are NoData (-9999). Values unchanged from source. Multiply by 365 for annual totals.'), desc)
        res[k] = {'filename': fn, **st}
    return res
if __name__ == '__main__':
    with Pool(4) as p: man = [r for r in p.imap_unordered(one, sorted(COUNTRIES)) if print(r['iso3'], r['GHI'].get('mean'), r['PVOUT'].get('mean'), flush=True) or True]
    json.dump(sorted(man, key=lambda r: r['iso3']), open('out/Solar_Potential/manifest.json', 'w'), indent=1)
