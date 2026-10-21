"""Fetch one iSDAsoil band at overview level 2 (8x = 240 m in EPSG:3857) to a local GeoTIFF."""
import sys, rasterio, numpy as np
from rasterio.windows import Window
var, band = sys.argv[1], int(sys.argv[2])
src_url = f'/vsicurl/https://isdasoil.s3.amazonaws.com/soil_data/{var}/{var}.tif'
out = f'soil/rasters/{var}_b{band}.tif'
env = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY=5, GDAL_HTTP_RETRY_DELAY=3, VSI_CACHE=True, GDAL_CACHEMAX=1024)
with rasterio.Env(**env):
    with rasterio.open(src_url, overview_level=2) as s:
        prof = s.profile.copy()
        prof.update(count=1, driver='GTiff', compress='deflate', tiled=True, blockxsize=512, blockysize=512, BIGTIFF='YES')
        prof.pop('photometric', None)
        with rasterio.open(out + '.part', 'w', **prof) as d:
            step = 2048
            for r in range(0, s.height, step):
                w = Window(0, r, s.width, min(step, s.height - r))
                d.write(s.read(band, window=w), 1, window=w)
import os; os.replace(out + '.part', out); print(out, prof['width'], prof['height'])
