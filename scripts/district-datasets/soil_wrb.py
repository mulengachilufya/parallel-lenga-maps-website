"""SoilGrids 2.0 WRB most-probable Reference Soil Group (250 m, EPSG:4326) clipped to each country.
Pixels whose centre lies outside the country polygon are set to NoData (255). Output: tiled,
deflate-compressed GeoTIFF with the class names as GDAL category names and metadata tags
(source, licence, citation, per-class area table), plus a CSV legend with class areas."""
import sys, os, glob, json, math, datetime, numpy as np, geopandas as gpd, rasterio
from rasterio.windows import from_bounds
from rasterio.features import geometry_mask
from multiprocessing import Pool
sys.path.insert(0, 'tools'); from countries import COUNTRIES
URL = '/vsicurl/https://files.isric.org/soilgrids/latest/data/wrb/MostProbable.vrt'
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.vrt,.tif,.ovr', GDAL_HTTP_MAX_RETRY=5, GDAL_HTTP_RETRY_DELAY=3, VSI_CACHE=True)
def classes():
    with rasterio.Env(**ENV), rasterio.open(URL) as s:
        import xml.etree.ElementTree as ET, urllib.request
    xml = urllib.request.urlopen('https://files.isric.org/soilgrids/latest/data/wrb/MostProbable.vrt', timeout=120).read().decode()
    root = ET.fromstring(xml); out = {}
    for row in root.iter('Row'):
        f = [x.text for x in row.findall('F')]; out[int(f[0])] = f[1]
    return out
CLS = None
def one(iso):
    out = f'out/Soil_Classification/{iso}_Soil_Classification_WRB.tif'
    if os.path.exists(out): return iso, 'cached'
    g = gpd.read_file(f'bnd/{iso}.gpkg'); geom = g.union_all()
    with rasterio.Env(**ENV), rasterio.open(URL) as s:
        w = from_bounds(*geom.bounds, transform=s.transform).round_offsets(op='floor').round_lengths(op='ceil')
        a = s.read(1, window=w, boundless=True, fill_value=255)
        T = s.window_transform(w)
    m = geometry_mask([geom], a.shape, T, invert=True)
    a[~m] = 255
    if m.sum() and (a[m] == 255).mean() > 0.2:   # a failed remote read comes back as fill, not an error
        raise RuntimeError(f'{iso}: {(a[m] == 255).mean():.0%} NoData inside the country, read failed')
    # class areas (km2) using true cell area by latitude
    lat = T.f + (np.arange(a.shape[0]) + 0.5) * T.e
    cell = (6371.0072 ** 2) * math.radians(T.a) * np.abs(np.sin(np.radians(lat + T.e / 2)) - np.sin(np.radians(lat - T.e / 2)))
    areas = {}
    for v in np.unique(a[a != 255]):
        areas[CLS.get(int(v), str(v))] = round(float((cell[:, None] * (a == v)).sum()), 1)
    tot = sum(areas.values()) or 1
    prof = dict(driver='GTiff', dtype='uint8', count=1, width=a.shape[1], height=a.shape[0], crs='EPSG:4326', transform=T,
                nodata=255, tiled=True, blockxsize=256, blockysize=256, compress='deflate', predictor=2)
    with rasterio.open(out + '.part.tif', 'w', **prof) as d:
        d.write(a, 1)
        d.update_tags(TITLE=f'Soil classification (WRB Reference Soil Groups), {COUNTRIES[iso]}',
            SOURCE='ISRIC SoilGrids 2.0, WRB most probable Reference Soil Group, 250 m (files.isric.org/soilgrids/latest/data/wrb/MostProbable.vrt)',
            CITATION='Poggio, L. et al. 2021. SoilGrids 2.0: producing soil information for the globe with quantified spatial uncertainty. SOIL 7: 217-240. https://doi.org/10.5194/soil-7-217-2021',
            LICENCE='CC BY 4.0 (ISRIC SoilGrids). Distributed by Lenga Maps with attribution.',
            METHOD='Clipped to the geoBoundaries country outline; cells whose centre lies outside the country are NoData (255). Values unchanged from source.',
            CLASSES=json.dumps({str(k): v for k, v in CLS.items()}),
            CLASS_AREA_KM2=json.dumps(dict(sorted(areas.items(), key=lambda x: -x[1]))),
            PROCESSED=datetime.date.today().isoformat(), PRODUCER='Lenga Maps (lengamaps.com)')
        mx = max(CLS) + 1
        d.write_colormap(1, {i: tuple(int(x) for x in np.random.default_rng(i).integers(40, 230, 3)) + (255,) for i in range(mx)})
    os.replace(out + '.part.tif', out)
    with open(out.replace('.tif', '_legend.csv'), 'w') as f:
        f.write('value,wrb_group,area_km2,share_pct\n')
        for k, v in sorted(CLS.items()):
            ar = areas.get(v, 0)
            if ar: f.write(f'{k},{v},{ar},{round(100 * ar / tot, 2)}\n')
    return iso, f'{len(areas)} classes'
def init():
    global CLS; CLS = classes()
if __name__ == '__main__':
    isos = sys.argv[1:] or sorted(COUNTRIES)
    with Pool(3, initializer=init) as p:
        for r in p.imap_unordered(one, isos): print(*r, flush=True)
