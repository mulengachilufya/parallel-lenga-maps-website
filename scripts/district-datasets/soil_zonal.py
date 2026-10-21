"""Per-district soil stats from local 240 m iSDAsoil bands.
exactextract gives, per district, the coverage-weighted share of each raw uint8 value; we
back-transform each raw value (per iSDA metadata) and take the weighted mean / p10 / p90,
so the average is of real units, not of log-transformed codes. Writes soil/parts/<var>_b<band>.parquet"""
import sys, glob, math, numpy as np, pandas as pd, geopandas as gpd
from exactextract import exact_extract
BT = {  # iSDA back-transformation (from each layer's STAC json)
 'ph': lambda x: x / 10, 'bulk_density': lambda x: x / 100,
 'carbon_organic': np.expm1, 'nitrogen_total': np.expm1, 'phosphorous_extractable': np.expm1,
 'potassium_extractable': np.expm1, 'cation_exchange_capacity': np.expm1,
 'clay_content': lambda x: x, 'sand_content': lambda x: x, 'silt_content': lambda x: x,
}
def back(var, v):
    v = np.asarray(v, dtype=float)
    # Total N: expm1(x/100) per the Earth Engine catalogue (ISDASOIL/Africa/v1/nitrogen_total).
    # The S3 STAC json says expm1(x/10), which gives impossible ~500 g/kg; verified against typical 0.5-2 g/kg.
    if var == 'nitrogen_total': return np.expm1(v / 100)
    return BT[var](v / 10) if BT[var] is np.expm1 else BT[var](v)
def wq(vals, w, q):
    o = np.argsort(vals); c = np.cumsum(w[o]); c /= c[-1]
    return float(vals[o][np.searchsorted(c, q)])
def run(var, band):
    D = pd.concat([gpd.read_file(f) for f in sorted(glob.glob('bnd/*.gpkg'))], ignore_index=True)
    D = gpd.GeoDataFrame(D, geometry='geometry', crs=4326)
    D['uid'] = D['iso3'] + ':' + D['shapeID'].astype(str)
    D = D[['uid', 'geometry']].to_crs(3857)
    r = f'soil/rasters/{var}_b{band}.tif'
    ex = exact_extract(r, D, ['unique', 'frac', 'count'], include_cols=['uid'], output='pandas')
    pix = 240.0 * 240.0  # overview cell area in EPSG:3857 units
    rows = []
    for (_, e), area in zip(ex.iterrows(), D.geometry.area):
        u = np.asarray(e['unique'], float); f = np.asarray(e['frac'], float)
        rec = {'uid': e['uid'], 'valid_pct': round(min(100.0, 100 * e['count'] * pix / area), 1) if area > 0 else None}
        if len(u):
            if var == 'texture_class':
                rec['mode'] = int(u[np.argmax(f)])
            else:
                vals = back(var, u)
                rec['mean'] = float((vals * f).sum() / f.sum())
                rec['p10'] = wq(vals, f, 0.10); rec['p90'] = wq(vals, f, 0.90)
        rows.append(rec)
    out = pd.DataFrame(rows); out.to_csv(f'soil/parts/{var}_b{band}.csv', index=False); return out
if __name__ == '__main__':
    o = run(sys.argv[1], int(sys.argv[2])); print(o.describe())
