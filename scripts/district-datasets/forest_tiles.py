"""Hansen GFC v1.13: per-district tree cover 2000 (>=30%) and annual loss 2001-2025, in ha.
Per tile: classify each 30 m pixel (0 = <30% cover in 2000, 1 = forest no loss, 1+y = loss in 2000+y),
sum true pixel areas (sphere, by latitude row) inside each district (pixel-centre rule).
Writes forest/parts/<tile>.json {district_uid: [27 class areas in m2]}. Resumable, parallel."""
import os, sys, json, glob, math, urllib.request, urllib.error, shutil
import numpy as np, geopandas as gpd, pandas as pd, rasterio
from rasterio.windows import from_bounds, Window
from rasterio.features import geometry_mask
from shapely.geometry import box
from multiprocessing import Pool
H = 'https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/Hansen_GFC-2025-v1.13_{v}_{t}.tif'
R = 6371007.2
NC = 27
def tile_name(top, left):
    return f"{abs(top):02d}{'N' if top >= 0 else 'S'}_{abs(left):03d}{'E' if left >= 0 else 'W'}"
def load_districts():
    parts = [gpd.read_file(f) for f in sorted(glob.glob('bnd/*.gpkg'))]
    g = pd.concat(parts, ignore_index=True)
    g['uid'] = g['iso3'] + ':' + g['shapeID'].astype(str)
    return gpd.GeoDataFrame(g, geometry='geometry', crs=4326)
D = None
def fetch(url, path):
    if os.path.exists(path): return
    tmp = path + '.part'
    with urllib.request.urlopen(url, timeout=600) as r, open(tmp, 'wb') as f: shutil.copyfileobj(r, f, 1 << 22)
    os.replace(tmp, path)
def do_tile(args):
    for attempt in range(3):
        try:
            return _do_tile(args)
        except Exception as e:
            err = f'{type(e).__name__}: {e}'
    return tile_name(*args), 'ERROR ' + err
def _do_tile(args):
    top, left = args
    t = tile_name(top, left); out = f'forest/parts/{t}.json'
    if os.path.exists(out): return t, 'cached'
    tb = box(left, top - 10, left + 10, top)
    sub = D[D.intersects(tb)]
    if sub.empty:
        json.dump({}, open(out, 'w')); return t, 'empty'
    tc_p, ly_p = f'forest/tiles/{t}_tc.tif', f'forest/tiles/{t}_ly.tif'
    fetch(H.format(v='treecover2000', t=t), tc_p)
    try:
        fetch(H.format(v='lossyear', t=t), ly_p); has_loss = True
    except urllib.error.HTTPError as e:
        if e.code != 404: raise
        has_loss = False  # Hansen publishes no loss layer for this tile: loss is unknown, not zero
    res = {}
    import contextlib
    with rasterio.open(tc_p) as tc, (rasterio.open(ly_p) if has_loss else contextlib.nullcontext()) as ly:
        T = tc.transform; dlat = -T.e; dlon = T.a
        for _, d in sub.iterrows():
            geom = d.geometry.intersection(tb)
            if geom.is_empty or geom.area == 0: continue
            w = from_bounds(*geom.bounds, transform=T).round_offsets(op='floor').round_lengths(op='ceil')
            if w.width <= 0 or w.height <= 0: continue
            try: w = w.intersection(Window(0, 0, tc.width, tc.height))
            except Exception: continue
            acc = np.zeros(NC)
            step = 4000
            for r0 in range(0, int(w.height), step):
                sw = Window(w.col_off, w.row_off + r0, w.width, min(step, w.height - r0))
                st = tc.window_transform(sw)
                m = geometry_mask([geom], out_shape=(int(sw.height), int(sw.width)), transform=st, invert=True)
                if not m.any(): continue
                a = tc.read(1, window=sw); b = ly.read(1, window=sw) if has_loss else np.zeros_like(a)
                code = np.where(a >= 30, 1 + b.astype(np.int16), 0).astype(np.int16)
                lat_top = st.f - np.arange(int(sw.height)) * dlat
                rowarea = R * R * math.radians(dlon) * np.abs(np.sin(np.radians(lat_top)) - np.sin(np.radians(lat_top - dlat)))
                wts = np.broadcast_to(rowarea[:, None], code.shape)[m]
                acc += np.bincount(code[m].ravel(), weights=wts, minlength=NC)[:NC]
            res[d.uid] = acc.round(1).tolist()
    if not has_loss: res['_no_loss_layer'] = True
    json.dump(res, open(out, 'w'))
    os.remove(tc_p)
    if has_loss: os.remove(ly_p)
    return t, f'{len(res)} districts'
def init():
    global D
    D = load_districts()
if __name__ == '__main__':
    tops = [40, 30, 20, 10, 0, -10, -20, -30]
    lefts = [-30, -20, -10, 0, 10, 20, 30, 40, 50]
    jobs = [(a, b) for a in tops for b in lefts]
    with Pool(int(sys.argv[1]) if len(sys.argv) > 1 else 3, initializer=init) as p:
        for t, msg in p.imap_unordered(do_tile, jobs):
            print(t, msg, flush=True)
