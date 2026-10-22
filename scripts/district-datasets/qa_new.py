"""QA for geology, mineral industries, solar, wind, WorldPop, WRB and CHELSA outputs: country coverage, embedded
attribute tables registered in gpkg_contents, every column described, rasters tagged with source/licence and
holding data inside the country."""
import sys, glob, json, sqlite3, rasterio, numpy as np
sys.path.insert(0, 'tools'); from countries import COUNTRIES
SETS = {'Geology': ('*_Geology_USGS.gpkg', {'CPV'}), 'Mineral_Industries': ('*_Mineral_Industries_USGS.gpkg', set()),
        'Solar_Potential': ('*_GHI_GlobalSolarAtlas.tif', set()), 'Wind_Potential': ('*_WindSpeed100m_GlobalWindAtlas.tif', set()),
        'Population_WorldPop': ('*_Population_Districts_2026_WorldPop.gpkg', set()), 'Soil_Classification': ('*_WRB.tif', set()),
        'Temperature_CHELSA': ('*_CHELSA_1981-2010.tif', set())}
problems = []
for d, (pat, allowed_missing) in SETS.items():
    have = {p.split('/')[-1][:3] for p in glob.glob(f'out/{d}/{pat}')}
    miss = set(COUNTRIES) - have - allowed_missing
    if miss: problems.append(f'{d}: missing {sorted(miss)}')
    for p in sorted(glob.glob(f'out/{d}/*.gpkg')):
        con = sqlite3.connect(p)
        reg = {r[0] for r in con.execute("select table_name from gpkg_contents where data_type='attributes'")}
        if not {'about', 'columns'} <= reg: problems.append(f'{p}: about/columns not registered')
        about = dict(con.execute('select key, value from about'))
        for k in ('title', 'source', 'citation', 'licence', 'method'):
            if not about.get(k): problems.append(f'{p}: about.{k} empty')
        nodesc = [r[0] for r in con.execute("select name from columns where description is null or description = ''")]
        if nodesc: problems.append(f'{p}: {len(nodesc)} columns without description e.g. {nodesc[:4]}')
        feats = [r[0] for r in con.execute("select table_name from gpkg_contents where data_type='features'")]
        n = sum(con.execute(f'select count(*) from "{t}"').fetchone()[0] for t in feats)
        if not n: problems.append(f'{p}: no features')
    for p in sorted(x for x in glob.glob(f'out/{d}/*.tif') if not x.endswith('.part.tif')):
        with rasterio.open(p) as r:
            t = r.tags()
            for k in ('SOURCE', 'LICENCE', 'CITATION'):
                if not t.get(k): problems.append(f'{p}: tag {k} missing')
            a = r.read(1, masked=True)
            if a.count() == 0: problems.append(f'{p}: all NoData')
print('\n'.join(problems) or 'no problems'); print(len(problems), 'problems')
