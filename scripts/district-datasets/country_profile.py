"""Country Data Profile PDFs: a ready-made, non-GIS summary per country built only from the published Lenga Maps
district datasets (WorldPop 2026, CHIRPS v3, Global Solar/Wind Atlas screening, Hansen GFC v1.13, MapSPAM 2020,
iSDAsoil, FRST roads, OpenStreetMap power plants). Every number is traceable to a file in the GIS catalogue."""
import sys, os, io, sqlite3, datetime, warnings, numpy as np, pandas as pd, geopandas as gpd
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
from multiprocessing import Pool
warnings.filterwarnings('ignore')
sys.path.insert(0, 'tools')
from countries import COUNTRIES
NAVY = colors.HexColor('#0D2B45'); GOLD = colors.HexColor('#F5B800'); GREY = colors.HexColor('#5F6B76')
SS = getSampleStyleSheet()
H1 = ParagraphStyle('h1', parent=SS['Title'], textColor=NAVY, fontSize=22, leading=26, alignment=0, spaceAfter=2)
H2 = ParagraphStyle('h2', parent=SS['Heading2'], textColor=NAVY, fontSize=13, spaceBefore=10, spaceAfter=4)
P = ParagraphStyle('p', parent=SS['BodyText'], fontSize=9, leading=12)
SM = ParagraphStyle('sm', parent=P, fontSize=7.5, leading=10, textColor=GREY)
def fmt(x, d=0):
    if x is None or (isinstance(x, float) and not np.isfinite(x)): return '–'
    return f'{x:,.{d}f}'
def txt(v, default='–', n=40):
    return default if v is None or (isinstance(v, float) and not np.isfinite(v)) or str(v).strip() in ('', 'nan', 'None') else str(v)[:n]
def read(path, layer=None, geom=False):
    if not os.path.exists(path): return None
    return gpd.read_file(path, layer=layer) if geom else gpd.read_file(path, layer=layer, ignore_geometry=True)
def tbl(rows, widths, head=True, zebra=True, size=8):
    t = Table(rows, colWidths=widths, repeatRows=1 if head else 0)
    st = [('FONT', (0, 0), (-1, -1), 'Helvetica', size), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
          ('LINEBELOW', (0, 0), (-1, 0), 0.6, NAVY), ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]
    if head: st += [('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', size), ('TEXTCOLOR', (0, 0), (-1, 0), NAVY)]
    if zebra: st += [('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F3F5F7')])]
    for i in range(1, len(rows[0])): st.append(('ALIGN', (i, 0), (i, -1), 'RIGHT'))
    t.setStyle(TableStyle(st)); return t
def maps(g, panels):
    fig, axs = plt.subplots(2, 2, figsize=(8.2, 6.6))
    for ax, (col, title, cmap, unit) in zip(axs.flat, panels):
        ax.set_axis_off(); ax.set_title(title, fontsize=9, color='#0D2B45', loc='left')
        if col not in g or g[col].notna().sum() == 0:
            ax.text(0.5, 0.5, 'No data', ha='center', va='center', transform=ax.transAxes, color='grey'); continue
        v = g[col].astype(float); lo, hi = np.nanpercentile(v, 2), np.nanpercentile(v, 98)
        g.plot(column=col, ax=ax, cmap=cmap, vmin=lo, vmax=hi, linewidth=0.15, edgecolor='white', legend=True,
               missing_kwds={'color': '#e5e7eb'}, legend_kwds={'shrink': 0.6, 'label': unit})
        ax.figure.axes[-1].tick_params(labelsize=7)
    fig.tight_layout(); b = io.BytesIO(); fig.savefig(b, format='png', dpi=150); plt.close(fig); b.seek(0)
    return Image(b, width=172 * mm, height=138 * mm)
def one(iso):
    name = COUNTRIES[iso]; O = 'out'
    d = read(f'bnd/{iso}.gpkg', geom=True)[['shapeID', 'shapeName', 'adm1_name', 'geometry']]
    pop = read(f'{O}/Population_WorldPop/{iso}_Population_Districts_2026_WorldPop.gpkg')
    rain = read(f'{O}/Rainfall_CHIRPSv3/{iso}_Rainfall_Districts_CHIRPSv3.gpkg')
    en = read(f'{O}/Energy_Screening/{iso}_Solar_Wind_Screening.gpkg')
    fl = read(f'{O}/Forest_Loss/{iso}_Forest_Loss.gpkg')
    soil = read(f'{O}/Soil_Fertility/{iso}_Soil_Fertility.gpkg')
    rd = read(f'{O}/Road_Surface/{iso}_Road_Surface_FRST.gpkg', layer='district_summary')
    g = d.copy()
    for df, cols in [(pop, ['pop_2026', 'density_km2', 'area_ha']), (rain, ['rain_normal_1991_2020_mm', 'anomaly_2025_pct', 'trend_mm_per_decade_1981_2025']),
                     (en, ['pvout_mean', 'wind_ms_mean', 'grid_10km_pct']), (fl, ['tc2000_ha', 'loss_total_ha', 'pct_loss_since_2000']),
                     (soil, ['ph_mean', 'soc_0_20_mean']), (rd, ['paved_km', 'unpaved_km', 'paved_pct'])]:
        if df is not None:
            g = g.merge(df[['shapeID'] + [c for c in cols if c in df]], on='shapeID', how='left')
    area_km2 = g['area_ha'].sum() / 100 if 'area_ha' in g else None
    popn = g['pop_2026'].sum(min_count=1) if 'pop_2026' in g else None
    def wmean(col, w='area_ha'):
        if col not in g or w not in g: return None
        m = g[col].notna() & g[w].notna()
        return float(np.average(g.loc[m, col], weights=g.loc[m, w])) if m.any() else None
    doc_path = f'{O}/Country_Profiles/{iso}_Country_Data_Profile.pdf'
    story = []
    story += [Paragraph(f'{name}', H1), Paragraph(f'Country Data Profile · Lenga Maps · {datetime.date.today():%d %B %Y}', SM), Spacer(1, 4 * mm),
              Paragraph(f'A ready-made summary of {name} from the Lenga Maps catalogue: {len(g)} districts, population, rainfall, '
                        'solar and wind potential, forests, farming, soils, roads and power plants. Every figure comes from a GIS '
                        'dataset you can download from lengamaps.com for deeper analysis.', P)]
    rows = [['Indicator', 'Value', 'Source']]
    rows += [['Districts (geoBoundaries ADM2)', fmt(len(g)), 'geoBoundaries'], ['Area', f'{fmt(area_km2)} km²', 'geodesic'],
             ['Population 2026 (modelled)', fmt(popn), 'WorldPop R2025A'],
             ['Population density', f'{fmt(popn / area_km2 if popn and area_km2 else None, 1)} /km²', 'WorldPop R2025A'],
             ['Rainfall, 1991–2020 normal (area-weighted)', f'{fmt(wmean("rain_normal_1991_2020_mm"))} mm/yr', 'CHIRPS v3.0'],
             ['Rainfall 2025 vs normal (district average)', f'{fmt(g["anomaly_2025_pct"].mean() if "anomaly_2025_pct" in g else None, 1)} %', 'CHIRPS v3.0'],
             ['PV potential (area-weighted)', f'{fmt(wmean("pvout_mean"), 2)} kWh/kWp/day', 'Global Solar Atlas 2026'],
             ['Wind speed at 100 m (area-weighted)', f'{fmt(wmean("wind_ms_mean"), 1)} m/s', 'Global Wind Atlas 4.0'],
             ['Area within 10 km of a mapped power line', f'{fmt(wmean("grid_10km_pct"), 1)} %', 'USGS 2018 ref.'],
             ['Tree cover 2000 / lost 2001–2025', f'{fmt(g["tc2000_ha"].sum(min_count=1) if "tc2000_ha" in g else None)} / {fmt(g["loss_total_ha"].sum(min_count=1) if "loss_total_ha" in g else None)} ha', 'Hansen GFC v1.13'],
             ['Mapped roads: paved / unpaved', f'{fmt(g["paved_km"].sum(min_count=1) if "paved_km" in g else None)} / {fmt(g["unpaved_km"].sum(min_count=1) if "unpaved_km" in g else None)} km', 'FRST (OSM)']]
    story += [Spacer(1, 3 * mm), tbl(rows, [80 * mm, 55 * mm, 40 * mm])]
    story += [Paragraph('District maps', H2),
              maps(g, [('density_km2', 'Population density 2026', 'YlOrRd', 'people/km²'), ('rain_normal_1991_2020_mm', 'Rainfall normal 1991–2020', 'Blues', 'mm/yr'),
                       ('pvout_mean', 'PV power potential', 'YlOrBr', 'kWh/kWp/day'), ('pct_loss_since_2000', 'Tree cover lost since 2000', 'Greens', '% of 2000 cover')]),
              Paragraph('Colour scales run from the 2nd to the 98th percentile of districts. Grey: no data.', SM)]
    # agriculture
    story.append(PageBreak()); story.append(Paragraph('Agriculture', H2))
    cp = f'{O}/Crop_Production/{iso}_Crop_Production.gpkg'
    if os.path.exists(cp):
        cl = pd.read_sql('select crop_name, sum(phys_ha) area, sum(prod_t) prod from crops_long group by crop_name order by prod desc', sqlite3.connect(cp))
        cl = cl[cl['prod'] > 0].head(10)
        story.append(Paragraph('Top crops by production (modelled, 2020)', P))
        story.append(tbl([['Crop', 'Production (t)', 'Physical area (ha)']] + [[r.crop_name, fmt(r.prod), fmt(r.area)] for r in cl.itertuples()], [70 * mm, 50 * mm, 50 * mm]))
    if soil is not None:
        story += [Spacer(1, 3 * mm), Paragraph(f'Topsoil (0–20 cm): area-weighted pH {fmt(wmean("ph_mean"), 1)}, organic carbon {fmt(wmean("soc_0_20_mean"), 1)} g/kg '
                                               '(iSDAsoil, modelled; sample before site decisions).', P)]
    # energy
    story.append(Paragraph('Power plants already built', H2))
    pp = f'{O}/Power_Plants/{iso}_Power_Plants_OSM.gpkg'
    if os.path.exists(pp):
        con = sqlite3.connect(pp)
        s = pd.read_sql('select * from summary_by_source order by plants desc', con)
        story.append(tbl([['Energy source', 'Plants', 'With capacity', 'Tagged MW']] + [[txt(r.energy_source), fmt(r.plants), fmt(r.with_capacity), fmt(r.capacity_mw_known, 1)] for r in s.itertuples()], [60 * mm, 30 * mm, 35 * mm, 35 * mm]))
        top = gpd.read_file(pp, ignore_geometry=True).dropna(subset=['capacity_mw']).sort_values('capacity_mw', ascending=False).head(10)
        if len(top):
            story += [Spacer(1, 3 * mm), Paragraph('Largest mapped plants', P),
                      tbl([['Plant', 'Source', 'MW', 'Operator']] + [[txt(r.name, 'Unnamed'), txt(r.energy_source), fmt(r.capacity_mw, 1), txt(r.operator, n=28)] for r in top.itertuples()], [62 * mm, 28 * mm, 22 * mm, 58 * mm])]
        story.append(Paragraph('OpenStreetMap, community-mapped: totals are tagged values, not official installed capacity.', SM))
    else:
        story.append(Paragraph('No power plants are mapped in OpenStreetMap for this country.', P))
    # district table
    story += [PageBreak(), Paragraph('Districts', H2)]
    cols = [('shapeName', 'District', None), ('pop_2026', 'Pop. 2026', 0), ('density_km2', '/km²', 0), ('rain_normal_1991_2020_mm', 'Rain mm', 0),
            ('anomaly_2025_pct', '2025 %', 0), ('pvout_mean', 'PV', 2), ('paved_pct', 'Paved %', 0), ('pct_loss_since_2000', 'Tree loss %', 1)]
    cols = [c for c in cols if c[0] in g]
    gt = g.sort_values('pop_2026', ascending=False) if 'pop_2026' in g else g
    limit = 60
    rows = [[c[1] for c in cols]] + [[str(r[c[0]])[:24] if c[2] is None else fmt(r[c[0]], c[2]) for c in cols] for _, r in gt.head(limit).iterrows()]
    w = [44 * mm] + [(130 / (len(cols) - 1)) * mm] * (len(cols) - 1)
    story.append(tbl(rows, w, size=7))
    if len(gt) > limit: story.append(Paragraph(f'Largest {limit} of {len(gt)} districts by population. Every district is in the GIS datasets.', SM))
    story += [Spacer(1, 4 * mm), Paragraph('Sources and notes', H2), Paragraph(
        'Boundaries: geoBoundaries gbOpen. Population: WorldPop Global2 R2025A 2026 (CC BY 4.0, modelled). Rainfall: CHIRPS v3.0, CHC UCSB '
        '(public domain). Solar: Global Solar Atlas 2.0, Solargis/ESMAP (CC BY 4.0). Wind: Global Wind Atlas 4.0, DTU/ESMAP (CC BY 4.0). '
        'Power lines: USGS Africa mineral industries & infrastructure (2018 reference). Tree cover: Hansen et al., UMD GFC v1.13 (CC BY 4.0). '
        'Crops: IFPRI MapSPAM 2020 v2r2 (CC BY 4.0, modelled). Soils: iSDAsoil (CC BY 4.0, modelled). Roads: FRST, Zhou et al. 2026 (CC BY 4.0) '
        'on OpenStreetMap (ODbL). Power plants: OpenStreetMap via Overture Maps 2026-10-21 (ODbL). Screening information, not a substitute '
        'for site surveys or official statistics.', SM)]
    def foot(c, doc):
        c.saveState(); c.setFont('Helvetica', 7); c.setFillColor(GREY)
        c.drawString(15 * mm, 10 * mm, f'{name} · Country Data Profile · lengamaps.com'); c.drawRightString(195 * mm, 10 * mm, f'Page {doc.page}')
        c.setFillColor(GOLD); c.rect(0, 287 * mm, 210 * mm, 3 * mm, fill=1, stroke=0); c.restoreState()
    SimpleDocTemplate(doc_path, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=16 * mm,
                      title=f'{name} Country Data Profile', author='Lenga Maps').build(story, onFirstPage=foot, onLaterPages=foot)
    return iso, round(os.path.getsize(doc_path) / 1e6, 2)
if __name__ == '__main__':
    isos = sys.argv[1:] or sorted(COUNTRIES)
    with Pool(3) as p:
        for r in p.imap_unordered(one, isos): print(*r, flush=True)
