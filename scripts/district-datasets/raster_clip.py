"""Clip a global/regional raster to one country: window to the country bounds, cells whose centre lies outside
the geoBoundaries country outline set to NoData. Values unchanged. Processed in row strips so memory stays flat
for 100 m rasters of large countries. Writes a tiled deflate GeoTIFF with tags and returns summary stats over the
in-country cells. Raises if the read came back as fill inside the country."""
import os, datetime, numpy as np, geopandas as gpd, rasterio
from rasterio.windows import from_bounds, Window
from rasterio.features import geometry_mask
from countries import COUNTRIES
STRIP = 1024
def clip(iso, src, out, tags, desc, nodata=-9999.0, dtype='float32', max_missing=0.5, scale=None):
    geom = gpd.read_file(f'bnd/{iso}.gpkg').union_all()
    with rasterio.open(src) as s:
        w = from_bounds(*geom.bounds, transform=s.transform).round_offsets(op='floor').round_lengths(op='ceil')
        T = s.window_transform(w); H, W = int(w.height), int(w.width)
        tiny = not geometry_mask([geom], (H, W), T, invert=True).any() if H * W < 4e6 else False
        prof = dict(driver='GTiff', dtype=dtype, count=1, width=W, height=H, crs='EPSG:4326', transform=T, nodata=nodata,
                    tiled=True, blockxsize=256, blockysize=256, compress='deflate', predictor=3 if dtype.startswith('float') else 2, BIGTIFF='IF_SAFER')
        n_in = n_valid = 0; vmin, vmax, vsum = np.inf, -np.inf, 0.0
        with rasterio.open(out + '.part.tif', 'w', **prof) as d:
            for r0 in range(0, H, STRIP):
                h = min(STRIP, H - r0)
                a = s.read(1, window=Window(w.col_off, w.row_off + r0, W, h), boundless=True, masked=True)
                valid = ~np.ma.getmaskarray(a)
                a = a.filled(np.nan).astype('float64')
                valid &= np.isfinite(a)
                if scale: a = a * scale
                Ts = T * T.translation(0, r0)
                m = geometry_mask([geom], (h, W), Ts, invert=True, all_touched=tiny)  # tiny: country smaller than a cell
                keep = m & valid
                n_in += int(m.sum()); n_valid += int(keep.sum())
                v = a[keep]
                if v.size: vmin, vmax, vsum = min(vmin, v.min()), max(vmax, v.max()), vsum + v.sum()
                d.write(np.where(keep, a, nodata).astype(dtype), 1, window=Window(0, r0, W, h))
            d.set_band_description(1, desc)
            miss = 1 - n_valid / max(n_in, 1)
            stats = dict(min=round(float(vmin), 3), mean=round(vsum / n_valid, 3), max=round(float(vmax), 3), sum=round(vsum, 3),
                         cells=n_valid, missing_share=round(float(miss), 4)) if n_valid else {}
            d.update_tags(**tags, COUNTRY=COUNTRIES[iso], ISO3=iso, PROCESSED=datetime.date.today().isoformat(),
                          PRODUCER='Lenga Maps (lengamaps.com)', STATS=str(stats))
    if miss > max_missing:
        os.remove(out + '.part.tif')
        raise RuntimeError(f'{iso}: {miss:.0%} of in-country cells have no data in {src}')
    os.replace(out + '.part.tif', out)
    return stats
