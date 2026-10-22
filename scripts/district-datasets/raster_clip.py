"""Clip a global/regional raster to one country: window to the country bounds, cells whose centre lies outside
the geoBoundaries country outline set to NoData. Values unchanged. Writes a tiled deflate GeoTIFF with tags and
returns summary stats over the in-country cells. Raises if the read came back as fill inside the country."""
import math, datetime, numpy as np, geopandas as gpd, rasterio
from rasterio.windows import from_bounds
from rasterio.features import geometry_mask
from countries import COUNTRIES
def clip(iso, src, out, tags, desc, nodata=-9999.0, dtype='float32', max_missing=0.5, scale=None):
    geom = gpd.read_file(f'bnd/{iso}.gpkg').union_all()
    with rasterio.open(src) as s:
        w = from_bounds(*geom.bounds, transform=s.transform).round_offsets(op='floor').round_lengths(op='ceil')
        a = s.read(1, window=w, boundless=True, masked=True).astype('float64')
        T = s.window_transform(w)
    valid = ~np.ma.getmaskarray(a) & np.isfinite(a.filled(np.nan))
    a = a.filled(np.nan)
    if scale: a = a * scale
    m = geometry_mask([geom], a.shape, T, invert=True)
    if not m.any():   # country smaller than a cell: fall back to all touched cells
        m = geometry_mask([geom], a.shape, T, invert=True, all_touched=True)
    miss = 1 - (valid & m).sum() / max(m.sum(), 1)
    if miss > max_missing:
        raise RuntimeError(f'{iso}: {miss:.0%} of in-country cells have no data in {src}')
    keep = m & valid
    o = np.where(keep, a, nodata).astype(dtype)
    vals = a[keep]
    prof = dict(driver='GTiff', dtype=dtype, count=1, width=o.shape[1], height=o.shape[0], crs='EPSG:4326', transform=T,
                nodata=nodata, tiled=True, blockxsize=256, blockysize=256, compress='deflate', predictor=3 if dtype.startswith('float') else 2)
    stats = dict(min=round(float(vals.min()), 3), mean=round(float(vals.mean()), 3), max=round(float(vals.max()), 3),
                 cells=int(keep.sum()), missing_share=round(float(miss), 4)) if vals.size else {}
    with rasterio.open(out + '.part.tif', 'w', **prof) as d:
        d.write(o, 1); d.set_band_description(1, desc)
        d.update_tags(**tags, COUNTRY=COUNTRIES[iso], ISO3=iso, PROCESSED=datetime.date.today().isoformat(),
                      PRODUCER='Lenga Maps (lengamaps.com)', STATS=str(stats))
    import os; os.replace(out + '.part.tif', out)
    return stats
