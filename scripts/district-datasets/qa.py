"""QA for built GeoPackages: opens with GDAL, CRS, geometry validity, empties, negatives, ranges,
metadata tables, district counts vs boundaries. Prints PASS/FAIL per country and a verdict."""
import sys, glob, json, sqlite3, numpy as np, geopandas as gpd, pyogrio
folder = sys.argv[1]
RANGES = {'ph_mean': (3, 10), 'ph_p10': (3, 10), 'ph_p90': (3, 10), 'soc_0_20_mean': (0, 300), 'soc_20_50_mean': (0, 300),
          'clay_mean': (0, 100), 'sand_mean': (0, 100), 'silt_mean': (0, 100), 'bulk_density_mean': (0.3, 2.2),
          'pct_loss_since_2000': (0, 100.01)}
fails, warns = [], []
if folder == 'Forest_Loss':
    import os
    tiles = [f"{abs(t):02d}{'N' if t >= 0 else 'S'}_{abs(l):03d}{'E' if l >= 0 else 'W'}" for t in [40,30,20,10,0,-10,-20,-30] for l in [-30,-20,-10,0,10,20,30,40,50]]
    missing = [t for t in tiles if not os.path.exists(f'forest/parts/{t}.json')]
    if missing: fails.append(f'missing forest tiles: {missing}')
for f in sorted(glob.glob(f'out/{folder}/*.gpkg')):
    iso = f.split('/')[-1][:3]
    layers = [l[0] for l in pyogrio.list_layers(f)]
    g = gpd.read_file(f, layer=layers[0])
    n_b = len(gpd.read_file(f'bnd/{iso}.gpkg'))
    con = sqlite3.connect(f)
    about = dict(con.execute('select key, value from about').fetchall()); ncols = con.execute('select count(*) from columns').fetchone()[0]
    p = []
    if g.crs is None or g.crs.to_epsg() != 4326: p.append('crs')
    if len(g) != n_b: p.append(f'districts {len(g)} != {n_b}')
    if (~g.geometry.is_valid).any(): p.append(f'{(~g.geometry.is_valid).sum()} invalid geoms')
    if g.geometry.is_empty.any(): p.append('empty geoms')
    num = g.select_dtypes('number')
    if (num < 0).any().any(): p.append('negative values: ' + ','.join(num.columns[(num < 0).any()]))
    for c, (lo, hi) in RANGES.items():
        if c in g and ((g[c] < lo) | (g[c] > hi)).any(): p.append(f'{c} out of range')
    for k in ('source', 'citation', 'licence', 'processed'):
        if not about.get(k): p.append(f'about.{k} missing')
    if ncols < len(g.columns) - 1: p.append('columns table incomplete')
    if 'loss_total_ha' in g:
        s = g[[c for c in g if c.startswith('loss_20')]].sum(axis=1)
        if not np.allclose(s, g['loss_total_ha'], atol=1): p.append('loss years != total')
        if (g['loss_total_ha'] > g['tc2000_ha'] + 1).any(): p.append('loss > tc2000')
    if 'ph_mean' in g and g['ph_mean'].isna().all() and iso not in ('CPV', 'MUS', 'SYC'): p.append('no soil values')
    if 'ph_mean' in g and g['ph_mean'].isna().any() and not g['ph_mean'].isna().all(): warns.append(f'{iso}: {g["ph_mean"].isna().sum()} districts without soil data')
    (fails if p else []).append(f'{iso}: ' + '; '.join(p)) if p else None
print(f'{folder}: {len(glob.glob(f"out/{folder}/*.gpkg"))} files')
print('FAILS:', fails or 'none'); print('WARNINGS:', warns or 'none')
print('VERDICT:', 'FAIL' if fails else ('PASS-WITH-WARNINGS' if warns else 'PASS'))
