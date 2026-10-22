"""CHELSA v2.1 1981-2010 mean air temperature (annual = bio1, and monthly tas 01-12), 30 arc-sec,
clipped to each country. Values converted from source encoding (K x 10) to degrees C:
C = v * 0.1 - 273.15. Cells outside the country (pixel-centre rule) or without data are NoData.
Output: one 13-band float32 GeoTIFF per country (band 1 annual, bands 2-13 Jan..Dec)."""
import sys, os, datetime, numpy as np, geopandas as gpd, rasterio, urllib.request, shutil
from rasterio.windows import from_bounds
from rasterio.features import geometry_mask
sys.path.insert(0, 'tools'); from countries import COUNTRIES
B = 'https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/1981-2010/'
FILES = [('annual', 'bio/CHELSA_bio1_1981-2010_V.2.1.tif')] + [(m, f'tas/CHELSA_tas_{i:02d}_1981-2010_V.2.1.tif') for i, m in enumerate(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], 1)]
for _, f in FILES:
    p = 'temp/raw/' + f.split('/')[-1]
    if not os.path.exists(p):
        with urllib.request.urlopen(B + f, timeout=900) as r, open(p + '.part', 'wb') as o: shutil.copyfileobj(r, o, 1 << 22)
        os.replace(p + '.part', p)
print('downloaded', flush=True)
srcs = [rasterio.open('temp/raw/' + f.split('/')[-1]) for _, f in FILES]
for iso in sorted(COUNTRIES):
    out = f'out/Temperature_CHELSA/{iso}_Temperature_CHELSA_1981-2010.tif'
    if os.path.exists(out): continue
    geom = gpd.read_file(f'bnd/{iso}.gpkg').union_all()
    w = from_bounds(*geom.bounds, transform=srcs[0].transform).round_offsets(op='floor').round_lengths(op='ceil')
    T = srcs[0].window_transform(w)
    bands = []
    for s in srcs:
        a = s.read(1, window=w, boundless=True, fill_value=0).astype('float32')
        bands.append(np.where(a > 0, a * 0.1 - 273.15, np.nan).astype('float32'))
    m = geometry_mask([geom], bands[0].shape, T, invert=True)
    nd = -9999.0
    prof = dict(driver='GTiff', dtype='float32', count=13, width=bands[0].shape[1], height=bands[0].shape[0], crs='EPSG:4326',
                transform=T, nodata=nd, tiled=True, blockxsize=256, blockysize=256, compress='deflate', predictor=3)
    with rasterio.open(out + '.part.tif', 'w', **prof) as d:
        for i, (b, (name, _)) in enumerate(zip(bands, FILES), 1):
            b = np.where(m & np.isfinite(b), np.round(b, 2), nd).astype('float32')
            d.write(b, i); d.set_band_description(i, f'tas_{name}_degC')
        d.update_tags(TITLE=f'Mean air temperature 1981-2010, {COUNTRIES[iso]}',
            SOURCE='CHELSA v2.1 climatologies 1981-2010 (bio1 annual mean, tas monthly means), 30 arc-seconds (~1 km)',
            CITATION='Karger, D.N. et al. 2017. Climatologies at high resolution for the earth land surface areas. Scientific Data 4: 170122. Data: https://chelsa-climate.org',
            LICENCE='CC BY 4.0 (CHELSA). Distributed by Lenga Maps with attribution.',
            UNITS='degrees Celsius', BANDS='1 annual mean; 2-13 January..December',
            METHOD='Converted from K x 10 to degrees C (v*0.1-273.15). Clipped to the geoBoundaries country outline (pixel-centre rule); outside = NoData (-9999).',
            PROCESSED=datetime.date.today().isoformat(), PRODUCER='Lenga Maps (lengamaps.com)')
    os.replace(out + '.part.tif', out)
    v = bands[0][m & np.isfinite(bands[0])]
    print(iso, 'annual mean %.1f C (min %.1f, max %.1f)' % (v.mean(), v.min(), v.max()), flush=True)
