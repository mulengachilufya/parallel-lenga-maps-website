"""One PDF data report per dataset per country, generated only from the published GIS file (and its about table), so every
figure in the report can be reproduced from the download. Usage: dataset_reports.py <slug|all> <ISO ...>"""
import sys, os, json, sqlite3, warnings, numpy as np, pandas as pd, geopandas as gpd, rasterio
from reportlab.platypus import Paragraph, Spacer, PageBreak
from reportlab.lib.units import mm
from multiprocessing import Pool
warnings.filterwarnings('ignore')
sys.path.insert(0, 'tools')
from countries import COUNTRIES
import report_lib
from report_lib import _save, H2, P, B, SM, fmt, txt, clean, table, choropleth, bar_chart, line_chart, build
O = 'out'; R = 'out/Dataset_Reports'
os.makedirs(R, exist_ok=True)
def about_of(gpkg):
    return dict(sqlite3.connect(gpkg).execute('select key, value from about').fetchall())
def districts(iso):
    return gpd.read_file(f'bnd/{iso}.gpkg')[['shapeID', 'shapeName', 'adm1_name', 'geometry']]
def bullets(items): return [Paragraph(clean(f'• {t}'), B) for t in items]
def top_table(df, name_col, cols, n=15, widths=None):
    rows = [[name_col[1]] + [c[1] for c in cols]] + [[txt(r[name_col[0]], n=30)] + [fmt(r[c[0]], c[2]) for c in cols] for _, r in df.head(n).iterrows()]
    w = widths or [55 * mm] + [(125 / len(cols)) * mm] * len(cols)
    return table(rows, w)
def pdf_name(slug, iso): return f'{R}/{iso}_{slug}_report.pdf'

# ---------- builders: each returns (title, gis_file, intro, sections, about, notes) ----------
def population(iso):
    f = f'{O}/Population_WorldPop/{iso}_Population_Districts_2026_WorldPop.gpkg'; a = about_of(f)
    g = gpd.read_file(f, layer='population'); n = len(g); tot = g.pop_2026.sum()
    s = g.sort_values('pop_2026', ascending=False); top5 = s.head(5)
    share5 = 100 * top5.pop_2026.sum() / tot
    dens = g.density_km2
    find = [f'The {n} districts hold an estimated {fmt(tot)} people in 2026 (WorldPop R2025A, modelled).',
            f'The five most populous districts ({", ".join(top5.shapeName)}) hold {fmt(share5, 1)} percent of the national total.',
            f'District density ranges from {fmt(dens.min(), 1)} to {fmt(dens.max(), 0)} people per km², with a median of {fmt(dens.median(), 1)}.',
            f'The national total in the source raster is {fmt(float(a.get("national_total_source_file", "nan")))}; district totals sum to {fmt(float(a.get("national_total_districts", "nan")))}. The small difference comes from cells along the national boundary that fall outside every district polygon.']
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [choropleth(g, 'density_km2', 'Population density 2026 by district', 'YlOrRd', 'people per km²', decimals=1),
            Paragraph('Most populous districts', H2), top_table(s, ('shapeName', 'District'), [('pop_2026', 'Population 2026', 0), ('density_km2', 'People per km²', 1), ('share_pct', 'Share of national %', 2)])]
    notes = ['Values are modelled estimates that distribute national population using building and settlement data. They are not census counts.',
             'Constrained modelling places people only in cells mapped as built up, so remote dispersed settlement can be under represented.']
    return 'Population by district, 2026', os.path.basename(f), 'It describes the estimated 2026 population of every district.', secs, a, notes

def rainfall(iso):
    f = f'{O}/Rainfall_CHIRPSv3/{iso}_Rainfall_Districts_CHIRPSv3.gpkg'; a = about_of(f)
    g = gpd.read_file(f, layer='rainfall_districts'); L = pd.read_sql('select * from rainfall_by_year', sqlite3.connect(f))
    nat = L.groupby('year').rain_mm.mean()
    normal = nat.loc[1991:2020].mean()
    dry = nat.idxmin(); wet = nat.idxmax(); last = int(nat.index.max())
    find = [f'Across districts, mean annual rainfall in the 1991 to 2020 normal period averaged {fmt(normal)} mm (simple mean of districts).',
            f'District normals range from {fmt(g.rain_normal_1991_2020_mm.min())} mm to {fmt(g.rain_normal_1991_2020_mm.max())} mm.',
            f'The driest year for the average district since 1981 was {dry}; the wettest was {wet}.',
            (lambda d: f'In {last}, rainfall for the average district was {fmt(abs(d), 1)} percent {"above" if d >= 0 else "below"} the 1991 to 2020 normal; {int((g[f"anomaly_{last}_pct"] < 0).sum())} of {len(g)} districts were below their own normal.')(100 * (nat.loc[last] - normal) / normal)]
    s = g.sort_values('rain_normal_1991_2020_mm', ascending=False)
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [choropleth(g, 'rain_normal_1991_2020_mm', 'Mean annual rainfall, 1991 to 2020 normal', 'Blues', 'mm per year'),
            line_chart(list(nat.index), list(nat.values), 'Annual rainfall, average of districts, 1981 to 2025', 'mm', ref=normal, ref_label='1991 to 2020 normal'),
            PageBreak(), choropleth(g, f'anomaly_{last}_pct', f'{last} rainfall relative to the normal', 'RdBu', 'percent', decimals=0),
            Paragraph('Wettest and driest districts (normal)', H2), top_table(pd.concat([s.head(8), s.tail(7)]), ('shapeName', 'District'),
            [('rain_normal_1991_2020_mm', 'Normal mm', 0), (f'anomaly_{last}_pct', f'{last} vs normal %', 1), ('trend_mm_per_decade_1981_2025', 'Trend mm per decade', 1)])]
    notes = ['CHIRPS combines satellite infrared estimates with rain gauge records. Where gauges are sparse, estimates are less certain.',
             'The trend is a descriptive linear fit over 1981 to 2025 and is not a test of statistical significance.']
    return 'Rainfall by district, 1981 to 2025', os.path.basename(f), 'It describes annual rainfall, the 1991 to 2020 normal and recent anomalies for every district.', secs, a, notes

def tree_cover_loss(iso):
    f = f'{O}/Forest_Loss/{iso}_Forest_Loss.gpkg'; a = about_of(f)
    g = gpd.read_file(f, layer='forest_loss')
    if g.tc2000_ha.isna().all():
        secs = [Paragraph('Key findings', H2), Paragraph('The source has no tree cover loss layer for this country, so the file carries empty values rather than zeros.', P)]
        return 'Tree cover loss by district, 2001 to 2025', os.path.basename(f), 'It describes tree cover in 2000 and annual loss to 2025.', secs, a, []
    yrs = [c for c in g.columns if c.startswith('loss_20') and c.endswith('_ha') and c[5:9].isdigit()]
    by = g[yrs].sum(); by.index = [int(c[5:9]) for c in yrs]
    tc = g.tc2000_ha.sum(); lt = g.loss_total_ha.sum(); peak = by.idxmax()
    find = [f'Tree cover in 2000 (canopy over 30 percent, trees taller than 5 m) covered {fmt(tc)} ha.',
            f'Between 2001 and 2025, {fmt(lt)} ha of tree cover was lost, equal to {fmt(100 * lt / tc if tc else np.nan, 1)} percent of the 2000 extent.',
            f'The year with the most loss was {peak} ({fmt(by.loc[peak])} ha). Loss since 2021 totals {fmt(g.loss_since_2021_ha.sum())} ha.',
            'The source records any stand replacing disturbance, including plantation harvest and fire, so loss is not the same as permanent deforestation.']
    s = g.sort_values('loss_total_ha', ascending=False)
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [choropleth(g, 'pct_loss_since_2000', 'Tree cover lost since 2000, share of 2000 cover', 'Greens', 'percent', decimals=1, nodata_label='No tree cover in 2000'),
            bar_chart([str(y) for y in by.index], list(by.values), 'Tree cover loss per year, all districts', 'hectares', color='#166534', horizontal=False),
            Paragraph('Districts with the most loss', H2), table([['District', 'Cover 2000 ha', 'Loss 2001 to 2025 ha', 'Loss %']] + [[txt(r.shapeName, n=30), fmt(r.tc2000_ha), fmt(r.loss_total_ha), fmt(r.pct_loss_since_2000, 1) if r.tc2000_ha else 'not applicable'] for r in s.head(15).itertuples()], [55 * mm, 42 * mm, 42 * mm, 41 * mm])]
    notes = ['Tree cover follows the source definition and includes plantations as well as natural forest.',
             'Annual detection methods changed over the period; compare individual years with care.']
    return 'Tree cover loss by district, 2001 to 2025', os.path.basename(f), 'It describes tree cover in 2000 and annual loss to 2025 for every district.', secs, a, notes

def crop_production(iso):
    f = f'{O}/Crop_Production/{iso}_Crop_Production.gpkg'; a = about_of(f)
    g = gpd.read_file(f, layer='crops'); c = sqlite3.connect(f)
    nat = pd.read_sql('select crop_name, sum(phys_ha) area, sum(harv_ha) harv, sum(prod_t) prod from crops_long group by crop_name', c)
    nat = nat[nat['prod'] > 0].sort_values('prod', ascending=False)
    top = nat.head(10); main = top.iloc[0]
    find = [f'The file models {len(nat)} crops with recorded production. By tonnage, the leading crops are {", ".join(top.crop_name.head(5))}.',
            f'{main.crop_name} leads with an estimated {fmt(main["prod"])} t on {fmt(main.area)} ha of physical area.',
            f'Total physical crop area across all crops is {fmt(g.total_phys_ha.sum())} ha.',
            'Tonnage comparisons favour heavy crops such as sugarcane, cassava and roots; compare area or value for other purposes.']
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [bar_chart(list(top.crop_name), list(top['prod']), 'Top crops by modelled production, 2020', 'tonnes', color='#4D7C0F'),
            choropleth(g, 'total_phys_ha', 'Physical crop area by district, all crops', 'YlGn', 'hectares'),
            Paragraph('National totals by crop', H2), table([['Crop', 'Physical area ha', 'Harvested area ha', 'Production t']] + [[r.crop_name, fmt(r.area), fmt(r.harv), fmt(r.prod)] for r in nat.head(20).itertuples()], [60 * mm, 40 * mm, 40 * mm, 40 * mm])]
    notes = ['Values are modelled for 2020 by allocating national and subnational statistics to cropland; they are not survey results.',
             'District totals add up to the SPAM national figures; individual district values carry more uncertainty than national totals.']
    return 'Crop area, production and yield by district, 2020', os.path.basename(f), 'It describes modelled area, production and yield of 46 crops for every district.', secs, a, notes

def soil_nutrients(iso):
    f = f'{O}/Soil_Fertility/{iso}_Soil_Fertility.gpkg'; a = about_of(f)
    g = gpd.read_file(f, layer='soil_fertility')
    w = g.area_ha
    wm = lambda c: float(np.average(g[c].dropna(), weights=w[g[c].notna()])) if g[c].notna().any() else np.nan
    acid = 100 * w[g.ph_mean < 5.5].sum() / w.sum()
    find = [f'Area weighted topsoil pH (0 to 20 cm) is {fmt(wm("ph_mean"), 1)}; ' + (f'districts covering {fmt(acid, 1)} percent of the land have a mean pH below 5.5, where acidity commonly limits yields.' if acid > 0 else 'no district has a mean pH below 5.5, the level below which acidity commonly limits yields, although individual fields can still be acidic.'),
            f'Area weighted organic carbon is {fmt(wm("soc_0_20_mean"), 1)} g/kg and total nitrogen {fmt(wm("n_total_mean"), 2)} g/kg.',
            f'Extractable phosphorus averages {fmt(wm("p_ext_mean"), 1)} mg/kg and potassium {fmt(wm("k_ext_mean"), 0)} mg/kg.']
    s = g.sort_values('ph_mean')
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [choropleth(g, 'ph_mean', 'Mean topsoil pH by district', 'RdYlGn', 'pH', decimals=1),
            choropleth(g, 'soc_0_20_mean', 'Mean topsoil organic carbon by district', 'YlOrBr', 'g/kg', decimals=1),
            Paragraph('Most acidic districts', H2), top_table(s, ('shapeName', 'District'), [('ph_mean', 'pH', 1), ('soc_0_20_mean', 'Org. carbon g/kg', 1), ('n_total_mean', 'N g/kg', 2), ('p_ext_mean', 'P mg/kg', 1), ('k_ext_mean', 'K mg/kg', 0)], n=12)]
    notes = ['Values are modelled predictions at 30 m averaged per district. Soils vary strongly within a district; sample fields before fertiliser or liming decisions.']
    return 'Soil nutrients and pH', os.path.basename(f), 'It describes modelled topsoil properties averaged for every district.', secs, a, notes

def crop_suitability(iso):
    f = f'{O}/Crop_Suitability_GAEZv5/{iso}_Crop_Suitability_Districts_GAEZv5.gpkg'; a = about_of(f)
    g = gpd.read_file(f, layer='crop_suitability_districts'); L = pd.read_sql('select * from suitability_by_crop', sqlite3.connect(f))
    g['area'] = gpd.read_file(f'bnd/{iso}.gpkg').set_index('shapeID').loc[g.shapeID].geometry.to_crs(g.estimate_utm_crs()).area.values / 1e4
    L = L.merge(g[['shapeID', 'area']], on='shapeID')
    t = L.assign(a=L.pct_area_medium_or_better / 100 * L.area).groupby(['crop', 'input_level']).a.sum(min_count=1).unstack() / g['area'].sum() * 100
    t = t.sort_values('low input, rain-fed', ascending=False)  # withheld low-input maize (null) sorts last
    best = t.index[0]
    find = [f'Under low input rain fed farming, the crops with the largest share of land rated medium suitability or better are {", ".join(t.index[:5])}.',
            f'{best} reaches medium or better on {fmt(t.iloc[0]["low input, rain-fed"], 1)} percent of the country at low input and {fmt(t.iloc[0]["high input, rain-fed"], 1)} percent at high input.',
            'High input management (improved varieties, fertiliser, mechanisation) raises suitability for most crops; the table shows both levels.']
    code = {r.crop: r.crop_code for r in L[['crop', 'crop_code']].drop_duplicates().itertuples()}
    # Low-input maize is withheld (FAO layer incomplete), so the maize map shows high input.
    mz = 'mze_pct_suitable_high'
    g = g.merge(L[(L.crop_code == 'MZE') & (L.input_level == 'high input, rain-fed')][['shapeID', 'pct_area_medium_or_better']]
                .rename(columns={'pct_area_medium_or_better': mz}), on='shapeID', how='left')
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [choropleth(g, f'{code[best].lower()}_pct_suitable', f'{best}: share of district rated medium or better, low input', 'Greens', 'percent of district', decimals=0),
            choropleth(g, mz, 'Maize: share of district rated medium or better, high input', 'YlGn', 'percent of district', decimals=0),
            Paragraph('Share of national area rated medium or better', H2), table([['Crop', 'Low input %', 'High input %']] + [[c, 'withheld' if pd.isna(r['low input, rain-fed']) else fmt(r['low input, rain-fed'], 1), fmt(r['high input, rain-fed'], 1)] for c, r in t.iterrows()], [70 * mm, 40 * mm, 40 * mm])]
    notes = ['Suitability describes climate, soil and terrain potential under the stated management for 2001 to 2020 climate. It is not current land use or a yield forecast.',
             'Rain fed only. Irrigation, markets, tenure and protected areas are not considered.',
             'Low input maize is withheld: the FAO GAEZ v5 layer has no value for about half of the land, which made district shares meaningless. High input maize is complete and is shown.']
    return 'Crop suitability by district, 29 crops', os.path.basename(f), 'It describes agro ecological suitability of 29 crops for every district.', secs, a, notes

def built_up(iso):
    f = f'{O}/Built_Up_GHSL/{iso}_Built_Up_Districts_GHSL.gpkg'; a = about_of(f)
    g = gpd.read_file(f, layer='built_up_districts')
    yrs = [1975, 1990, 2000, 2010, 2020]; tot = [g[f'built_km2_{y}'].sum() for y in yrs]
    s = g.assign(add=g.built_km2_2020 - g.built_km2_2000).sort_values('add', ascending=False)
    find = [f'Built up surface grew from {fmt(tot[0], 1)} km² in 1975 to {fmt(tot[2], 1)} km² in 2000 and {fmt(tot[4], 1)} km² in 2020.',
            f'Between 2000 and 2020 it increased by {fmt(100 * (tot[4] - tot[2]) / tot[2] if tot[2] else np.nan, 1)} percent.',
            f'The largest absolute increases from 2000 to 2020 were in {", ".join(s.shapeName.head(5))}.',
            f'The source projects {fmt(g.built_km2_2025.sum(), 1)} km² for 2025; this is a model projection, not an observation.']
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [line_chart(yrs, tot, 'Built up surface, all districts, observed epochs', 'km²'),
            choropleth(g, 'growth_2000_2020_pct', 'Growth of built up surface, 2000 to 2020', 'OrRd', 'percent', decimals=0),
            Paragraph('Districts with the largest growth, 2000 to 2020', H2), top_table(s, ('shapeName', 'District'), [('built_km2_2000', 'km² 2000', 2), ('built_km2_2020', 'km² 2020', 2), ('add', 'Added km²', 2), ('growth_2000_2020_pct', 'Growth %', 0)])]
    notes = ['Built up surface measures roofed area detected from Sentinel 2 and Landsat imagery at about 1 km aggregation. Small or sparse settlements can be missed.']
    return 'Built up area growth by district, 1975 to 2025', os.path.basename(f), 'It describes how much land is built up in every district over time.', secs, a, notes

def roads(iso):
    f = f'{O}/Road_Surface/{iso}_Road_Surface_FRST.gpkg'
    if not os.path.exists(f): return None
    a = about_of(f); g = gpd.read_file(f, layer='district_summary')
    pk, uk = g.paved_km.sum(), g.unpaved_km.sum()
    s = g.sort_values('paved_pct')
    find = [f'The file maps {fmt(pk + uk)} km of road: {fmt(pk)} km paved and {fmt(uk)} km unpaved, so {fmt(100 * pk / (pk + uk), 1)} percent of mapped length is paved.',
            f'Road density ranges from {fmt(g.road_density_km_per_km2.min(), 3)} to {fmt(g.road_density_km_per_km2.max(), 2)} km per km².',
            f'{int((g.paved_pct < 10).sum())} of {len(g)} districts have less than 10 percent of their mapped road length paved.']
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [choropleth(g, 'paved_pct', 'Share of mapped road length that is paved', 'Oranges', 'percent', decimals=0),
            choropleth(g, 'road_density_km_per_km2', 'Mapped road density', 'Greys', 'km per km²', decimals=2),
            Paragraph('Districts with the lowest paved share', H2), top_table(s, ('shapeName', 'District'), [('paved_km', 'Paved km', 0), ('unpaved_km', 'Unpaved km', 0), ('paved_pct', 'Paved %', 1)])]
    notes = ['Surface type is predicted by the source model with reported accuracy of 77 to 96 percent depending on country; check critical routes on the ground.',
             'Road coverage follows OpenStreetMap, which is more complete in towns than in remote areas.']
    return 'Road surface type by district', os.path.basename(f), 'It describes mapped roads by surface type for every district.', secs, a, notes

def solar_wind(iso):
    f = f'{O}/Energy_Screening/{iso}_Solar_Wind_Screening.gpkg'; a = about_of(f)
    g = gpd.read_file(f, layer='solar_wind_screening')
    sp = g.sort_values('pvout_mean', ascending=False); sw = g.sort_values('wind_ms_mean', ascending=False)
    find = [f'District mean photovoltaic potential ranges from {fmt(g.pvout_mean.min(), 2)} to {fmt(g.pvout_mean.max(), 2)} kWh per kWp per day, about {fmt(g.pvout_mean.min() * 365)} to {fmt(g.pvout_mean.max() * 365)} kWh per kWp per year.',
            f'The highest solar potential is in {", ".join(sp.shapeName.head(3))}.',
            f'District mean wind speed at 100 m ranges from {fmt(g.wind_ms_mean.min(), 1)} to {fmt(g.wind_ms_mean.max(), 1)} m/s; the windiest districts are {", ".join(sw.shapeName.head(3))}.']
    if g.grid_10km_pct.notna().any():
        find.append(f'{int((g.grid_10km_pct >= 50).sum())} of {len(g)} districts have at least half their area within 10 km of a transmission line mapped by USGS (2018 reference).')
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [choropleth(g, 'pvout_mean', 'Photovoltaic power potential, district mean', 'YlOrBr', 'kWh per kWp per day', decimals=2),
            choropleth(g, 'wind_ms_mean', 'Mean wind speed at 100 m, district mean', 'PuBu', 'm/s', decimals=1),
            Paragraph('Top districts for solar potential', H2), top_table(sp, ('shapeName', 'District'), [('pvout_mean', 'PV kWh/kWp/day', 2), ('wind_ms_mean', 'Wind m/s', 1), ('grid_10km_pct', 'Within 10 km of grid %', 0), ('pop_2026', 'Population', 0)])]
    notes = ['Long term averages for screening and comparison of districts. They do not replace site measurement, yield assessment or grid studies.',
             'Transmission lines come from a 2018 reference compilation and can be incomplete; a low grid share is not proof that no line exists.']
    return 'Solar and wind resource by district', os.path.basename(f), 'It describes solar and wind potential, population and grid proximity for every district.', secs, a, notes

def power_plants(iso):
    f = f'{O}/Power_Plants/{iso}_Power_Plants_OSM.gpkg'
    if not os.path.exists(f): return None
    a = about_of(f); p = gpd.read_file(f, layer='power_plants'); s = pd.read_sql('select * from summary_by_source order by plants desc', sqlite3.connect(f))
    d = districts(iso)
    import matplotlib.pyplot as plt, io
    from reportlab.platypus import Image
    fig, ax = plt.subplots(figsize=(7.6, 5.3)); ax.set_axis_off(); ax.set_title('Mapped power plants by energy source', fontsize=10, loc='left', color='#0D2B45')
    d.plot(ax=ax, color='#f1f5f9', edgecolor='#cbd5e1', linewidth=0.3); d.dissolve().boundary.plot(ax=ax, color='#0f172a', linewidth=0.8)
    pal = {'solar': '#F59E0B', 'hydro': '#2563EB', 'gas': '#7C3AED', 'oil': '#78350F', 'diesel': '#92400E', 'coal': '#111827', 'wind': '#10B981', 'geothermal': '#DC2626', 'biomass': '#65A30D'}
    p['src'] = p.energy_source.fillna('unknown').str.split(';').str[0]
    for k, grp in p.groupby('src'):
        sz = np.clip(np.sqrt(grp.capacity_mw.fillna(1).values) * 4, 8, 120)
        gpd.GeoDataFrame(geometry=grp.geometry.representative_point().values, crs=grp.crs).plot(ax=ax, color=pal.get(k, '#64748B'), markersize=sz, alpha=0.85, label=f'{k} ({len(grp)})', edgecolor='white', linewidth=0.3)
    ax.legend(fontsize=7, loc='center left', bbox_to_anchor=(1.0, 0.5), frameon=False, title='Source (plants)', title_fontsize=7.5)
    from report_lib import _scalebar; _scalebar(ax, d)
    b = _save(fig, 170)
    top = p.dropna(subset=['capacity_mw']).sort_values('capacity_mw', ascending=False).head(15)
    find = [f'OpenStreetMap records {len(p)} power plants in the country, {int(p.capacity_mw.notna().sum())} of them with a tagged capacity.',
            f'By count, the most common source is {txt(s.iloc[0].energy_source)} ({int(s.iloc[0].plants)} plants).',
            f'Tagged capacities sum to {fmt(p.capacity_mw.sum(), 0)} MW. This is a sum of mapped tags, not official installed capacity: some plants have no tag and some tags describe planned or older figures.']
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [Image(b, width=172 * mm, height=120 * mm), Paragraph('Circle size reflects tagged capacity where available.', SM),
            Paragraph('Plants by energy source', H2), table([['Source', 'Plants', 'With capacity', 'Tagged MW']] + [[txt(r.energy_source), fmt(r.plants), fmt(r.with_capacity), fmt(r.capacity_mw_known, 1)] for r in s.itertuples()], [60 * mm, 30 * mm, 35 * mm, 35 * mm]),
            Paragraph('Largest mapped plants', H2), table([['Plant', 'Source', 'MW', 'Operator', 'Start']] + [[txt(r.name, 'Unnamed', 34), txt(r.energy_source, n=14), fmt(r.capacity_mw, 1), txt(r.operator, n=26), txt(r.start_date, '', 10)] for r in top.itertuples()], [55 * mm, 25 * mm, 18 * mm, 55 * mm, 20 * mm])]
    notes = ['Community mapped data that changes continuously. Coverage and attributes vary; confirm plant status and capacity with the utility or regulator.']
    return 'Power plants', os.path.basename(f), 'It describes power plants mapped in OpenStreetMap with their source, capacity and operator.', secs, a, notes

def _mineral_map(iso, f, layers):
    import matplotlib.pyplot as plt, io
    from reportlab.platypus import Image
    from report_lib import _scalebar
    d = districts(iso)
    fig, ax = plt.subplots(figsize=(7.6, 5.3)); ax.set_axis_off(); ax.set_title('Mineral facilities, deposits and railways', fontsize=10, loc='left', color='#0D2B45')
    d.plot(ax=ax, color='#f8fafc', edgecolor='#cbd5e1', linewidth=0.3); d.dissolve().boundary.plot(ax=ax, color='#0f172a', linewidth=0.8)
    if 'railways' in layers:
        r = gpd.read_file(f, layer='railways')
        if len(r): r.plot(ax=ax, color='#475569', linewidth=0.7, label=f'Railways')
    style = [('mineral_deposits', 'Deposits', '#A16207', 'D', 10), ('mineral_exploration', 'Exploration sites', '#0E7490', '^', 12), ('mineral_facilities', 'Production facilities', '#B91C1C', 'o', 14)]
    for lyr, lab, col, mk, sz in style:
        if lyr in layers:
            p = gpd.read_file(f, layer=lyr)
            if len(p): p.plot(ax=ax, color=col, marker=mk, markersize=sz, alpha=0.85, edgecolor='white', linewidth=0.3, label=f'{lab} ({len(p)})')
    ax.legend(fontsize=7, loc='center left', bbox_to_anchor=(1.0, 0.5), frameon=False)
    x0, y0, x1, y1 = d.total_bounds; ax.set_xlim(x0, x1); ax.set_ylim(y0, y1)
    _scalebar(ax, d)
    b = _save(fig, 170)
    return Image(b, width=172 * mm, height=120 * mm)

def mining_geology(iso):
    f = f'{O}/Mineral_Industries/{iso}_Mineral_Industries_USGS.gpkg'; gf = f'{O}/Geology/{iso}_Geology_USGS.gpkg'
    a = about_of(f); c = json.loads(a.get('feature_counts', '{}'))
    NAMES = {'mineral_facilities': 'production facilities', 'mineral_deposits': 'mineral deposits', 'mineral_exploration': 'exploration sites',
             'power_stations': 'power stations', 'power_transmission': 'transmission line segments', 'oil_gas_pipelines': 'oil and gas pipeline segments',
             'ports': 'ports', 'railways': 'railway segments'}
    parts = [f'{fmt(v)} {NAMES.get(k, k.replace("_", " "))}' for k, v in c.items()]
    find = [f'The USGS compilation (2018 reference year) records ' + (', '.join(parts[:-1]) + ' and ' + parts[-1] if len(parts) > 1 else ''.join(parts)) + '.']
    secs = [Paragraph('Key findings', H2)]; t = pd.Series(dtype=int)
    import pyogrio
    layers = [l[0] for l in pyogrio.list_layers(f)]
    if 'mineral_facilities' in layers:
        m = gpd.read_file(f, layer='mineral_facilities')
        com = m.get('DsgAttr02', m.get('Commodity', pd.Series(dtype=str))).fillna('')
        t = m.assign(c=com).groupby('c').size().sort_values(ascending=False)
        t = t[t.index != '']
        if len(t): find.append(f'The most frequent commodities among production facilities are {", ".join(t.index[:5])}.')
        rows = [['Facility', 'Type', 'Commodity', 'Status']] + [[txt(r.FeatureNam, n=36), txt(getattr(r, 'FeatureTyp', None), n=28), txt(getattr(r, 'DsgAttr02', None), n=22), txt(getattr(r, 'LocOpStat', None), n=14)] for r in m.head(25).itertuples()]
    if os.path.exists(gf):
        geo = gpd.read_file(gf, layer='geology')
        ga = geo.groupby('unit').area_km2.sum().sort_values(ascending=False)
        find.append(f'The largest surface geology units are {", ".join(ga.index[:3])}, covering {fmt(100 * ga.iloc[:3].sum() / ga.sum(), 1)} percent of the country at 1:5,000,000 scale.')
    secs += bullets(find)
    secs += [_mineral_map(iso, f, layers), Paragraph('Locations as published by USGS; some sites are placed at the nearest town or district centre (see the LocConfid field).', SM)]
    if 'mineral_facilities' in layers and len(t):
        secs += [Paragraph('Production facilities by commodity', H2), table([['Commodity', 'Facilities']] + [[c, fmt(n)] for c, n in t.head(15).items()], [90 * mm, 40 * mm])]
    if os.path.exists(gf):
        secs += [Paragraph('Surface geology by area', H2), table([['Unit', 'Area km²', 'Share %']] + [[u, fmt(v), fmt(100 * v / ga.sum(), 1)] for u, v in ga.head(15).items()], [90 * mm, 40 * mm, 30 * mm])]
    if 'mineral_facilities' in layers:
        secs += [Paragraph('Mineral facilities (first 25 in the file)', H2), table(rows, [60 * mm, 45 * mm, 40 * mm, 30 * mm])]
    notes = ['The mineral industries compilation describes conditions in its 2018 reference year; operating status can have changed.',
             'Geology is a continental compilation at about 1:5,000,000 and is suitable for regional screening, not site geology.']
    return 'Mines, minerals and geology', os.path.basename(f), 'It describes mineral facilities, deposits, infrastructure and surface geology.', secs, a, notes

def soil_classes(iso):
    f = f'{O}/Soil_Classification/{iso}_Soil_Classification_WRB.tif'; lg = f.replace('.tif', '_legend.csv')
    with rasterio.open(f) as r: t = r.tags()
    a = {'source': t.get('SOURCE'), 'citation': t.get('CITATION'), 'licence': t.get('LICENCE'), 'method': t.get('METHOD')}
    L = pd.read_csv(lg).sort_values('area_km2', ascending=False)
    find = [f'The most widespread Reference Soil Groups are {", ".join(L.wrb_group.head(3))}, together covering {fmt(L.share_pct.head(3).sum(), 1)} percent of the country.',
            f'{len(L)} soil groups are present in the file.']
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [bar_chart(list(L.wrb_group.head(12)), list(L.area_km2.head(12)), 'Area by WRB Reference Soil Group', 'km²', color='#92400E'),
            Paragraph('All soil groups', H2), table([['Soil group', 'Area km²', 'Share %']] + [[r.wrb_group, fmt(r.area_km2), fmt(r.share_pct, 2)] for r in L.itertuples()], [80 * mm, 40 * mm, 30 * mm])]
    notes = ['Each 250 m cell shows the most probable soil group predicted by SoilGrids; the probability of the second most likely group can be close.']
    return 'Soil classification (WRB Reference Soil Groups)', os.path.basename(f), 'It describes which soil groups occur and how much area each covers.', secs, a, notes

def temperature(iso):
    f = f'{O}/Temperature_CHELSA/{iso}_Temperature_CHELSA_1981-2010.tif'
    with rasterio.open(f) as r:
        t = r.tags(); arr = r.read(masked=True)
    a = {'source': t.get('SOURCE'), 'citation': t.get('CITATION'), 'licence': t.get('LICENCE'), 'method': t.get('METHOD')}
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    mm_ = [float(arr[i + 1].mean()) for i in range(12)]
    from exactextract import exact_extract
    d = districts(iso)
    d['tas_annual'] = exact_extract(f, d, 'mean', output='pandas').iloc[:, 0].values
    find = [f'Mean annual temperature for 1981 to 2010 averages {fmt(float(arr[0].mean()), 1)} °C across the country, ranging from {fmt(float(arr[0].min()), 1)} °C to {fmt(float(arr[0].max()), 1)} °C at 1 km.',
            f'The warmest month on average is {months[int(np.argmax(mm_))]} ({fmt(max(mm_), 1)} °C) and the coolest is {months[int(np.argmin(mm_))]} ({fmt(min(mm_), 1)} °C).']
    s = d.sort_values('tas_annual')
    secs = [Paragraph('Key findings', H2)] + bullets(find) + [choropleth(d, 'tas_annual', 'Mean annual temperature 1981 to 2010, district mean', 'coolwarm', '°C', decimals=1),
            bar_chart(months, mm_, 'Mean monthly temperature, national average', '°C', color='#9F1239', horizontal=False, height_mm=55),
            Paragraph('Coolest and warmest districts', H2), top_table(pd.concat([s.head(7), s.tail(7)]), ('shapeName', 'District'), [('tas_annual', 'Mean annual °C', 1)])]
    notes = ['A 1981 to 2010 climatology; recent decades are warmer in most of Africa.']
    return 'Temperature, 1981 to 2010 climatology', os.path.basename(f), 'It describes annual and monthly mean temperature.', secs, a, notes

BUILDERS = {'population': population, 'rainfall': rainfall, 'tree-cover-loss': tree_cover_loss, 'crop-production': crop_production,
            'soil-nutrients': soil_nutrients, 'crop-suitability': crop_suitability, 'built-up': built_up, 'roads': roads,
            'solar-wind': solar_wind, 'power-plants': power_plants, 'mining-geology': mining_geology, 'soil': soil_classes, 'temperature': temperature}
CREDITS = {'population': 'WorldPop R2025A, University of Southampton (CC BY 4.0)', 'rainfall': 'CHIRPS v3.0, Climate Hazards Center, UC Santa Barbara (public domain)',
           'temperature': 'CHELSA v2.1 climatologies, Karger et al., WSL (CC BY 4.0)', 'tree-cover-loss': 'Hansen, UMD, Google, Global Forest Change v1.13 (CC BY 4.0)',
           'crop-production': 'IFPRI MapSPAM 2020 v2r2 (CC BY 4.0)', 'crop-suitability': 'FAO and IIASA GAEZ v5 (CC BY 4.0)',
           'soil-nutrients': 'iSDAsoil, Hengl et al. 2021 (CC BY 4.0)', 'soil': 'ISRIC SoilGrids 2.0 (CC BY 4.0)',
           'built-up': 'European Commission JRC, GHSL R2023A (CC BY 4.0)', 'roads': 'FRST 2026 (CC BY 4.0), OpenStreetMap contributors (ODbL)',
           'solar-wind': 'Global Solar Atlas (Solargis, World Bank ESMAP), Global Wind Atlas 4.0 (DTU), WorldPop (CC BY 4.0); USGS grid lines (public domain)',
           'power-plants': 'OpenStreetMap contributors via Overture Maps (ODbL)', 'mining-geology': 'U.S. Geological Survey (public domain)'}
def run(job):
    slug, iso = job
    report_lib.CTX['credit'] = CREDITS[slug] + '; boundaries geoBoundaries'
    try:
        r = BUILDERS[slug](iso)
        if r is None: return slug, iso, 'no source file'
        title, gis, intro, secs, about, notes = r
        build(pdf_name(slug, iso), title, COUNTRIES[iso], gis, intro, secs, about, notes)
        return slug, iso, round(os.path.getsize(pdf_name(slug, iso)) / 1e6, 2)
    except FileNotFoundError as e:
        return slug, iso, f'missing: {e}'
    except Exception as e:
        return slug, iso, f'ERROR {type(e).__name__}: {e}'
if __name__ == '__main__':
    slugs = list(BUILDERS) if sys.argv[1] == 'all' else sys.argv[1].split(',')
    isos = sys.argv[2:]
    with Pool(4) as p:
        for r in p.imap_unordered(run, [(s, i) for s in slugs for i in isos]): print(*r, flush=True)
