"""Shared building blocks for Lenga Maps PDF reports: house style, classed choropleth maps with province outlines,
scale bar and north arrow, charts, tables and the standard closing sections (method, limitations, citation, disclaimer).
Text rule: plain professional English, no dashes as punctuation; ranges are written with 'to'."""
import io, math, datetime, warnings, numpy as np, pandas as pd, geopandas as gpd
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Patch, FancyArrow
import mapclassify
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
warnings.filterwarnings('ignore')
NAVY = colors.HexColor('#0D2B45'); GOLD = colors.HexColor('#F5B800'); GREY = colors.HexColor('#5F6B76')
SS = getSampleStyleSheet()
H1 = ParagraphStyle('h1', parent=SS['Title'], textColor=NAVY, fontSize=20, leading=24, alignment=0, spaceAfter=2)
H2 = ParagraphStyle('h2', parent=SS['Heading2'], textColor=NAVY, fontSize=12.5, spaceBefore=9, spaceAfter=4)
P = ParagraphStyle('p', parent=SS['BodyText'], fontSize=9, leading=12.5)
B = ParagraphStyle('b', parent=P, leftIndent=10, bulletIndent=0)
SM = ParagraphStyle('sm', parent=P, fontSize=7.5, leading=10, textColor=GREY)
TODAY = datetime.date.today()

def fmt(x, d=0):
    if x is None or (isinstance(x, (float, np.floating)) and not np.isfinite(x)): return 'no data'
    return f'{x:,.{d}f}'
def txt(v, default='not recorded', n=60):
    return default if v is None or (isinstance(v, float) and not np.isfinite(v)) or str(v).strip() in ('', 'nan', 'None') else str(v)[:n]
def clean(s):
    """House rule: no dashes as punctuation."""
    return s.replace(' - ', ', ').replace(' – ', ', ').replace(' — ', ', ').replace('–', ' to ').replace('—', ', ')

def table(rows, widths, size=8, align_right_from=1):
    t = Table([[clean(str(c)) for c in r] for r in rows], colWidths=widths, repeatRows=1)
    st = [('FONT', (0, 0), (-1, -1), 'Helvetica', size), ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', size), ('TEXTCOLOR', (0, 0), (-1, 0), NAVY),
          ('LINEBELOW', (0, 0), (-1, 0), 0.6, NAVY), ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F3F5F7')]),
          ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]
    for i in range(align_right_from, len(rows[0])): st.append(('ALIGN', (i, 0), (i, -1), 'RIGHT'))
    t.setStyle(TableStyle(st)); return t

def _scalebar(ax, g):
    x0, y0, x1, y1 = g.total_bounds
    lat = (y0 + y1) / 2; km_per_deg = 111.32 * math.cos(math.radians(lat))
    width_km = (x1 - x0) * km_per_deg
    nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
    L = max([n for n in nice if n <= width_km / 4] or [1])
    deg = L / km_per_deg
    bx, by = x0 + (x1 - x0) * 0.04, y0 + (y1 - y0) * 0.04
    ax.plot([bx, bx + deg], [by, by], color='black', lw=2.2, solid_capstyle='butt')
    ax.plot([bx, bx + deg / 2], [by, by], color='white', lw=1.0, solid_capstyle='butt')
    ax.text(bx + deg / 2, by + (y1 - y0) * 0.015, f'{L:,} km', ha='center', va='bottom', fontsize=6.5)
    nx, ny = x1 - (x1 - x0) * 0.05, y1 - (y1 - y0) * 0.12
    ax.annotate('N', xy=(nx, ny + (y1 - y0) * 0.07), xytext=(nx, ny), ha='center', fontsize=7, fontweight='bold',
                arrowprops=dict(arrowstyle='-|>', color='black', lw=1))

def draw_classed(ax, g, col, title, cmap, unit, k=5, scheme='quantiles', decimals=0, nodata_label='No data', legend_out=True, fs=7):
    """Draw a classed map on ax: k classes (quantiles by default, so each class holds a similar number of districts),
    labelled ranges with district counts, province outlines over district borders, scale bar and north arrow."""
    ax.set_axis_off(); ax.set_title(title, fontsize=fs + 3, color='#0D2B45', loc='left')
    v = pd.to_numeric(g[col], errors='coerce') if col in g else pd.Series(np.nan, index=g.index)
    has = v.notna()
    if has.sum() == 0:
        g.plot(ax=ax, color='#e5e7eb', edgecolor='white', linewidth=0.3)
        ax.text(0.5, 0.5, 'No data for this country', transform=ax.transAxes, ha='center', color='grey')
        return
    vals = v[has].values
    uniq = np.unique(vals)
    kk = int(min(k, len(uniq)))
    if kk < 2:
        bins = [float(uniq.max())]
    else:
        cl = (mapclassify.Quantiles(vals, k=kk) if scheme == 'quantiles' else mapclassify.NaturalBreaks(vals, k=kk))
        bins = list(dict.fromkeys(float(b) for b in cl.bins))
    edges = [float(vals.min())] + bins
    cm = plt.get_cmap(cmap, len(bins))
    idx = np.searchsorted(bins, vals, side='left').clip(0, len(bins) - 1)
    g[~has].plot(ax=ax, color='#e5e7eb', edgecolor='white', linewidth=0.25)
    g[has].plot(ax=ax, color=[cm(i) for i in idx], edgecolor='white', linewidth=0.25)
    if 'adm1_name' in g and 1 < g['adm1_name'].nunique() < len(g):
        try: g.dissolve('adm1_name').boundary.plot(ax=ax, color='#334155', linewidth=0.6)
        except Exception: pass
    g.dissolve().boundary.plot(ax=ax, color='#0f172a', linewidth=0.8)
    f = lambda x: f'{x:,.{decimals}f}'
    counts = [int((idx == i).sum()) for i in range(len(bins))]
    handles = [Patch(facecolor=cm(i), edgecolor='#94a3b8', label=f'{f(edges[i])} to {f(edges[i + 1])}  ({counts[i]})') for i in range(len(bins))]
    if (~has).any(): handles.append(Patch(facecolor='#e5e7eb', edgecolor='#94a3b8', label=f'{nodata_label}  ({int((~has).sum())})'))
    kw = dict(loc='center left', bbox_to_anchor=(1.0, 0.5)) if legend_out else dict(loc='lower right', framealpha=0.85)
    ax.legend(handles=handles, title=f'{unit}  (districts)', fontsize=fs, title_fontsize=fs + 0.5, frameon=not legend_out, **kw)
    _scalebar(ax, g)

def choropleth(g, col, title, cmap, unit, k=5, scheme='quantiles', decimals=0, width_mm=172, height_mm=120, nodata_label='No data'):
    """Full width classed map as a reportlab Image. Districts without data are grey and counted in the legend."""
    fig, ax = plt.subplots(figsize=(7.6, 5.3))
    draw_classed(ax, g, col, title, cmap, unit, k, scheme, decimals, nodata_label)
    fig.tight_layout(); b = io.BytesIO(); fig.savefig(b, format='png', dpi=170); plt.close(fig); b.seek(0)
    return Image(b, width=width_mm * mm, height=height_mm * mm)

def map_grid(g, panels, width_mm=172, height_mm=150):
    """2 x 2 classed maps; panels are (col, title, cmap, unit, decimals)."""
    fig, axs = plt.subplots(2, 2, figsize=(9.6, 8.4))
    for ax, (col, title, cmap, unit, dec) in zip(axs.flat, panels):
        draw_classed(ax, g, col, title, cmap, unit, decimals=dec, legend_out=False, fs=5.5)
    fig.tight_layout(); b = io.BytesIO(); fig.savefig(b, format='png', dpi=160); plt.close(fig); b.seek(0)
    return Image(b, width=width_mm * mm, height=height_mm * mm)

def bar_chart(labels, values, title, unit, color='#0D2B45', horizontal=True, width_mm=172, height_mm=70):
    fig, ax = plt.subplots(figsize=(7.6, 3.1))
    if horizontal:
        ax.barh(range(len(values))[::-1], values, color=color); ax.set_yticks(range(len(values))[::-1]); ax.set_yticklabels(labels, fontsize=7)
        ax.set_xlabel(unit, fontsize=7)
    else:
        ax.bar(range(len(values)), values, color=color); ax.set_xticks(range(len(values))); ax.set_xticklabels(labels, fontsize=6.5, rotation=90)
        ax.set_ylabel(unit, fontsize=7)
    ax.tick_params(labelsize=7); ax.set_title(title, fontsize=9, loc='left', color='#0D2B45')
    from matplotlib.ticker import FuncFormatter
    (ax.xaxis if horizontal else ax.yaxis).set_major_formatter(FuncFormatter(lambda x, _: f'{x:,.0f}' if abs(x) >= 10 else f'{x:,.1f}'))
    for s in ('top', 'right'): ax.spines[s].set_visible(False)
    fig.tight_layout(); b = io.BytesIO(); fig.savefig(b, format='png', dpi=170); plt.close(fig); b.seek(0)
    return Image(b, width=width_mm * mm, height=height_mm * mm)

def line_chart(x, y, title, unit, ref=None, ref_label=None, width_mm=172, height_mm=62):
    fig, ax = plt.subplots(figsize=(7.6, 2.8))
    ax.plot(x, y, color='#1F3A8A', lw=1.4, marker='o', ms=2.5)
    if ref is not None: ax.axhline(ref, color='#B45309', lw=1, ls='--', label=ref_label); ax.legend(fontsize=7, frameon=False)
    ax.set_title(title, fontsize=9, loc='left', color='#0D2B45'); ax.set_ylabel(unit, fontsize=7); ax.tick_params(labelsize=7)
    for s in ('top', 'right'): ax.spines[s].set_visible(False)
    fig.tight_layout(); b = io.BytesIO(); fig.savefig(b, format='png', dpi=170); plt.close(fig); b.seek(0)
    return Image(b, width=width_mm * mm, height=height_mm * mm)

DISCLAIMER = ('This report summarises the GIS file named on its first page and is provided for information, planning and screening. '
              'Figures are estimates derived from the cited third party sources using the method described; they are not official statistics '
              'and can contain errors from the sources or from processing. Boundaries are shown for analysis only and do not imply any position '
              'on the legal status of any territory. Verify values that matter to a decision against primary sources and, where relevant, field '
              'surveys. Lenga Maps provides this report without warranty and accepts no liability for decisions taken on the basis of it.')

def build(path, title, country, gis_file, intro, sections, about, notes):
    """sections: list of flowables or lists; about: dict from the GeoPackage about table (source, citation, licence, method)."""
    story = [Paragraph(clean(f'{title}'), H1), Paragraph(clean(f'{country} · Data report · Lenga Maps · {TODAY:%d %B %Y}'), SM), Spacer(1, 2 * mm),
             Paragraph(clean(f'This report accompanies the GIS file <b>{gis_file}</b> from lengamaps.com. {intro}'), P)]
    for s in sections:
        story += s if isinstance(s, list) else [s]
    story += [Paragraph('Source and method', H2)]
    for k, label in (('source', 'Source'), ('method', 'Method'), ('licence', 'Licence'), ('boundaries', 'Boundaries')):
        if about.get(k): story.append(Paragraph(clean(f'<b>{label}.</b> {about[k]}'), P))
    story += [Paragraph('Notes and limitations', H2)] + [Paragraph(clean(f'• {n}'), B) for n in notes]
    if about.get('citation'): story += [Paragraph('How to cite', H2), Paragraph(clean(f'{about["citation"]} Processed by Lenga Maps (lengamaps.com), {TODAY:%B %Y}.'), SM)]
    story += [Paragraph('Disclaimer', H2), Paragraph(DISCLAIMER, SM)]
    def foot(c, doc):
        c.saveState(); c.setFont('Helvetica', 7); c.setFillColor(GREY)
        c.drawString(15 * mm, 10 * mm, clean(f'{title} · {country} · lengamaps.com')); c.drawRightString(195 * mm, 10 * mm, f'Page {doc.page}')
        c.setFillColor(GOLD); c.rect(0, 287 * mm, 210 * mm, 3 * mm, fill=1, stroke=0); c.restoreState()
    SimpleDocTemplate(path, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=16 * mm,
                      title=f'{title}, {country}', author='Lenga Maps').build(story, onFirstPage=foot, onLaterPages=foot)
