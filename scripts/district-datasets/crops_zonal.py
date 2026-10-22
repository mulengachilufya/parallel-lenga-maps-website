"""SPAM 2020 v2.2 (all technologies) -> per-district physical area (ha), harvested area (ha),
production (t) for all 46 crops.

SPAM allocates each 5-arcmin cell to ONE country. Splitting a border cell by area would hand one
country's crops to its neighbour (tested: Gambia maize +95%). So:
  1. each cell belongs to the country under its centre (or, for coastal cells whose centre is at
     sea, the country covering most of it);
  2. within that country the cell's value is split among districts by the share of the cell each
     covers (10x10 sub-cells per cell, ~0.9 km).
National totals therefore equal SPAM's own cell sums, and district totals are area-exact to ~1%.
Writes crops/district_crops.csv (uid, crop, phys_ha, harv_ha, prod_t)."""
import glob, os, numpy as np, pandas as pd, geopandas as gpd, rasterio
from rasterio.features import rasterize
from rasterio.windows import from_bounds
R = 'crops/raw/spam2020V2r2_global_{v}.geotiff/spam2020V2r2_global_{v}/spam2020_V2r2_global_{c}_{crop}_A.tif'
V = {'physical_area': ('A', 'phys_ha'), 'harvested_area': ('H', 'harv_ha'), 'production': ('P', 'prod_t')}
crops = sorted(os.path.basename(f).split('_')[-2] for f in glob.glob(R.format(v='production', c='P', crop='*')))
D = pd.concat([gpd.read_file(f) for f in sorted(glob.glob('bnd/*.gpkg'))], ignore_index=True)
D = gpd.GeoDataFrame(D, geometry='geometry', crs=4326); D['uid'] = D['iso3'] + ':' + D['shapeID'].astype(str)
isos = sorted(D.iso3.unique()); iso_idx = {k: i + 1 for i, k in enumerate(isos)}
F = 10
ref = rasterio.open(R.format(v='production', c='P', crop='MAIZ'))
W = from_bounds(-26.0, -35.0, 58.0, 38.0, ref.transform).round_offsets(op='floor').round_lengths(op='ceil')
T = ref.window_transform(W); h, w = int(W.height), int(W.width)
fT = rasterio.Affine(T.a / F, 0, T.c, 0, T.e / F, T.f)
dist = rasterize(((g, i + 1) for i, g in enumerate(D.geometry)), out_shape=(h * F, w * F), transform=fT, fill=0, dtype='int32')
ctry = np.zeros_like(dist, dtype='int16'); lut = np.array([0] + [iso_idx[k] for k in D.iso3], dtype='int16'); ctry = lut[dist]
# country owning each coarse cell: centre sub-cell, else majority of its sub-cells
blk = ctry.reshape(h, F, w, F)
own = blk[:, F // 2, :, F // 2].copy()
miss = own == 0
if miss.any():
    b = blk.transpose(0, 2, 1, 3).reshape(h, w, F * F)
    for (r, c) in zip(*np.nonzero(miss)):
        v = b[r, c][b[r, c] > 0]
        if len(v): own[r, c] = np.bincount(v).argmax()
ownf = np.repeat(np.repeat(own, F, 0), F, 1)
valid = (ctry == ownf) & (ctry > 0)
nin = valid.reshape(h, F, w, F).sum(axis=(1, 3))          # in-country sub-cells per coarse cell
dv = dist[valid]
rows_idx = (np.nonzero(valid)[0] // F) * w + (np.nonzero(valid)[1] // F)
frames = []
for v, (c, col) in V.items():
    res = {}
    for crop in crops:
        with rasterio.open(R.format(v=v, c=c, crop=crop)) as s:
            a = s.read(1, window=W, boundless=True, fill_value=0).astype('float64')
        a[~np.isfinite(a) | (a < 0)] = 0
        per = np.divide(a, nin, out=np.zeros_like(a), where=nin > 0).ravel()
        res[crop] = np.bincount(dv, weights=per[rows_idx], minlength=len(D) + 1)[1:]
    df = pd.DataFrame(res); df['uid'] = D.uid.values
    frames.append(df.melt(id_vars='uid', var_name='crop', value_name=col).set_index(['uid', 'crop']))
    print(v, 'done', flush=True)
out = pd.concat(frames, axis=1).reset_index()
out.to_csv('crops/district_crops.csv', index=False)
# SPAM's own national totals (cells allocated to each country) for QA
nat = []
for crop in crops:
    with rasterio.open(R.format(v='production', c='P', crop=crop)) as s:
        a = s.read(1, window=W, boundless=True, fill_value=0).astype('float64')
    a[~np.isfinite(a) | (a < 0)] = 0
    t = np.bincount(own.ravel(), weights=a.ravel(), minlength=len(isos) + 1)
    lost = a[(own > 0) & (nin == 0)].sum()
    nat += [(k, crop, t[iso_idx[k]]) for k in isos]
pd.DataFrame(nat, columns=['iso3', 'crop', 'spam_prod_t']).to_csv('crops/spam_national.csv', index=False)
print(out[['phys_ha', 'harv_ha', 'prod_t']].sum().round())
